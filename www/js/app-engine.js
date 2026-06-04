/**
 * H2O NexPulse - Central App Engine
 * Manages Auth, Cart, Subscriptions, History, and Real-Time Alerts
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

        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('phone_number', phone)
            .single();

        if (error) {
            const { data: newUser, error: createErr } = await supabase
                .from('customers')
                .upsert({ phone_number: phone, full_name: 'Valued Customer' })
                .select()
                .single();
            
            if (!createErr) this.loginSuccess(newUser);
        } else {
            this.loginSuccess(data);
        }
    },

    loginSuccess(user) {
        this.currentUser = user;
        localStorage.setItem('h2o_phone', user.phone_number);
        const overlay = document.getElementById('auth-overlay');
        if (overlay) overlay.classList.add('translate-y-full');
        
        // --- REAL-TIME NOTIFICATION LISTENER ---
        this.initRealtime();

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

    // --- REAL-TIME ENGINE ---
    initRealtime() {
        const supabase = window.supabaseClient;
        if (!supabase || !this.currentUser) return;

        // Listen for new notifications for this user
        supabase
            .channel('public:notifications')
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'notifications', 
                filter: `customer_id=eq.${this.currentUser.customer_id}` 
            }, payload => {
                this.showNotificationToast(payload.new.message, payload.new.type);
            })
            .subscribe();
        
        console.log("Real-time alert engine active for user:", this.currentUser.customer_id);
    },

    showNotificationToast(msg, type = 'alert') {
        const toast = document.createElement('div');
        toast.className = `fixed top-12 left-1/2 -translate-x-1/2 w-[90%] max-w-xs z-[500] p-5 rounded-3xl border shadow-2xl transition-all duration-500 translate-y-[-100px] flex items-center gap-4`;
        
        if (type === 'reminder') {
            toast.classList.add('bg-amber-950', 'border-amber-500/50', 'text-amber-200');
            toast.innerHTML = `<i class="fa-solid fa-bell-concierge text-amber-400"></i> <div class="flex-1 font-bold text-xs">${msg}</div>`;
        } else {
            toast.classList.add('bg-slate-900', 'border-teal-500/50', 'text-white');
            toast.innerHTML = `<i class="fa-solid fa-circle-info text-teal-400"></i> <div class="flex-1 font-bold text-xs">${msg}</div>`;
        }

        document.body.appendChild(toast);
        setTimeout(() => toast.classList.remove('translate-y-[-100px]'), 100);
        setTimeout(() => {
            toast.classList.add('translate-y-[-100px]', 'opacity-0');
            setTimeout(() => toast.remove(), 600);
        }, 5000);
    },

    // --- HELP DESK INTENTS ---
    openHelp(type) {
        if (type === 'chat') {
            window.open(`https://wa.me/917483266062?text=Hi, I need assistance with my H2O NexPulse order.`, '_blank');
        } else if (type === 'call') {
            window.location.href = "tel:7483266062";
        } else if (type === 'email') {
            window.location.href = "mailto:smakhil4u@gmail.com?subject=H2O NexPulse Support";
        }
    },

    // --- CART LOGIC ---
    addToCart(productKey) {
        const product = this.products.find(p => p.product_key === productKey);
        if (!product) return;

        const existing = this.cart.find(item => item.product_key === productKey);
        if (existing) existing.qty++;
        else this.cart.push({ ...product, qty: 1 });
        
        this.syncCartUI();
    },

    removeFromCart(productKey) {
        const index = this.cart.findIndex(item => item.product_key === productKey);
        if (index > -1) {
            if (this.cart[index].qty > 1) this.cart[index].qty--;
            else this.cart.splice(index, 1);
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

        let total = 0;
        let cartHTML = `<div class="view-header"><h2>Cart</h2></div><div class="cart-list space-y-4">`;
        this.cart.forEach(item => {
            total += item.unit_price * item.qty;
            cartHTML += `
                <div class="product-item-card glass-surface">
                    <div class="product-info-row flex justify-between items-center">
                        <div class="product-details">
                            <h4 class="product-name font-bold text-sm">${item.display_name}</h4>
                            <p class="product-price text-accent text-xs">₹${item.unit_price} x ${item.qty}</p>
                        </div>
                        <div class="flex items-center gap-3 bg-slate-900 rounded-xl p-1 border border-slate-800">
                            <button onclick="AppEngine.removeFromCart('${item.product_key}')" class="w-8 h-8 flex items-center justify-center text-slate-400"><i class="fa-solid fa-minus text-[10px]"></i></button>
                            <span class="font-bold w-4 text-center text-xs">${item.qty}</span>
                            <button onclick="AppEngine.addToCart('${item.product_key}')" class="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center"><i class="fa-solid fa-plus text-[10px] text-white"></i></button>
                        </div>
                    </div>
                </div>`;
        });
        cartHTML += `
            <div class="cart-summary mt-8 p-6 bg-slate-900/50 rounded-3xl border border-white/5">
                <div class="flex justify-between mb-4"><span class="text-secondary font-bold text-sm">Total</span><span class="text-xl font-black">₹${total.toFixed(2)}</span></div>
                <button class="action-accent-button" onclick="AppEngine.checkout()">PLACE ORDER VIA WHATSAPP</button>
            </div>
        </div>`;
        cartTarget.innerHTML = cartHTML;
    },

    // --- SUBSCRIPTION LOGIC ---
    openSubscriptionFlow(productKey) {
        const product = this.products.find(p => p.product_key === productKey);
        if (!product) return;
        this.subState.productKey = productKey;
        document.getElementById('sub-product-name').innerText = product.display_name;
        document.getElementById('sub-modal').classList.remove('hidden');
        this.setSubFreq('daily');
    },

    closeSubscriptionFlow() { document.getElementById('sub-modal').classList.add('hidden'); },

    setSubFreq(freq) {
        this.subState.freq = freq;
        ['daily', 'weekly', 'custom'].forEach(f => {
            const el = document.getElementById(`freq-${f}`);
            if (f === freq) el.classList.add('bg-teal-500/10', 'text-teal-400', 'border-teal-500/50');
            else el.classList.remove('bg-teal-500/10', 'text-teal-400', 'border-teal-500/50');
        });
        this.subState.days = (freq === 'daily') ? [1,2,3,4,5,6,0] : (freq === 'weekly' ? [1] : this.subState.days);
        this.updateDayPickerUI();
    },

    toggleSubDay(day) {
        const index = this.subState.days.indexOf(day);
        if (index > -1) this.subState.days.splice(index, 1); else this.subState.days.push(day);
        this.updateDayPickerUI();
    },

    updateDayPickerUI() {
        for (let i = 0; i <= 6; i++) {
            const el = document.getElementById(`day-${i}`);
            if (this.subState.days.includes(i)) el.classList.add('bg-teal-600', 'border-teal-400', 'text-white');
            else el.classList.remove('bg-teal-600', 'border-teal-400', 'text-white');
        }
    },

    async confirmSubscription() {
        if (!this.currentUser) return alert("Please login first!");
        const supabase = window.supabaseClient;
        const { error } = await supabase.from('subscriptions').insert({ customer_id: this.currentUser.customer_id, product_key: this.subState.productKey, frequency: this.subState.freq, selected_days: this.subState.days });
        if (!error) { alert("Subscription Activated! 📅"); this.closeSubscriptionFlow(); this.fetchSubscriptions(); }
    },

    async fetchSubscriptions() {
        if (!this.currentUser) return;
        const { data, error } = await window.supabaseClient.from('subscriptions').select('*').eq('customer_id', this.currentUser.customer_id).eq('status', 'active');
        if (!error) { this.subscriptions = data; this.syncSubscriptionsUI(); }
    },

    syncSubscriptionsUI() {
        const target = document.getElementById('view-subscriptions');
        if (!target) return;
        if (this.subscriptions.length === 0) {
            target.innerHTML = `<div class="view-header"><h2>Subscription</h2></div><div class="empty-state-view"><div class="empty-vector">🫙❌</div><h3>No Active Subscriptions</h3></div>`;
            return;
        }
        let html = `<div class="view-header"><h2>Subscription</h2></div><div class="space-y-4">`;
        this.subscriptions.forEach(sub => {
            const days = sub.selected_days.map(d => ['S','M','T','W','T','F','S'][d]).join(', ');
            html += `<div class="glass-card rounded-3xl p-5 border border-teal-500/20"><h4 class="font-bold text-teal-400">${sub.product_key}</h4><p class="text-[10px] text-slate-500 uppercase">${sub.frequency} • ${days}</p></div>`;
        });
        target.innerHTML = html + `</div>`;
    },

    // --- ASSETS & HISTORY ---
    async fetchOrderHistory() {
        if (!this.currentUser) return;
        const { data, error } = await window.supabaseClient.from('orders').select('*, order_items(quantity, products(display_name))').eq('customer_id', this.currentUser.customer_id).order('created_at', { ascending: false });
        if (!error) { this.orderHistory = data; this.syncOrderHistoryUI(); }
    },

    syncOrderHistoryUI() {
        const target = document.getElementById('dynamic-order-history-target');
        if (!target) return;
        target.innerHTML = '';
        this.orderHistory.forEach(o => {
            const item = document.createElement('div'); item.className = 'menu-item';
            item.innerHTML = `<span><i class="fa-solid fa-box"></i> Order #${o.order_id}</span><span class="value font-bold text-accent">₹${o.total_amount}</span>`;
            target.appendChild(item);
        });
    },

    async fetchCustomerAssets() {
        if (!this.currentUser) return;
        const { data, error } = await window.supabaseClient.from('customers').select('jars_held, security_deposit').eq('customer_id', this.currentUser.customer_id).single();
        if (!error) { document.getElementById('ui-jars-held').innerText = data.jars_held; document.getElementById('ui-deposit-held').innerText = `₹${data.security_deposit}`; }
    },

    checkout() {
        let msg = `*H2O NexPulse Order*%0A*Customer:* ${this.currentUser.full_name}%0A`;
        this.cart.forEach(i => msg += `• ${i.display_name}: ${i.qty}%0A`);
        window.open(`https://wa.me/917483266062?text=${msg}`, '_blank');
    }
};
window.AppEngine = AppEngine;
