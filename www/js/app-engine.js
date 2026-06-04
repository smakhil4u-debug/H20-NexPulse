/**
 * H2O NexPulse - Central App Engine
 * Manages Auth, Cart, Subscriptions, and Order History
 */

const AppEngine = {
    cart: [],
    subscriptions: [],
    orderHistory: [],
    products: [],
    currentUser: null,
    subState: { productKey: null, freq: 'daily', days: [1, 2, 3, 4, 5, 6, 0] },

    // --- AUTH LOGIC ---
    async handleLogin() {
        const phoneInput = document.getElementById('login-phone');
        if (!phoneInput) return;
        
        const phone = phoneInput.value;
        if (!phone || phone.length < 10) {
            alert("Please enter a valid 10-digit phone number!");
            return;
        }

        const supabase = window.supabaseClient;
        if (!supabase) return;

        // Simple OTP Simulation for Demo
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('phone_number', phone)
            .single();

        if (error) {
            // New user case: Create profile
            const { data: newUser, error: createErr } = await supabase
                .from('customers')
                .upsert({ phone_number: phone, full_name: 'Valued Customer' })
                .select()
                .single();
            
            if (!createErr) this.loginSuccess(newUser);
            else alert("Error creating account: " + createErr.message);
        } else {
            this.loginSuccess(data);
        }
    },

    loginSuccess(user) {
        this.currentUser = user;
        localStorage.setItem('h2o_phone', user.phone_number);
        const overlay = document.getElementById('auth-overlay');
        if (overlay) overlay.classList.add('translate-y-full');
        console.log("Logged in as:", user.phone_number);
        
        // Refresh all personalized data
        this.fetchCustomerAssets();
        this.fetchOrderHistory();
        this.fetchSubscriptions();
    },

    checkSession() {
        const savedPhone = localStorage.getItem('h2o_phone');
        if (savedPhone) {
            const phoneInput = document.getElementById('login-phone');
            if (phoneInput) phoneInput.value = savedPhone;
            this.handleLogin();
        }
    },

    // --- CART LOGIC ---
    addToCart(productKey) {
        const product = this.products.find(p => p.product_key === productKey);
        if (!product) return;

        const existing = this.cart.find(item => item.product_key === productKey);
        if (existing) {
            existing.qty++;
        } else {
            this.cart.push({ ...product, qty: 1 });
        }
        this.syncCartUI();
    },

    removeFromCart(productKey) {
        const index = this.cart.findIndex(item => item.product_key === productKey);
        if (index > -1) {
            if (this.cart[index].qty > 1) {
                this.cart[index].qty--;
            } else {
                this.cart.splice(index, 1);
            }
        }
        this.syncCartUI();
    },

    syncCartUI() {
        const cartTarget = document.getElementById('view-cart');
        if (!cartTarget) return;

        if (this.cart.length === 0) {
            cartTarget.innerHTML = `
                <div class="view-header"><h2>Cart</h2></div>
                <div class="empty-state-view">
                    <div class="empty-vector">🛒❗</div>
                    <h3>Don't leave your cart high & dry</h3>
                    <p>Add some bottles to quench your thirst</p>
                    <button class="action-accent-button" onclick="navigateTo('products')">BROWSE PRODUCTS</button>
                </div>
            `;
            return;
        }

        let cartHTML = `<div class="view-header"><h2>Cart</h2></div><div class="cart-list space-y-4">`;
        let total = 0;

        this.cart.forEach(item => {
            const itemTotal = item.unit_price * item.qty;
            total += itemTotal;
            cartHTML += `
                <div class="product-item-card glass-surface">
                    <div class="product-info-row">
                        <div class="product-details">
                            <h4 class="product-name">${item.display_name}</h4>
                            <p class="product-price text-accent">₹${item.unit_price} x ${item.qty}</p>
                        </div>
                        <div class="flex items-center gap-3 bg-slate-900 rounded-xl p-1 border border-slate-800">
                            <button onclick="AppEngine.removeFromCart('${item.product_key}')" class="w-8 h-8 flex items-center justify-center text-slate-400"><i class="fa-solid fa-minus"></i></button>
                            <span class="font-bold w-4 text-center">${item.qty}</span>
                            <button onclick="AppEngine.addToCart('${item.product_key}')" class="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center"><i class="fa-solid fa-plus text-white"></i></button>
                        </div>
                    </div>
                </div>
            `;
        });

        cartHTML += `
            <div class="cart-summary mt-8 p-6 bg-surface rounded-3xl border border-white/5">
                <div class="flex justify-between mb-4">
                    <span class="text-secondary font-bold">Total Amount</span>
                    <span class="text-xl font-black text-white">₹${total.toFixed(2)}</span>
                </div>
                <button class="action-accent-button" onclick="AppEngine.checkout()">PROCEED TO CHECKOUT</button>
            </div>
        </div>`;
        
        cartTarget.innerHTML = cartHTML;
    },

    // --- SUBSCRIPTION LOGIC ---
    openSubscriptionFlow(productKey) {
        const product = this.products.find(p => p.product_key === productKey);
        if (!product) return;
        
        this.subState.productKey = productKey;
        const nameEl = document.getElementById('sub-product-name');
        if (nameEl) nameEl.innerText = product.display_name;
        
        const modal = document.getElementById('sub-modal');
        if (modal) modal.classList.remove('hidden');
        this.setSubFreq('daily'); // Default
    },

    closeSubscriptionFlow() {
        const modal = document.getElementById('sub-modal');
        if (modal) modal.classList.add('hidden');
    },

    setSubFreq(freq) {
        this.subState.freq = freq;
        const btns = ['daily', 'weekly', 'custom'];
        btns.forEach(f => {
            const el = document.getElementById(`freq-${f}`);
            if (!el) return;
            if (f === freq) {
                el.classList.add('bg-teal-500/10', 'text-teal-400', 'border-teal-500/50');
                el.classList.remove('bg-slate-900', 'text-slate-400');
            } else {
                el.classList.remove('bg-teal-500/10', 'text-teal-400', 'border-teal-500/50');
                el.classList.add('bg-slate-900', 'text-slate-400');
            }
        });

        if (freq === 'daily') this.subState.days = [1, 2, 3, 4, 5, 6, 0];
        else if (freq === 'weekly') this.subState.days = [1]; // Mon only
        
        this.updateDayPickerUI();
    },

    toggleSubDay(day) {
        const index = this.subState.days.indexOf(day);
        if (index > -1) this.subState.days.splice(index, 1);
        else this.subState.days.push(day);
        this.updateDayPickerUI();
    },

    updateDayPickerUI() {
        for (let i = 0; i <= 6; i++) {
            const el = document.getElementById(`day-${i}`);
            if (!el) continue;
            if (this.subState.days.includes(i)) {
                el.classList.add('bg-teal-600', 'border-teal-400', 'text-white');
            } else {
                el.classList.remove('bg-teal-600', 'border-teal-400', 'text-white');
            }
        }
    },

    async confirmSubscription() {
        if (!this.currentUser) return alert("Please login first!");

        const supabase = window.supabaseClient;
        const { error } = await supabase
            .from('subscriptions')
            .insert({
                customer_id: this.currentUser.customer_id,
                product_key: this.subState.productKey,
                frequency: this.subState.freq,
                selected_days: this.subState.days,
                status: 'active'
            });

        if (error) alert("Failed to save schedule: " + error.message);
        else {
            alert("Subscription Activated! 📅");
            this.closeSubscriptionFlow();
            this.fetchSubscriptions();
        }
    },

    async fetchSubscriptions() {
        if (!this.currentUser) return;
        const supabase = window.supabaseClient;
        const { data, error } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('customer_id', this.currentUser.customer_id)
            .eq('status', 'active');

        if (!error && data) {
            this.subscriptions = data;
            this.syncSubscriptionsUI();
        }
    },

    syncSubscriptionsUI() {
        const subTarget = document.getElementById('view-subscriptions');
        if (!subTarget) return;

        if (this.subscriptions.length === 0) {
            subTarget.innerHTML = `
                <div class="view-header"><h2>Subscription</h2></div>
                <div class="sub-toggle-tabs"><button class="sub-tab-btn active">Active</button><button class="sub-tab-btn">Inactive</button></div>
                <div class="empty-state-view"><div class="empty-vector">🫙❌</div><h3>No Active Subscriptions</h3><p>Schedule your first delivery now!</p></div>
            `;
            return;
        }

        let subHTML = `<div class="view-header"><h2>Subscription</h2></div><div class="space-y-4">`;
        this.subscriptions.forEach(sub => {
            const days = sub.selected_days.map(d => ['S','M','T','W','T','F','S'][d]).join(', ');
            subHTML += `
                <div class="glass-card rounded-3xl p-5 border border-teal-500/20">
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-bold text-teal-400">${sub.product_key.replace(/_/g, ' ')}</h4>
                            <p class="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold">${sub.frequency} • ${days}</p>
                        </div>
                        <span class="text-[9px] bg-teal-500/20 text-teal-400 px-2 py-1 rounded-lg font-black">ACTIVE</span>
                    </div>
                </div>
            `;
        });
        subHTML += `</div>`;
        subTarget.innerHTML = subHTML;
    },

    // --- CALENDAR & ORDER HISTORY ---
    async fetchOrderHistory() {
        const supabase = window.supabaseClient;
        if (!supabase || !this.currentUser) return;

        const { data, error } = await supabase
            .from('orders')
            .select(`
                *,
                order_items (
                    quantity,
                    variant,
                    products (display_name)
                )
            `)
            .eq('customer_id', this.currentUser.customer_id)
            .order('created_at', { ascending: false });

        if (!error && data) {
            this.orderHistory = data;
            this.syncOrderHistoryUI();
            this.syncCalendarUI();
        }
    },

    syncOrderHistoryUI() {
        const target = document.getElementById('dynamic-order-history-target');
        if (!target) return;

        if (this.orderHistory.length === 0) {
            target.innerHTML = `<div class="menu-item text-secondary italic"><span><i class="fa-solid fa-box"></i> No orders found</span></div>`;
            return;
        }

        target.innerHTML = '';
        this.orderHistory.forEach(order => {
            const date = new Date(order.created_at).toLocaleDateString();
            const item = document.createElement('div');
            item.className = 'menu-item';
            item.innerHTML = `
                <span><i class="fa-solid fa-box"></i> Order #${order.order_id} - ${date}</span>
                <span class="value font-bold text-accent">₹${order.total_amount}</span>
            `;
            target.appendChild(item);
        });
    },

    syncCalendarUI() {
        console.log("Calendar UI synced.");
    },

    // --- CUSTOMER ASSETS (LEDGER) ---
    async fetchCustomerAssets() {
        const supabase = window.supabaseClient;
        if (!supabase || !this.currentUser) return;

        const { data, error } = await supabase
            .from('customers')
            .select('jars_held, security_deposit')
            .eq('customer_id', this.currentUser.customer_id)
            .single();

        if (!error && data) {
            const jarsHeldEl = document.getElementById('ui-jars-held');
            const depositHeldEl = document.getElementById('ui-deposit-held');
            if (jarsHeldEl) jarsHeldEl.innerText = data.jars_held;
            if (depositHeldEl) depositHeldEl.innerText = `₹${parseFloat(data.security_deposit).toFixed(2)}`;
        }
    },

    // --- CHECKOUT & MAPS ---
    openCheckout() {
        if (!this.currentUser) return alert("Please login to proceed!");
        
        const modal = document.getElementById('checkout-modal');
        if (modal) modal.classList.remove('hidden');
        
        const phoneEl = document.getElementById('cust-phone');
        if (phoneEl) phoneEl.value = this.currentUser.phone_number;
        
        const nameEl = document.getElementById('cust-name');
        if (nameEl) nameEl.value = this.currentUser.full_name || '';
        
        console.log("Checkout opened.");
    },

    closeCheckout() {
        const modal = document.getElementById('checkout-modal');
        if (modal) modal.classList.add('hidden');
    },

    toggleMapPicker() {
        const container = document.getElementById('map-picker-container');
        if (container) container.classList.toggle('hidden');
        console.log("Map picker toggled.");
    },

    async finalOrder() {
        const name = document.getElementById('cust-name').value;
        const address = document.getElementById('cust-address').value;

        if (!name || !address) return alert("Please provide your name and address!");

        const supabase = window.supabaseClient;
        if (!supabase) return;

        // 1. Update Customer Record
        await supabase
            .from('customers')
            .update({ full_name: name })
            .eq('customer_id', this.currentUser.customer_id);

        // 2. Format WhatsApp Message
        let message = `*H2O NexPulse Order*%0A`;
        message += `---------------------------%0A`;
        message += `*Customer:* ${name}%0A`;
        message += `*Phone:* ${this.currentUser.phone_number}%0A`;
        message += `*Address:* ${address}%0A`;
        message += `---------------------------%0A`;
        
        let total = 0;
        this.cart.forEach(item => {
            message += `• ${item.display_name}: ${item.qty}%0A`;
            total += item.unit_price * item.qty;
        });

        message += `---------------------------%0A`;
        message += `*Total Amount:* ₹${total.toFixed(2)}%0A`;
        message += `%0APlease confirm delivery time!`;
        
        const whatsappUrl = `https://wa.me/917483266062?text=${message}`;
        window.open(whatsappUrl, '_blank');
        
        // 3. Clear Cart & Reset UI
        this.cart = [];
        this.syncCartUI();
        this.closeCheckout();
    },

    checkout() {
        this.openCheckout();
    }
};

window.AppEngine = AppEngine;
