/**
 * H2O NexPulse - Central App Engine
 * Manages Cart, Subscriptions, and Order History
 */

const AppEngine = {
    cart: [],
    subscriptions: [],
    orderHistory: [],
    products: [],

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
        console.log("Cart:", this.cart);
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
    async fetchSubscriptions() {
        // Placeholder for future Supabase sub fetching
        this.syncSubscriptionsUI();
    },

    syncSubscriptionsUI() {
        const subTarget = document.getElementById('view-subscriptions');
        if (!subTarget) return;

        // For now, keep the "Ref: 1000298515.jpg" empty state as default
        subTarget.innerHTML = `
            <div class="view-header"><h2>Subscription</h2></div>
            <div class="sub-toggle-tabs">
                <button class="sub-tab-btn active">Active Subscriptions</button>
                <button class="sub-tab-btn">Inactive Subscriptions</button>
            </div>
            <div class="empty-state-view">
                <div class="empty-vector">🫙❌</div>
                <h3>No Active Subscriptions Found</h3>
                <p>Add items to your cart and subscribe them now.</p>
            </div>
        `;
    },

    // --- CALENDAR & ORDER HISTORY ---
    async fetchOrderHistory() {
        const supabase = window.supabaseClient;
        if (!supabase) return;

        // Fetch orders and their items
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
        // Find June 2026 days and mark them based on order dates
        // This is a visual representation mapping orderHistory to calendar cells
        console.log("Calendar UI synced.");
    },

    // --- CUSTOMER ASSETS (LEDGER) ---
    async fetchCustomerAssets() {
        const supabase = window.supabaseClient;
        if (!supabase) return;

        // In a real app, we'd use the logged-in user's phone. 
        // For testing, we fetch the first customer or search by a default phone.
        const userPhone = localStorage.getItem('h2o_phone') || '7483266062';

        const { data, error } = await supabase
            .from('customers')
            .select('jars_held, security_deposit')
            .eq('phone_number', userPhone)
            .single();

        if (!error && data) {
            document.getElementById('ui-jars-held').innerText = data.jars_held;
            document.getElementById('ui-deposit-held').innerText = `₹${parseFloat(data.security_deposit).toFixed(2)}`;
        }
    },

    // --- CHECKOUT ---
    checkout() {
        // Link back to the WhatsApp flow or direct DB insertion
        alert("Checkout integration with WhatsApp & Database starting...");
    }
};

window.AppEngine = AppEngine;
