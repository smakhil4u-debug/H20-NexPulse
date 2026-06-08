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

    // --- DUAL-LAYER MAP ENGINE (Final Fixed Design Parity) ---
    leafletMap: null, leafletMarker: null, geofenceCircle: null, isLeafletReady: false,
    
    initLeafletMap() {
        this.renderTacticalFallback();
        if (window.L && !this.leafletMap) {
            try {
                const mapContainer = document.getElementById('live-map-layer');
                if (!mapContainer) return;
                this.leafletMap = L.map(mapContainer, { center: [this.ProductionHub.lat, this.ProductionHub.lng], zoom: 13, zoomControl: false });
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.leafletMap);
                L.circle([this.ProductionHub.lat, this.ProductionHub.lng], { color: '#00A896', fillColor: '#00BCD4', fillOpacity: 0.08, radius: 35000 }).addTo(this.leafletMap);
                this.leafletMarker = L.marker([this.ProductionHub.lat, this.ProductionHub.lng]).addTo(this.leafletMap);
                this.leafletMap.on('click', (e) => {
                    this.leafletMarker.setLatLng(e.latlng);
                    this.processNewLocationCoordinates(e.latlng.lat, e.latlng.lng);
                });
                this.isLeafletReady = true;
                mapContainer.classList.remove('opacity-0', 'pointer-events-none');
                mapContainer.classList.add('opacity-100');
                this.processNewLocationCoordinates(this.ProductionHub.lat, this.ProductionHub.lng);
                setTimeout(() => this.leafletMap.invalidateSize(), 300);
            } catch (err) { console.warn("Leaflet error, operating via fallback.", err); }
        }
    },

    renderTacticalFallback() {
        const fallbackContainer = document.getElementById('fallback-map-layer');
        if (!fallbackContainer) return;
        fallbackContainer.innerHTML = `<div onclick="AppEngine.handleFallbackClick(event)" class="w-full h-full relative overflow-hidden cursor-crosshair bg-[#0B111E]">
                <div class="absolute inset-0 opacity-[0.12]" style="background-image: linear-gradient(#00BCD4 1px, transparent 1px), linear-gradient(90deg, #00BCD4 1px, transparent 1px); background-size: 24px 24px;"></div>
                <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none z-20">
                    <div class="w-4 h-4 rounded-full bg-teal-400 border-2 border-white shadow-[0_0_12px_#00BCD4]"></div>
                    <span class="text-[9px] font-bold text-teal-400 bg-[#0A0E1A] border border-teal-900 px-2 py-0.5 rounded shadow-md mt-1.5 uppercase whitespace-nowrap">Ballari Hub Center</span>
                </div>
                <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] border-2 border-dashed border-[#00A896]/40 rounded-full pointer-events-none bg-teal-500/[0.01] flex items-center justify-center">
                    <span class="text-[8px] text-gray-600 font-bold uppercase tracking-widest mt-48">35KM Dispatch Ring Limit</span>
                </div>
                <div id="fallback-pin" class="absolute -translate-x-1/2 -translate-y-[90%] transition-all duration-150 pointer-events-none z-30 animate-bounce" style="left: 50%; top: 50%;">
                    <i id="fallback-pin-icon" class="fa-solid fa-map-pin text-[#00BCD4] text-4xl drop-shadow-2xl"></i>
                </div>
            </div>`;
        this.processNewLocationCoordinates(this.ProductionHub.lat, this.ProductionHub.lng);
    },

    handleFallbackClick(e) {
        if (this.isLeafletReady) return;
        const rect = document.getElementById('fallback-map-layer').getBoundingClientRect();
        const xPct = ((e.clientX - rect.left) / rect.width) * 100;
        const yPct = ((e.clientY - rect.top) / rect.height) * 100;
        document.getElementById('fallback-pin').style.left = xPct+'%';
        document.getElementById('fallback-pin').style.top = yPct+'%';
        this.processNewLocationCoordinates(this.ProductionHub.lat + (50-yPct)*0.016, this.ProductionHub.lng + (xPct-50)*0.016);
    },

    processNewLocationCoordinates(lat, lng) {
        const dist = this.calculateDistance(this.ProductionHub.lat, this.ProductionHub.lng, lat, lng);
        const out = dist > 35;
        const addr = out ? `Outer Region Area Block [Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}]` : `Ballari Delivery Sub-Sector, Registered Coordinate Anchor [${lat.toFixed(4)}, ${lng.toFixed(4)}]`;
        document.getElementById('map-address-display').innerText = addr;
        document.getElementById('map-distance-text').innerText = `Radius Check: ${dist.toFixed(2)} KM from Hub`;
        const b = document.getElementById('map-distance-banner');
        const pi = document.getElementById('fallback-pin-icon');
        const s = document.getElementById('btn-save-interactive-map');
        if(out) {
            b.className = "p-3.5 rounded-xl border flex items-start gap-3 bg-red-950/40 border-red-900/60 text-red-400";
            if(pi) pi.className = "fa-solid fa-map-pin text-red-500 text-4xl drop-shadow-2xl";
            if(s) { s.disabled = true; s.style.opacity = '0.2'; }
        } else {
            b.className = "p-3.5 rounded-xl border flex items-start gap-3 bg-teal-950/30 border-teal-900/50 text-teal-400";
            if(pi) pi.className = "fa-solid fa-map-pin text-[#00BCD4] text-4xl drop-shadow-2xl";
            if(s) { s.disabled = false; s.style.opacity = '1'; }
        }
        this.pendingInteractiveAddress = { address: addr, coords: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
    },

    saveInteractiveLocation() {
        const d = this.pendingInteractiveAddress; if(!d) return;
        this.savedAddresses.push({ address: d.address, category: 'Others', coords: d.coords });
        localStorage.setItem('h2o_last_address', d.address);
        this.toggleServiceAlerts(false); this.updateLocationUI("Ballari"); navigateTo('home');
    },

    // --- UTILS ---
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; const dLat = (lat2-lat1)*Math.PI/180; const dLon = (lon2-lon1)*Math.PI/180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    },
    syncProfileUI() { if(this.currentUser) document.querySelectorAll('#profile-display-phone').forEach(e => e.innerText = this.currentUser.phone_number); },
    updateLocationUI(n) { const h = document.querySelector('.location-banner h4'); if(h) h.innerHTML = `${n} <i class="fa-solid fa-chevron-down"></i>`; },
    toggleServiceAlerts(s) {
        const h = document.getElementById('alert-home'); const p = document.getElementById('alert-products');
        if(s) { h?.classList.remove('hidden'); p?.classList.remove('hidden'); }
        else { h?.classList.add('hidden'); p?.classList.add('hidden'); }
    },
    initRealtime() {
        if(!this.currentUser) return;
        window.supabaseClient.channel('any').on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, () => this.fetchSubscriptions()).subscribe();
    },
    initLocation() {
        navigator.geolocation.getCurrentPosition(p => { this.currentCoords = { lat: p.coords.latitude, lng: p.coords.longitude }; this.updateLocationUI("Ballari"); });
    },
    fetchSubscriptions() {}, syncSubscriptionsUI() {}, fetchCustomerAssets() {},
    addToCart() {}, removeFromCart() {}, getQty() { return 0; }, syncCartUI() {}, checkout() {},
    openCheckout() {}, closeCheckout() {}, toggleMapPicker() {}, setAddrCategory() {}, saveAddress() {},
    handleSubscriptionIntent() {}, openSubscriptionFlow() {}, closeSubscriptionFlow() {}, setSubFreq() {}, saveSubscription() {},
    openHelp(t) { window.location.href = t==='call' ? "tel:7483266062" : "https://wa.me/7483266062"; },
    showNotificationToast(m) { alert(m); }, showSuccessPopup() {}, closeSuccess() {}, fetchSystemSettings() {},
    filterByCategory(c) { window.setProductFilter(c); navigateTo('products'); },
    initSearch() {}, clearSearch() {}, execPopularSearch() {}, renderSearchResults() {}, checkSession() {},
    populateProfileDetails() {}, toggleProfileEdit() {}, saveProfileDetails() {}, addWalletFunds() {},
    setCouponTab() {}, renderCouponsUI() {}, toggleCouponTerms() {},
    renderSavedAddresses() {}, toggleAddAddressForm() {}, deleteAddress() {}, selectCurrentLocation() {}, addNewAddress() {}
};
window.AppEngine = AppEngine;
