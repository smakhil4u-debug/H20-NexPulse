/**
 * H2O NexPulse - Central App Engine (Comprehensive Master Controller)
 */
const AppEngine = {
    cart: [], subscriptions: [], products: [], currentUser: null,
    subState: { productKey: null, freq: 'daily', days: [1,2,3,4,5,6,0] },
    currentCoords: { lat: 15.1384, lng: 76.9244 }, 
    savedAddresses: [], currentAddrCategory: 'Home', systemSettings: {},
    IS_PRODUCTION: false,
    MerchantConfig: { merchant_upi_id: "7483266062@ybl", merchant_name: "H2O NexPulse", default_deposit_amount: 2000 },
    ProductionHub: { lat: 15.1384, lng: 76.9244 }, MaxDeliveryRadiusKm: 35,
    activeCouponTab: 'collected', expandedCouponCode: null,
    activeOffers: [
        { code: 'FIRSTJARFREE', discount: 'FREE 20L Water Jar', description: 'Get your first 20L jar free.', terms: 'New accounts only.' },
        { code: 'FREEJARDEPOSIT', discount: 'Waived Initial Deposit', description: 'Zero upfront fee on first 2 jars.', terms: 'Subscription required.' }
    ],

    // --- AUTH ENGINE ---
    goToOtpStep() {
        const ph = document.getElementById('login-phone').value;
        if(ph.length < 10) return alert("Enter valid 10-digit number");
        document.getElementById('login-step-phone').classList.add('hidden');
        document.getElementById('login-step-otp').classList.remove('hidden');
        document.getElementById('otp-phone-display').innerText = `Sent to +91 ${ph}`;
        this.showNotificationToast(`Verification code sent to +91 ${ph} 📱`, 'success');
    },
    goToPhoneStep() {
        document.getElementById('login-step-phone').classList.remove('hidden');
        document.getElementById('login-step-otp').classList.add('hidden');
    },
    async handleMockLogin() {
        if(document.getElementById('login-otp').value.length < 4) return alert("Invalid code");
        const ph = document.getElementById('login-phone').value || "7483266062";
        const user = { customer_id: 1, phone_number: ph, full_name: 'Member', created_at: new Date().toISOString(), deposit_paid: true };
        localStorage.setItem('h2o_user_cache', JSON.stringify(user));
        this.loginSuccess(user);
    },
    loginSuccess(user) {
        this.currentUser = user;
        const ov = document.getElementById('auth-overlay');
        if(ov) { ov.classList.add('translate-y-full'); setTimeout(()=>ov.remove(), 500); }
        this.initRealtime(); this.initLocation(); this.syncProfileUI(); this.fetchCustomerAssets(); this.fetchSubscriptions();
        this.showNotificationToast("Access Granted. Welcome back! 🚀", 'success');
    },
    checkSession() {
        const cache = localStorage.getItem('h2o_user_cache');
        if(cache) { this.currentUser = JSON.parse(cache); this.loginSuccess(this.currentUser); }
    },

    // --- MULTI-VIEW LOCATION CONTROLLER ---
    locationViewMode: 'main', 
    setLocationViewMode(mode) {
        this.locationViewMode = mode;
        ['main', 'map', 'manual'].forEach(m => {
            const el = document.getElementById(`loc-subview-${m}`);
            if(el) {
                el.classList.toggle('hidden', m !== mode);
                el.classList.toggle('flex', m === mode);
            }
        });
        if(mode === 'map') this.initLeafletMap();
        if(mode === 'main') this.renderSavedAddresses();
    },

    async detectCurrentGPSLocation() {
        const overlay = document.getElementById('gps-loading-overlay');
        if(overlay) overlay.classList.remove('hidden');
        if (!navigator.geolocation) {
            if(overlay) overlay.classList.add('hidden');
            return alert("Geolocation not supported");
        }
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const { latitude, longitude } = pos.coords;
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18`);
                const data = await res.json();
                const street = data.display_name || `Location [${latitude.toFixed(4)}, ${longitude.toFixed(4)}]`;
                this.savedAddresses.push({ address: street, category: 'Current', coords: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` });
                localStorage.setItem('h2o_saved_addresses', JSON.stringify(this.savedAddresses));
                localStorage.setItem('h2o_last_address', street);
                this.toggleServiceAlerts(false); this.updateLocationUI("Ballari");
                if(overlay) overlay.classList.add('hidden');
                this.showNotificationToast("Location Detected & Saved! 📍");
                this.renderSavedAddresses();
            } catch(e) { if(overlay) overlay.classList.add('hidden'); alert("Reverse geocode failed"); }
        }, (err) => { if(overlay) overlay.classList.add('hidden'); alert("GPS denied"); }, { enableHighAccuracy: true });
    },

    setAddrCategory(cat) {
        this.currentAddrCategory = cat;
        ['Home', 'Office', 'Others'].forEach(c => {
            const btn = document.getElementById(`manual-cat-${c}`);
            if(btn) {
                btn.classList.toggle('border-teal-500/50', c === cat);
                btn.classList.toggle('bg-teal-500/10', c === cat);
                btn.classList.toggle('text-teal-400', c === cat);
                btn.classList.toggle('border-slate-800', c !== cat);
                btn.classList.toggle('bg-slate-950', c !== cat);
                btn.classList.toggle('text-slate-500', c !== cat);
            }
        });
    },

    saveManualAddress() {
        const input = document.getElementById('manual-address-input');
        const addr = input ? input.value.trim() : "";
        if(!addr) return alert("Please enter valid address");
        this.savedAddresses.push({ address: addr, category: this.currentAddrCategory });
        localStorage.setItem('h2o_saved_addresses', JSON.stringify(this.savedAddresses));
        localStorage.setItem('h2o_last_address', addr);
        this.toggleServiceAlerts(false); this.updateLocationUI("Ballari");
        this.showNotificationToast("Manual Address Saved! 📝");
        this.setLocationViewMode('main');
        if(input) input.value = "";
    },

    renderSavedAddresses() {
        const target = document.getElementById('dynamic-saved-addresses-target');
        if (!target) return;
        if (this.savedAddresses.length === 0) {
            target.innerHTML = `<div class="flex flex-col items-center justify-center py-10 px-6 text-center space-y-4 opacity-80"><div class="w-32 h-32 bg-teal-500/5 rounded-full flex items-center justify-center border border-teal-500/10"><i class="fa-solid fa-map-location-dot text-6xl text-teal-500/20"></i></div><h4 class="text-lg font-bold text-white">No Saved Addresses</h4></div>`;
            return;
        }
        let html = '<div class="space-y-3">';
        this.savedAddresses.forEach((item, idx) => {
            let icon = 'fa-map-pin';
            if (item.category === 'Home') icon = 'fa-house';
            if (item.category === 'Office') icon = 'fa-briefcase';
            if (item.category === 'Current') icon = 'fa-location-crosshairs';
            html += `<div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-4 cursor-pointer group">
                    <div onclick="AppEngine.selectCurrentLocation('${item.address}')" class="flex-1 flex items-center gap-4">
                        <div class="text-teal-400/50"><i class="fa-solid ${icon} text-xl"></i></div>
                        <div class="flex-1"><div class="text-white text-xs font-bold">${item.category || 'Other'}</div><p class="text-slate-400 text-[10px]">${item.address}</p></div>
                    </div>
                    <button onclick="AppEngine.deleteAddress(${idx})" class="text-rose-500"><i class="fa-solid fa-trash-can text-xs"></i></button>
                </div>`;
        });
        target.innerHTML = html + '</div>';
    },

    deleteAddress(idx) {
        if(confirm("Remove address?")) { this.savedAddresses.splice(idx, 1); localStorage.setItem('h2o_saved_addresses', JSON.stringify(this.savedAddresses)); this.renderSavedAddresses(); }
    },

    selectCurrentLocation(addr) {
        localStorage.setItem('h2o_last_address', addr);
        this.toggleServiceAlerts(false); this.updateLocationUI("Ballari");
        const sub = document.querySelector('.location-banner p'); if(sub) sub.innerText = addr;
        navigateTo('home');
    },

    // --- MAP ENGINE (Dual-Layer + Search) ---
    leafletMap: null, leafletMarker: null, geofenceCircle: null, isLeafletReady: false,
    initLeafletMap() {
        this.renderTacticalFallback();
        if (window.L && !this.leafletMap) {
            try {
                const container = document.getElementById('live-map-layer');
                if(!container) return;
                this.leafletMap = L.map(container, { center: [this.ProductionHub.lat, this.ProductionHub.lng], zoom: 13, zoomControl: false });
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.leafletMap);
                L.circle([this.ProductionHub.lat, this.ProductionHub.lng], { color: '#00A896', fillColor: '#00BCD4', fillOpacity: 0.08, radius: 35000 }).addTo(this.leafletMap);
                this.leafletMarker = L.marker([this.ProductionHub.lat, this.ProductionHub.lng]).addTo(this.leafletMap);
                this.leafletMap.on('click', (e) => { this.leafletMarker.setLatLng(e.latlng); this.processNewLocationCoordinates(e.latlng.lat, e.latlng.lng); });
                this.isLeafletReady = true;
                container.classList.remove('opacity-0', 'pointer-events-none');
                container.classList.add('opacity-100', 'pointer-events-auto');
                this.processNewLocationCoordinates(this.ProductionHub.lat, this.ProductionHub.lng);
                setTimeout(() => this.leafletMap.invalidateSize(), 300);
            } catch(e) { console.warn("Leaflet error"); }
        } else if(this.leafletMap) { setTimeout(() => this.leafletMap.invalidateSize(), 300); }
    },

    async searchOnMap() {
        const query = document.getElementById('map-search-input').value.trim();
        if(!query) return;
        
        // Coords Regex Check
        const coordRegex = /(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/;
        const matched = query.match(coordRegex);
        if(matched) {
            const lat = parseFloat(matched[1]);
            const lon = parseFloat(matched[2]);
            if(this.isLeafletReady) { this.leafletMap.setView([lat, lon], 16); this.leafletMarker.setLatLng([lat, lon]); }
            this.processNewLocationCoordinates(lat, lon);
            return;
        }

        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
            const data = await res.json();
            if(data.length > 0) {
                const { lat, lon } = data[0];
                const latNum = parseFloat(lat);
                const lonNum = parseFloat(lon);
                if(this.isLeafletReady) { this.leafletMap.setView([latNum, lonNum], 16); this.leafletMarker.setLatLng([latNum, lonNum]); }
                this.processNewLocationCoordinates(latNum, lonNum);
            } else alert("Location not found");
        } catch(e) {}
    },

    renderTacticalFallback() {
        if(this.isLeafletReady) return;
        const layer = document.getElementById('fallback-map-layer'); if(!layer) return;
        layer.innerHTML = `<div onclick="AppEngine.handleFallbackClick(event)" class="w-full h-full relative bg-[#0B111E] overflow-hidden cursor-crosshair">
            <div class="absolute inset-0 opacity-[0.12]" style="background-image: linear-gradient(#00BCD4 1px, transparent 1px), linear-gradient(90deg, #00BCD4 1px, transparent 1px); background-size: 24px 24px;"></div>
            <div id="fallback-pin" class="absolute -translate-x-1/2 -translate-y-[90%] pointer-events-none z-30" style="left:50%; top:50%;"><i id="fallback-pin-icon" class="fa-solid fa-map-pin text-[#00BCD4] text-4xl drop-shadow-2xl"></i></div>
        </div>`;
        this.processNewLocationCoordinates(this.ProductionHub.lat, this.ProductionHub.lng);
    },

    handleFallbackClick(e) {
        if(this.isLeafletReady) return;
        const rect = document.getElementById('fallback-map-layer').getBoundingClientRect();
        const xPct = ((e.clientX - rect.left) / rect.width) * 100;
        const yPct = ((e.clientY - rect.top) / rect.height) * 100;
        document.getElementById('fallback-pin').style.left = xPct+'%';
        document.getElementById('fallback-pin').style.top = yPct+'%';
        this.processNewLocationCoordinates(this.ProductionHub.lat + (50-yPct)*0.016, this.ProductionHub.lng + (xPct-50)*0.016);
    },

    async processNewLocationCoordinates(lat, lng) {
        const dist = this.calculateDistance(this.ProductionHub.lat, this.ProductionHub.lng, lat, lng);
        const out = dist > 35;
        
        let addr = "";
        if(out) {
            addr = `Out of Service Range [${lat.toFixed(4)}, ${lng.toFixed(4)}]`;
        } else {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
                const data = await res.json();
                const road = data.address.road || data.address.suburb || 'Delivery Zone';
                const city = data.address.city || data.address.town || 'Ballari';
                addr = `${road}, ${city} [${lat.toFixed(4)}, ${lng.toFixed(4)}]`;
            } catch {
                addr = `Registered Delivery Sector [${lat.toFixed(4)}, ${lng.toFixed(4)}]`;
            }
        }

        document.getElementById('map-address-display').innerText = addr;
        document.getElementById('map-distance-text').innerText = `Radius Check: ${dist.toFixed(2)} KM from Hub`;
        const b = document.getElementById('map-distance-banner');
        const s = document.getElementById('btn-save-interactive-map');
        if(out) { b.className = "p-3.5 rounded-xl border flex items-start gap-3 bg-red-950/40 border-red-900/60 text-red-400"; s.disabled = true; s.style.opacity = '0.2'; }
        else { b.className = "p-3.5 rounded-xl border flex items-start gap-3 bg-teal-950/30 border-teal-900/50 text-teal-400"; s.disabled = false; s.style.opacity = '1'; }
        this.pendingInteractiveAddress = { address: addr, coords: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
    },

    saveInteractiveLocation() {
        const d = this.pendingInteractiveAddress; if(!d) return;
        this.savedAddresses.push({ address: d.address, category: 'Others', coords: d.coords });
        localStorage.setItem('h2o_last_address', d.address);
        localStorage.setItem('h2o_saved_addresses', JSON.stringify(this.savedAddresses));
        this.toggleServiceAlerts(false); this.updateLocationUI("Ballari"); navigateTo('home');
    },

    // --- CART ENGINE ---
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
        t.innerHTML = html + `<div>Total: ₹${total.toFixed(2)}<br><button onclick="AppEngine.checkout()" class="action-accent-button">CHECKOUT</button></div></div>`;
    },
    checkout() { this.openCheckout(); },

    // --- CHECKOUT & SUBSCRIPTIONS ---
    openCheckout() { document.getElementById('checkout-modal').classList.remove('hidden'); document.getElementById('cust-phone').value = this.currentUser ? this.currentUser.phone_number : ""; },
    closeCheckout() { document.getElementById('checkout-modal').classList.add('hidden'); },
    async handleSubscriptionIntent(pk) { if(!this.currentUser) return alert("Login first"); this.subState.productKey = pk; document.getElementById('sub-prod-name').innerText = pk.replace(/_/g, ' '); document.getElementById('sub-modal').classList.remove('hidden'); },
    closeSubscriptionFlow() { document.getElementById('sub-modal').classList.add('hidden'); },
    async saveSubscription() {
        const { error } = await window.supabaseClient.from('subscriptions').insert({ customer_id: this.currentUser.customer_id, product_key: this.subState.productKey, frequency: 'daily', selected_days: [1,2,3,4,5,6,0], status: 'active', quantity: 1 });
        if(!error) { this.closeSubscriptionFlow(); this.fetchSubscriptions(); this.showNotificationToast("Subscribed!"); }
    },
    async fetchSubscriptions() {
        if(!this.currentUser) return;
        const { data } = await window.supabaseClient.from('subscriptions').select('*').eq('customer_id', this.currentUser.customer_id);
        if(data) { this.subscriptions = data; this.syncSubscriptionsUI(); }
    },
    syncSubscriptionsUI() {
        const t = document.getElementById('view-subscriptions'); if(!t) return;
        t.innerHTML = `<div class="view-header"><h2>Subscriptions</h2></div>` + this.subscriptions.map(s => `<div class="glass-card p-4 mb-2">${s.product_key.replace(/_/g,' ')} - ${s.status}</div>`).join('');
    },

    // --- UTILS ---
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; const dLat = (lat2-lat1)*Math.PI/180; const dLon = (lon2-lon1)*Math.PI/180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    },
    initRealtime() { if(!this.currentUser) return; window.supabaseClient.channel('any').on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, () => this.fetchSubscriptions()).subscribe(); },
    initLocation() { if(localStorage.getItem('h2o_last_address')) { this.toggleServiceAlerts(false); this.updateLocationUI("Ballari"); } },
    updateLocationUI(n) { const h = document.querySelector('.location-banner h4'); if(h) h.innerHTML = `${n} <i class="fa-solid fa-chevron-down"></i>`; },
    toggleServiceAlerts(s) { const h = document.getElementById('alert-home'); if(h) h.classList.toggle('hidden', !s); },
    syncProfileUI() { if(this.currentUser) document.querySelectorAll('#profile-display-phone').forEach(e => e.innerText = this.currentUser.phone_number); },
    showNotificationToast(msg) { const toast = document.createElement('div'); toast.className = "fixed top-10 left-1/2 -translate-x-1/2 z-[1000] px-6 py-4 rounded-3xl bg-teal-600 text-white font-bold animate-fadeIn"; toast.innerText = msg; document.body.appendChild(toast); setTimeout(()=>toast.remove(), 3000); },
    fetchSystemSettings() {}, fetchCustomerAssets() {}, initSearch() {}, initPaymentListeners() {},
    filterByCategory(c) { window.setProductFilter(c); navigateTo('products'); },
    openHelp(t) { window.location.href = t==='call' ? "tel:7483266062" : "https://wa.me/7483266062"; }
};
window.AppEngine = AppEngine;
