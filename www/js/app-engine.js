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
    confirmationResult: null,
    map: null,
    marker: null,
    currentCoords: { lat: 15.1394, lng: 76.9214 }, // Default Ballari

    // --- LOCATION LOGIC ---
    supportedZones: [
        { name: "Ballari", lat: 15.1394, lng: 76.9214, radiusKm: 30 } // 30km radius around Ballari
    ],

    initLocation() {
        if (!navigator.geolocation) {
            console.error("Geolocation not supported");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                this.currentCoords = { lat: latitude, lng: longitude };
                console.log("Device Location:", latitude, longitude);
                this.checkServiceAvailability(latitude, longitude);
                
                // If map is already open, move it
                if (this.map) {
                    this.map.setView([latitude, longitude], 16);
                    this.marker.setLatLng([latitude, longitude]);
                }
            },
            (err) => {
                console.warn("Location Access Denied or Failed:", err.message);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    },

    checkServiceAvailability(lat, lng) {
        let isSupported = false;
        let zoneName = "";
        
        this.supportedZones.forEach(zone => {
            const distance = this.calculateDistance(lat, lng, zone.lat, zone.lng);
            if (distance <= zone.radiusKm) {
                isSupported = true;
                zoneName = zone.name;
            }
        });

        if (isSupported) {
            console.log("Service available in:", zoneName);
            this.toggleServiceAlerts(false);
            this.updateLocationUI(zoneName);
        } else {
            console.log("Service NOT available here.");
            this.toggleServiceAlerts(true);
        }
    },

    updateLocationUI(name) {
        const locTitle = document.querySelector('.location-banner h4');
        if (locTitle) locTitle.innerHTML = `${name} <i class="fa-solid fa-chevron-down text-xs"></i>`;
    },

    toggleServiceAlerts(show) {
        const homeAlert = document.getElementById('alert-home');
        const productAlert = document.getElementById('alert-products');
        
        if (show) {
            if (homeAlert) homeAlert.classList.remove('hidden');
            if (productAlert) productAlert.classList.remove('hidden');
        } else {
            if (homeAlert) homeAlert.classList.add('hidden');
            if (productAlert) productAlert.classList.add('hidden');
        }
    },

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    // --- AUTH LOGIC (Firebase OTP) ---
    async handleLogin() {
        const btn = document.getElementById('btn-login-action');
        const phoneInput = document.getElementById('login-phone');
        const otpInput = document.getElementById('login-otp');
        const otpGroup = document.getElementById('otp-group');
        
        const phone = "+91" + phoneInput.value.trim();

        // STEP 1: Request SMS Code
        if (!this.confirmationResult) {
            if (phone.length < 13) return alert("Enter valid 10-digit number");
            
            try {
                // BUG FIX: Ensure ReCAPTCHA is ready
                const verifier = typeof initRecaptcha === 'function' ? initRecaptcha() : window.recaptchaVerifier;
                if (!verifier) throw new Error("Security verification (ReCAPTCHA) failed to load.");

                btn.innerText = "SENDING...";
                btn.disabled = true;

                console.log("Firebase: Sending SMS to", phone);
                this.confirmationResult = await firebase.auth().signInWithPhoneNumber(phone, verifier);
                
                // Show OTP field
                otpGroup.classList.remove('hidden');
                phoneInput.parentElement.parentElement.classList.add('opacity-50', 'pointer-events-none');
                btn.innerText = "VERIFY CODE";
                btn.disabled = false;
                alert("Code sent to your phone! 📱");
            } catch (err) {
                console.error("Firebase Critical Error:", err.code, err.message);
                
                // PRO-ACTIVE DEBUGGER
                let hint = "Check Firebase Console Settings.";
                if (err.code === 'auth/operation-not-allowed') hint = "You must ENABLE 'Phone' in Authentication > Sign-in method AND enable 'India' in Settings > SMS Region Policy.";
                if (err.code === 'auth/invalid-app-credential') hint = "Check your API Key and Auth Domain in firebase-init.js";
                if (err.code === 'auth/unauthorized-domain') hint = "Add 'localhost' and your GitHub domain to Authentication > Settings > Authorized domains.";

                alert(`Failed to send code:\n\nERROR: ${err.code}\n\nHINT: ${hint}`);
                
                btn.innerText = "GET START CODE";
                btn.disabled = false;
            }
        } 
        // STEP 2: Verify SMS Code
        else {
            const code = otpInput.value.trim();
            if (code.length < 6) return alert("Enter 6-digit code");

            try {
                btn.innerText = "VERIFYING...";
                btn.disabled = true;

                const result = await this.confirmationResult.confirm(code);
                const user = result.user;
                console.log("Firebase Auth Success:", user.phoneNumber);

                // Now sync with Supabase
                btn.innerText = "SYNCING PROFILE...";
                await this.syncWithSupabase(user.phoneNumber.replace('+91', ''));
            } catch (err) {
                console.error("Verification failed:", err);
                alert("Invalid code. Try again!");
                btn.innerText = "VERIFY CODE";
                btn.disabled = false;
            }
        }
    },

    async syncWithSupabase(cleanPhone) {
        console.log("Syncing with Supabase for phone:", cleanPhone);
        const supabase = window.supabaseClient;
        
        try {
            const { data, error } = await supabase
                .from('customers')
                .select('*')
                .eq('phone_number', cleanPhone)
                .maybeSingle();

            if (error) throw error;

            if (!data) {
                console.log("Creating new profile for:", cleanPhone);
                const { data: newUser, error: createErr } = await supabase
                    .from('customers')
                    .upsert({ phone_number: cleanPhone, full_name: 'NexPulse Member' })
                    .select().single();
                
                if (createErr) throw createErr;
                this.loginSuccess(newUser);
            } else {
                console.log("Existing user found:", data.customer_id);
                this.loginSuccess(data);
            }
        } catch (e) {
            console.error("Supabase Sync Failed:", e);
            
            let errorMessage = "Database Sync Failed.";
            if (e.message && (e.message.includes("customers") || e.message.includes("schema cache"))) {
                errorMessage += "\n\nCRITICAL: The 'customers' table was not found in Supabase.\n\nHINT: Go to your Supabase SQL Editor and run the table creation script.";
            } else if (e.message) {
                errorMessage += `\n\nERROR: ${e.message}`;
            } else {
                errorMessage += "\n\nPlease check your internet connection.";
            }

            alert(errorMessage);
            const btn = document.getElementById('btn-login-action');
            if (btn) {
                btn.innerText = "RETRY SYNC";
                btn.disabled = false;
            }
        }
    },

    loginSuccess(user) {
        this.currentUser = user;
        localStorage.setItem('h2o_phone', user.phone_number);
        
        // BUG FIX: Ensure overlay is hidden and screen is reset
        const overlay = document.getElementById('auth-overlay');
        if (overlay) {
            overlay.classList.add('translate-y-full');
            overlay.style.pointerEvents = 'none';
        }
        
        console.log("LOGIN COMPLETE. Welcome:", user.phone_number);
        
        // Start background engines
        this.initRealtime();
        this.initLocation();
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
            if (!el) return;
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
            if (!el) continue;
            if (this.subState.days.includes(i)) el.classList.add('bg-teal-600', 'border-teal-400', 'text-white');
            else el.classList.remove('bg-teal-600', 'border-teal-400', 'text-white');
        }
    },

    async confirmSubscription() {
        if (!this.currentUser) return alert("Please login first!");
        const supabase = window.supabaseClient;
        const { error } = await supabase.from('subscriptions').insert({ customer_id: this.currentUser.customer_id, product_key: this.subState.productKey, frequency: this.subState.freq, selected_days: this.subState.days });
        if (!error) { alert("Subscription Activated! 📅"); this.closeSubscriptionFlow(); this.fetchSubscriptions(); }
        else { alert("Error: " + error.message); }
    },

    async fetchSubscriptions() {
        if (!this.currentUser) return;
        const { data, error } = await window.supabaseClient.from('subscriptions').select('*').eq('customer_id', this.currentUser.customer_id).eq('status', 'active');
        if (!error) { 
            this.subscriptions = data; 
            this.syncSubscriptionsUI(); 
        } else {
            console.error("Fetch Subscriptions Failed:", error);
        }
    },

    syncSubscriptionsUI() {
        const target = document.getElementById('view-subscriptions');
        if (!target) return;
        if (this.subscriptions.length === 0) {
            target.innerHTML = `
                <div class="view-header"><h2>Subscription</h2></div>
                <div class="sub-toggle-tabs"><button class="sub-tab-btn active">Active</button><button class="sub-tab-btn">Inactive</button></div>
                <div class="empty-state-view"><div class="empty-vector">🫙❌</div><h3>No Active Subscriptions</h3><p>Schedule your first delivery now!</p></div>
            `;
            return;
        }
        let html = `<div class="view-header"><h2>Subscription</h2></div><div class="space-y-4">`;
        this.subscriptions.forEach(sub => {
            const days = sub.selected_days.map(d => ['S','M','T','W','T','F','S'][d]).join(', ');
            html += `<div class="glass-card rounded-3xl p-5 border border-teal-500/20"><h4 class="font-bold text-teal-400">${sub.product_key.replace(/_/g, ' ')}</h4><p class="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1">${sub.frequency} • ${days}</p></div>`;
        });
        target.innerHTML = html + `</div>`;
    },

    // --- ASSETS & HISTORY ---
    async fetchOrderHistory() {
        if (!this.currentUser) return;
        const { data, error } = await window.supabaseClient.from('orders').select('*, order_items(quantity, products(display_name))').eq('customer_id', this.currentUser.customer_id).order('created_at', { ascending: false });
        if (!error) { 
            this.orderHistory = data; 
            this.syncOrderHistoryUI(); 
        } else {
            console.error("Fetch Order History Failed:", error);
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
        this.orderHistory.forEach(o => {
            const item = document.createElement('div'); item.className = 'menu-item';
            item.innerHTML = `<span><i class="fa-solid fa-box"></i> Order #${o.order_id}</span><span class="value font-bold text-accent">₹${o.total_amount}</span>`;
            target.appendChild(item);
        });
        this.syncCalendarUI();
    },

    syncCalendarUI() {
        console.log("Calendar UI synced.");
    },

    async fetchCustomerAssets() {
        if (!this.currentUser) return;
        const { data, error } = await window.supabaseClient.from('customers').select('jars_held, security_deposit').eq('customer_id', this.currentUser.customer_id).single();
        if (!error && data) { 
            const jarsEl = document.getElementById('ui-jars-held');
            const depEl = document.getElementById('ui-deposit-held');
            if (jarsEl) jarsEl.innerText = data.jars_held; 
            if (depEl) depEl.innerText = `₹${parseFloat(data.security_deposit).toFixed(2)}`; 
        } else if (error) {
            console.error("Fetch Customer Assets Failed:", error);
        }
    },

    // --- CHECKOUT ---
    openCheckout() {
        if (!this.currentUser) return alert("Please login to proceed!");
        const modal = document.getElementById('checkout-modal');
        if (modal) modal.classList.remove('hidden');
        const phoneEl = document.getElementById('cust-phone');
        if (phoneEl) phoneEl.value = this.currentUser.phone_number;
        const nameEl = document.getElementById('cust-name');
        if (nameEl) nameEl.value = this.currentUser.full_name || '';
    },

    closeCheckout() {
        const modal = document.getElementById('checkout-modal');
        if (modal) modal.classList.add('hidden');
    },

    // --- MAP PICKER ENGINE ---
    initMap() {
        if (this.map) return;

        // Initialize Leaflet Map
        this.map = L.map('map-canvas').setView([this.currentCoords.lat, this.currentCoords.lng], 16);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(this.map);

        // Center crosshair marker
        const center = this.map.getCenter();
        this.marker = L.marker(center, { draggable: false }).addTo(this.map);

        // Update marker as map moves
        this.map.on('move', () => {
            this.marker.setLatLng(this.map.getCenter());
        });

        // When map stops moving, fetch the address
        this.map.on('moveend', () => {
            const pos = this.map.getCenter();
            this.reverseGeocode(pos.lat, pos.lng);
        });

        // Initial address fetch
        this.reverseGeocode(this.currentCoords.lat, this.currentCoords.lng);
    },

    async reverseGeocode(lat, lng) {
        const addressEl = document.getElementById('cust-address');
        if (!addressEl) return;

        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
            const data = await response.json();
            
            if (data && data.display_name) {
                // Clean up the address a bit
                const addr = data.display_name;
                addressEl.value = addr;
                console.log("Auto-resolved address:", addr);
            }
        } catch (err) {
            console.error("Reverse geocoding failed:", err);
        }
    },

    toggleMapPicker() {
        const container = document.getElementById('map-picker-container');
        if (!container) return;

        container.classList.toggle('hidden');
        
        if (!container.classList.contains('hidden')) {
            // Wait for transition/render then init map
            setTimeout(() => {
                this.initMap();
                if (this.map) this.map.invalidateSize(); // Fix gray boxes
            }, 100);
        }
    },

    async finalOrder() {
        const name = document.getElementById('cust-name').value;
        const address = document.getElementById('cust-address').value;
        if (!name || !address) return alert("Please provide your name and address!");

        const supabase = window.supabaseClient;
        const { error: updateErr } = await supabase.from('customers').update({ full_name: name }).eq('customer_id', this.currentUser.customer_id);
        if (updateErr) console.error("Update Customer Name Failed:", updateErr);

        let msg = `*H2O NexPulse Order*%0A*Customer:* ${name}%0A*Phone:* ${this.currentUser.phone_number}%0A*Address:* ${address}%0A---------------------------%0A`;
        let total = 0;
        this.cart.forEach(i => { msg += `• ${i.display_name}: ${i.qty}%0A`; total += i.unit_price * i.qty; });
        msg += `---------------------------%0A*Total:* ₹${total.toFixed(2)}`;
        
        window.open(`https://wa.me/917483266062?text=${msg}`, '_blank');
        this.cart = []; this.syncCartUI(); this.closeCheckout();
    },

    checkout() { this.openCheckout(); }
};
window.AppEngine = AppEngine;
