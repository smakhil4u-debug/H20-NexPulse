/**
 * H2O NexPulse - Central App Engine (Consolidated & Optimized)
 */
const AppEngine = {
    cart: [], subscriptions: [], products: [], currentUser: null,
    subState: { productKey: null, freq: 'daily', days: [1,2,3,4,5,6,0] },
    currentCoords: { lat: 15.1394, lng: 76.9214 },
    savedAddresses: [], currentAddrCategory: 'Home', systemSettings: {},
    IS_PRODUCTION: false,
    MerchantConfig: { merchant_upi_id: "7483266062@ybl", merchant_name: "H2O NexPulse", default_deposit_amount: 2000 },
    ProductionHub: { lat: 15.1384, lng: 76.9244 }, MaxDeliveryRadiusKm: 35,
    activeCouponTab: 'collected', expandedCouponCode: null,
    activeOffers: [
        { code: 'FIRSTJARFREE', discount: 'FREE 20L Water Jar', description: 'Get your first 20L jar free.', terms: 'New accounts only.' },
        { code: 'FREEJARDEPOSIT', discount: 'Waived Initial Deposit', description: 'Zero upfront fee on first 2 jars.', terms: 'Subscription required.' }
    ],

    // --- AUTH ---
    goToOtpStep() {
        const ph = document.getElementById('login-phone').value;
        if(ph.length<10) return alert("Invalid number");
        document.getElementById('login-step-phone').classList.add('hidden');
        document.getElementById('login-step-otp').classList.remove('hidden');
        document.getElementById('otp-phone-display').innerText = `Sent to +91 ${ph}`;
    },
    goToPhoneStep() {
        document.getElementById('login-step-phone').classList.remove('hidden');
        document.getElementById('login-step-otp').classList.add('hidden');
    },
    async handleMockLogin() {
        if(document.getElementById('login-otp').value.length<4) return alert("Invalid code");
        this.loginSuccess({ customer_id: 1, phone_number: document.getElementById('login-phone').value || "7483266062", full_name: 'Member', created_at: new Date().toISOString(), deposit_paid: true });
    },
    loginSuccess(user) {
        this.currentUser = user;
        const ov = document.getElementById('auth-overlay');
        if(ov) { ov.classList.add('translate-y-full'); setTimeout(()=>ov.remove(), 500); }
        this.initRealtime(); this.initLocation(); this.syncProfileUI(); this.fetchCustomerAssets(); this.fetchSubscriptions();
    },

    // --- MAP ENGINE (Dual-Layer Instant-On) ---
    leafletMap: null, leafletMarker: null, geofenceCircle: null, isLeafletActive: false,
    initLeafletMap() {
        this.renderFallbackMap();
        if (window.L && !this.leafletMap) {
            try {
                const canvas = document.getElementById('interactive-map-canvas');
                if(!canvas) return; canvas.innerHTML = "";
                this.leafletMap = L.map('interactive-map-canvas', { zoomControl: false, attributionControl: false }).setView([this.ProductionHub.lat, this.ProductionHub.lng], 12);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.leafletMap);
                this.geofenceCircle = L.circle([this.ProductionHub.lat, this.ProductionHub.lng], { color: '#00A896', fillColor: '#00BCD4', fillOpacity: 0.08, radius: 35000 }).addTo(this.leafletMap);
                this.leafletMarker = L.marker([this.ProductionHub.lat, this.ProductionHub.lng]).addTo(this.leafletMap);
                this.leafletMap.on('click', (e) => this.processNewLocationCoordinates(e.latlng.lat, e.latlng.lng));
                this.isLeafletActive = true; this.processNewLocationCoordinates(this.ProductionHub.lat, this.ProductionHub.lng);
                setTimeout(()=>this.leafletMap.invalidateSize(), 300);
            } catch(e) { this.isLeafletActive = false; this.renderFallbackMap(); }
        }
    },
    renderFallbackMap() {
        if(this.isLeafletActive) return;
        const c = document.getElementById('interactive-map-canvas'); if(!c) return;
        c.innerHTML = `<div onclick="AppEngine.handleFallbackMapClick(event)" class="w-full h-full relative bg-[#0B111E] overflow-hidden cursor-crosshair">
            <div class="absolute inset-0 opacity-[0.12]" style="background-image: linear-gradient(#00BCD4 1px, transparent 1px), linear-gradient(90deg, #00BCD4 1px, transparent 1px); background-size: 24px 24px;"></div>
            <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none z-10">
                <div class="w-3.5 h-3.5 rounded-full bg-teal-400 border-2 border-white shadow-[0_0_8px_#00BCD4]"></div>
                <span class="text-[8px] font-bold text-teal-400 bg-[#0A0E1A] px-1 py-0.5 rounded border border-teal-900 mt-1 uppercase">Ballari Hub</span>
            </div>
            <div id="fallback-boundary-ring" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[270px] h-[270px] border-2 border-dashed border-[#00A896]/40 rounded-full pointer-events-none flex items-center justify-center bg-teal-500/[0.01]">
                <span class="text-[8px] text-gray-600 font-bold uppercase tracking-widest mt-48">35KM Boundary Line</span>
            </div>
            <div id="fallback-pin" class="absolute -translate-x-1/2 -translate-y-[90%] transition-all duration-150 pointer-events-none z-30" style="left: 50%; top: 50%;">
                <i id="fallback-pin-icon" class="fa-solid fa-map-pin text-[#00BCD4] text-4xl drop-shadow-2xl"></i>
            </div>
            <div class="absolute top-4 right-4 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-full backdrop-blur-md"><p class="text-[8px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2"><i class="fa-solid fa-bolt animate-pulse"></i> Instant-On Active</p></div>
        </div>`;
        this.processNewLocationCoordinates(this.ProductionHub.lat, this.ProductionHub.lng);
    },
    handleFallbackMapClick(e) {
        if(this.isLeafletActive) return;
        const rect = document.getElementById('interactive-map-canvas').getBoundingClientRect();
        const xPct = ((e.clientX - rect.left) / rect.width) * 100;
        const yPct = ((e.clientY - rect.top) / rect.height) * 100;
        document.getElementById('fallback-pin').style.left = xPct+'%';
        document.getElementById('fallback-pin').style.top = yPct+'%';
        this.processNewLocationCoordinates(this.ProductionHub.lat + (50-yPct)*0.016, this.ProductionHub.lng + (xPct-50)*0.016);
    },
    processNewLocationCoordinates(lat, lng) {
        const dist = this.calculateDistance(this.ProductionHub.lat, this.ProductionHub.lng, lat, lng);
        const out = dist > 35;
        const addr = out ? `Out of Service Range [${lat.toFixed(4)}, ${lng.toFixed(4)}]` : `H2ONEXPULSE Area Hub, Registered Coordinates [${lat.toFixed(4)}, ${lng.toFixed(4)}]`;
        document.getElementById('map-address-display').innerText = addr;
        document.getElementById('map-distance-text').innerText = `Radius Check: ${dist.toFixed(2)} KM from Hub`;
        const b = document.getElementById('map-distance-banner');
        if(out) {
            b.className = "p-3.5 rounded-xl border flex items-start gap-3 bg-red-950/40 border-red-900/60 text-red-400";
            document.getElementById('btn-save-interactive-map').disabled = true;
            document.getElementById('btn-save-interactive-map').style.opacity = '0.2';
        } else {
            b.className = "p-3.5 rounded-xl border flex items-start gap-3 bg-teal-950/30 border-teal-900/50 text-teal-400";
            document.getElementById('btn-save-interactive-map').disabled = false;
            document.getElementById('btn-save-interactive-map').style.opacity = '1';
        }
        this.pendingInteractiveAddress = { address: addr, coords: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
    },
    saveInteractiveLocation() {
        const d = this.pendingInteractiveAddress; if(!d) return;
        this.savedAddresses.push({ address: d.address, category: 'Others', coords: d.coords });
        localStorage.setItem('h2o_last_address', d.address);
        this.toggleServiceAlerts(false); this.updateLocationUI("Ballari"); navigateTo('home');
    },

    // --- CART & PRODUCTS ---
    addToCart(k) {
        const p = this.products.find(x => x.product_key === k); if(!p) return;
        const ex = this.cart.find(x => x.product_key === k);
        if(ex) ex.qty++; else this.cart.push({...p, qty: 1});
        this.syncCartUI(); if(typeof syncProductUI === 'function') syncProductUI();
    },
    removeFromCart(k) {
        const idx = this.cart.findIndex(x => x.product_key === k);
        if(idx > -1) { if(this.cart[idx].qty > 1) this.cart[idx].qty--; else this.cart.splice(idx, 1); }
        this.syncCartUI(); if(typeof syncProductUI === 'function') syncProductUI();
    },
    getQty(k) { const item = this.cart.find(i => i.product_key === k); return item ? item.qty : 0; },
    syncCartUI() {
        const t = document.getElementById('view-cart'); if(!t) return;
        if(this.cart.length === 0) { t.innerHTML = `<div class="view-header"><h2>Cart</h2></div><div class="empty-state-view">🛒❗<h3>Cart is empty</h3><button class="action-accent-button" onclick="navigateTo('products')">BROWSE</button></div>`; return; }
        let total = 0; let html = `<div class="view-header"><h2>Cart</h2></div><div class="space-y-4">`;
        this.cart.forEach(i => { total += i.unit_price * i.qty; html += `<div class="product-item-card glass-surface p-4 flex justify-between"><div>${i.display_name}<br>₹${i.unit_price} x ${i.qty}</div><div class="flex gap-2"><button onclick="AppEngine.removeFromCart('${i.product_key}')">-</button>${i.qty}<button onclick="AppEngine.addToCart('${i.product_key}')">+</button></div></div>`; });
        t.innerHTML = html + `<div>Total: ₹${total.toFixed(2)}<br><button onclick="AppEngine.checkout()">CHECKOUT</button></div></div>`;
    },
    checkout() {
        if(this.cart.length === 0) return alert("Cart empty");
        this.openCheckout();
    },

    // --- CHECKOUT MODAL ---
    openCheckout() {
        const m = document.getElementById('checkout-modal'); m.classList.remove('hidden');
        document.getElementById('cust-phone').value = this.currentUser ? this.currentUser.phone_number : "";
    },
    closeCheckout() { document.getElementById('checkout-modal').classList.add('hidden'); },
    toggleMapPicker() { document.getElementById('map-picker-container').classList.toggle('hidden'); if(!this.leafletMap) this.initLeafletMap(); },
    setAddrCategory(c) { this.currentAddrCategory = c; },
    saveAddress() {
        const addr = document.getElementById('cust-address').value;
        if(!addr) return alert("Enter address");
        localStorage.setItem('h2o_last_address', addr);
        this.closeCheckout(); this.showSuccessPopup();
    },

    // --- SUBSCRIPTIONS ---
    async handleSubscriptionIntent(pk) {
        if(!this.currentUser) return alert("Login first");
        this.openSubscriptionFlow(pk);
    },
    openSubscriptionFlow(pk) {
        this.subState.productKey = pk;
        document.getElementById('sub-prod-name').innerText = pk.replace(/_/g, ' ');
        document.getElementById('sub-modal').classList.remove('hidden');
    },
    closeSubscriptionFlow() { document.getElementById('sub-modal').classList.add('hidden'); },
    setSubFreq(f) { this.subState.freq = f; },
    async saveSubscription() {
        const { error } = await window.supabaseClient.from('subscriptions').insert({ customer_id: this.currentUser.customer_id, product_key: this.subState.productKey, frequency: this.subState.freq, selected_days: this.subState.days, status: 'active', quantity: 1 });
        if(!error) { this.closeSubscriptionFlow(); this.fetchSubscriptions(); alert("Subscribed!"); }
    },
    async fetchSubscriptions() {
        if(!this.currentUser) return;
        const { data } = await window.supabaseClient.from('subscriptions').select('*').eq('customer_id', this.currentUser.customer_id);
        if(data) { this.subscriptions = data; this.syncSubscriptionsUI(); }
    },
    syncSubscriptionsUI() {
        const t = document.getElementById('view-subscriptions'); if(!t) return;
        t.innerHTML = `<h2>Subscriptions</h2>` + this.subscriptions.map(s => `<div>${s.product_key} - ${s.status}</div>`).join('');
    },

    // --- UTILS ---
    initRealtime() {
        if(!this.currentUser) return;
        window.supabaseClient.channel('any').on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, payload => this.fetchSubscriptions()).subscribe();
    },
    initLocation() {
        navigator.geolocation.getCurrentPosition(p => {
            this.currentCoords = { lat: p.coords.latitude, lng: p.coords.longitude };
            this.updateLocationUI("Ballari");
        });
    },
    updateLocationUI(n) { const h = document.querySelector('.location-banner h4'); if(h) h.innerHTML = `${n} <i class="fa-solid fa-chevron-down"></i>`; },
    toggleServiceAlerts(s) {
        const h = document.getElementById('alert-home'); const p = document.getElementById('alert-products');
        if(s) { h?.classList.remove('hidden'); p?.classList.remove('hidden'); }
        else { h?.classList.add('hidden'); p?.classList.add('hidden'); }
    },
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; const dLat = (lat2-lat1)*Math.PI/180; const dLon = (lon2-lon1)*Math.PI/180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    },
    syncProfileUI() {
        if(!this.currentUser) return;
        document.querySelectorAll('#profile-display-phone').forEach(e => e.innerText = this.currentUser.phone_number);
    },
    fetchSystemSettings() {}, fetchCustomerAssets() {},
    showNotificationToast(m) { alert(m); },
    showSuccessPopup() { document.getElementById('success-popup').classList.remove('hidden'); },
    closeSuccess() { document.getElementById('success-popup').classList.add('hidden'); navigateTo('home'); },
    filterByCategory(c) { window.setProductFilter(c); navigateTo('products'); },
    openHelp(t) { window.location.href = t==='call' ? "tel:7483266062" : "https://wa.me/7483266062"; },
    initSearch() {}, clearSearch() {}, execPopularSearch() {}, renderSearchResults() {}, checkSession() {},
    populateProfileDetails() {}, toggleProfileEdit() {}, saveProfileDetails() {}, addWalletFunds() {},
    setCouponTab() {}, renderCouponsUI() {}, toggleCouponTerms() {},
    renderSavedAddresses() {}, toggleAddAddressForm() {}, deleteAddress() {}, selectCurrentLocation() {}, addNewAddress() {}
};
window.AppEngine = AppEngine;
