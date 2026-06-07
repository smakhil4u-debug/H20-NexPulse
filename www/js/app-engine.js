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
    savedAddresses: [], // To store list of user addresses
    currentAddrCategory: 'Home',
    systemSettings: {},

    // --- SYSTEM CONFIG ---
    IS_PRODUCTION: false, // Set to true to launch real UPI apps
    MerchantConfig: {
        merchant_upi_id: "7483266062@ybl",
        merchant_name: "H2O NexPulse",
        default_deposit_amount: 2000
    },
    paymentPending: false,
    activeCouponTab: 'collected',
    expandedCouponCode: null,
    activeOffers: [
        {
            code: 'FIRSTJARFREE',
            discount: 'FREE 20L Water Jar',
            description: 'Get your first 20L daily H2O water jar completely free on your initial order.',
            expiry: 'Valid till 31st July 2026',
            terms: 'Applicable for new accounts only. This offer applies strictly to the water contents and does not cover the refundable 20L empty jar security deposit. Standard empty jar exchange rules apply upon drop-off.'
        },
        {
            code: 'FREEJARDEPOSIT',
            discount: 'Waived Initial Deposit',
            description: 'Zero upfront security fee on your first two delivery jars.',
            expiry: 'Valid till 31st August 2026',
            terms: 'Requires a commitment to an active multi-month subscription plan. Clean, undamaged original functional containers must be systematically exchanged on every recurring delivery run.'
        }
    ],

    // --- TWO-STEP AUTH LOGIC (React Design Translation) ---
    goToOtpStep() {
        const phoneInput = document.getElementById('login-phone');
        if (!phoneInput) return;
        const phone = phoneInput.value.trim();
        if (phone.length < 10) return alert("Enter valid 10-digit number");
        
        document.getElementById('login-step-phone').classList.add('hidden');
        document.getElementById('login-step-otp').classList.remove('hidden');
        
        const displayPhone = document.getElementById('otp-phone-display');
        if (displayPhone) displayPhone.innerText = `Sent to +91 ${phone}`;

        this.showNotificationToast(`Verification code sent to +91 ${phone} 📱`, 'success');
        console.log("Auth Step Switch: OTP Entry Active");
    },

    goToPhoneStep() {
        document.getElementById('login-step-phone').classList.remove('hidden');
        document.getElementById('login-step-otp').classList.add('hidden');
        console.log("Auth Step Switch: Phone Entry Active");
    },

    async handleMockLogin() {
        const otpInput = document.getElementById('login-otp');
        if (!otpInput) return;
        const code = otpInput.value.trim();
        if (code.length < 4) return alert("Enter valid verification code");

        // 1. Instant Success (Stripped all setTimeout/loader delays)
        const phoneInput = document.getElementById('login-phone');
        const phone = phoneInput ? phoneInput.value : "7483266062";
        const mockUser = {
            customer_id: 1,
            phone_number: phone,
            full_name: 'Jayalakshmi',
            created_at: new Date().toISOString(),
            deposit_paid: true,
            email: 'jayalakshmi@example.com'
        };

        // 2. Immediate Handover
        this.loginSuccess(mockUser);
        this.showNotificationToast("Access Granted. Welcome back! 🚀", 'success');
        console.log("Bulletproof Instant Login Executed");
    },

    // --- LOCATION LOGIC ---
    supportedZones: [
        { name: "Ballari", lat: 15.1394, lng: 76.9214, radiusKm: 30 }
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
            this.toggleServiceAlerts(false);
            this.updateLocationUI(zoneName);
        } else {
            this.toggleServiceAlerts(true);
        }
    },

    updateLocationUI(name) {
        const locTitle = document.querySelector('.location-banner h4');
        if (locTitle) locTitle.innerHTML = `${name} <i class="fa-solid fa-chevron-down text-xs"></i>`;
    },

    renderSavedAddresses() {
        const target = document.getElementById('dynamic-saved-addresses-target');
        if (!target) return;

        if (this.savedAddresses.length === 0) {
            target.innerHTML = `
                <div class="flex flex-col items-center justify-center py-10 px-6 text-center space-y-4 opacity-80">
                    <div class="w-32 h-32 bg-teal-500/5 rounded-full flex items-center justify-center relative border border-teal-500/10">
                        <i class="fa-solid fa-map-location-dot text-6xl text-teal-500/20"></i>
                    </div>
                    <div class="space-y-1">
                        <h4 class="text-lg font-bold text-white">No Saved Addresses</h4>
                        <p class="text-xs text-slate-400 font-medium">Add an address to speed up checkout.</p>
                    </div>
                </div>
            `;
            return;
        }

        let html = '<div class="space-y-3">';
        this.savedAddresses.forEach((item, idx) => {
            let icon = 'fa-map-pin';
            if (item.category === 'Home') icon = 'fa-house';
            if (item.category === 'Office') icon = 'fa-briefcase';

            html += `
                <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-4 cursor-pointer active:scale-[0.98] transition group relative">
                    <div onclick="AppEngine.selectCurrentLocation('${item.address}')" class="flex-1 flex items-center gap-4">
                        <div class="text-teal-400/50"><i class="fa-solid ${icon} text-xl"></i></div>
                        <div class="flex-1">
                            <div class="text-white text-xs font-bold">${item.category || 'Other'}</div>
                            <p class="text-slate-400 text-[10px] leading-tight mt-0.5">${item.address}</p>
                        </div>
                    </div>
                    <button onclick="AppEngine.deleteAddress(${idx})" class="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                </div>
            `;
        });
        html += '</div>';
        target.innerHTML = html;
    },

    toggleAddAddressForm(show) {
        const listView = document.getElementById('location-list-view');
        const addForm = document.getElementById('add-address-form');
        
        if (show) {
            listView.classList.add('hidden');
            addForm.classList.remove('hidden');
            document.getElementById('new-address-input').focus();
        } else {
            listView.classList.remove('hidden');
            addForm.classList.add('hidden');
            document.getElementById('new-address-input').value = "";
        }
    },

    async addNewAddress() {
        const input = document.getElementById('new-address-input');
        const addrText = input.value.trim();
        
        if (!addrText) return alert("Please enter an address!");

        // Add to array state
        this.savedAddresses.push({ address: addrText, category: 'Others' });
        
        // Persist to storage
        localStorage.setItem('h2o_saved_addresses', JSON.stringify(this.savedAddresses));
        
        // UI Refresh
        this.renderSavedAddresses();
        this.toggleAddAddressForm(false);
        this.showNotificationToast("Address Added Successfully! 📍", 'success');
    },

    deleteAddress(index) {
        if (confirm("Remove this address?")) {
            this.savedAddresses.splice(index, 1);
            localStorage.setItem('h2o_saved_addresses', JSON.stringify(this.savedAddresses));
            this.renderSavedAddresses();
        }
    },

    selectCurrentLocation(address, autoSave = false) {
        const locTitle = document.querySelector('.location-banner h4');
        const locSub = document.querySelector('.location-banner p');
        if (locTitle) locTitle.innerHTML = `Ballari <i class="fa-solid fa-chevron-down text-xs"></i>`;
        if (locSub) locSub.innerText = address;

        localStorage.setItem('h2o_last_address', address);

        if (autoSave) {
            const exists = this.savedAddresses.some(a => a.address === address);
            if (!exists) {
                this.savedAddresses.push({ address: address, category: 'Others' });
                localStorage.setItem('h2o_saved_addresses', JSON.stringify(this.savedAddresses));
                this.renderSavedAddresses();
            }
        }
        navigateTo('home');
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

    // --- PROFILE & WALLET LOGIC ---
    syncProfileUI() {
        if (!this.currentUser) return;
        const phoneEls = document.querySelectorAll('#profile-display-phone');
        phoneEls.forEach(el => el.innerText = this.currentUser.phone_number);
        
        const zoneEl = document.getElementById('profile-current-zone');
        const lastAddr = localStorage.getItem('h2o_last_address');
        if (zoneEl && lastAddr) {
            // Extract city from address if possible, or use full string
            zoneEl.innerText = lastAddr.split(',')[0].trim(); 
        }
    },

    populateProfileDetails() {
        if (!this.currentUser) return;
        const nameEl = document.getElementById('detail-name');
        const phoneEl = document.getElementById('detail-phone');
        const emailEl = document.getElementById('detail-email');
        const createdEl = document.getElementById('detail-created');

        if (nameEl) nameEl.innerText = this.currentUser.full_name || "NexPulse Member";
        if (phoneEl) phoneEl.innerText = "+91 " + this.currentUser.phone_number;
        if (emailEl) emailEl.innerText = this.currentUser.email || "Add email address";
        
        if (createdEl) {
            const createdDate = new Date(this.currentUser.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
            createdEl.innerText = createdDate;
        }

        this.toggleProfileEdit(false);
    },

    toggleProfileEdit(isEdit) {
        const viewGroup = ['detail-name', 'detail-email', 'btn-edit-profile'];
        const editGroup = ['edit-name', 'edit-email', 'btn-save-profile'];

        if (isEdit) {
            document.getElementById('edit-name').value = this.currentUser.full_name || "";
            document.getElementById('edit-email').value = this.currentUser.email || "";
        }

        viewGroup.forEach(id => {
            const el = document.getElementById(id);
            if (el) isEdit ? el.classList.add('hidden') : el.classList.remove('hidden');
        });

        editGroup.forEach(id => {
            const el = document.getElementById(id);
            if (el) isEdit ? el.classList.remove('hidden') : el.classList.add('hidden');
        });
    },

    async saveProfileDetails() {
        const newName = document.getElementById('edit-name').value.trim();
        const newEmail = document.getElementById('edit-email').value.trim();

        if (!newName) return alert("Name cannot be empty!");
        
        this.currentUser.full_name = newName;
        this.currentUser.email = newEmail;

        localStorage.setItem('h2o_user_cache', JSON.stringify(this.currentUser));
        this.showNotificationToast("Profile Changes Saved Successfully! ✅");
        
        this.toggleProfileEdit(false);
        this.populateProfileDetails();
        this.syncProfileUI();
    },

    addWalletFunds() {
        const amt = document.getElementById('wallet-amount').value;
        if (!amt || amt <= 0) return alert("Please enter a valid amount!");
        this.pendingPlan = { name: 'Wallet Top-up', deposit: parseFloat(amt) };
        this.currentPaymentMethod = 'UPI'; 
        navigateTo('payment-selection');
    },

    // --- COUPON LOGIC ---
    setCouponTab(tab) {
        this.activeCouponTab = tab;
        const colTab = document.getElementById('tab-coupons-collected');
        const offTab = document.getElementById('tab-coupons-offers');
        
        if (tab === 'collected') {
            colTab.classList.add('border-[#00BCD4]', 'text-[#00BCD4]');
            colTab.classList.remove('border-transparent', 'text-gray-400');
            offTab.classList.add('border-transparent', 'text-gray-400');
            offTab.classList.remove('border-[#00BCD4]', 'text-[#00BCD4]');
        } else {
            offTab.classList.add('border-[#00BCD4]', 'text-[#00BCD4]');
            offTab.classList.remove('border-transparent', 'text-gray-400');
            colTab.classList.add('border-transparent', 'text-gray-400');
            colTab.classList.remove('border-[#00BCD4]', 'text-[#00BCD4]');
        }
        this.renderCouponsUI();
    },

    renderCouponsUI() {
        const target = document.getElementById('coupons-content-target');
        if (!target) return;

        if (this.activeCouponTab === 'collected') {
            target.innerHTML = `
                <div class="coupon-empty-state animate-fadeIn">
                    <div class="ticket-visual-wrapper">
                        <div class="ticket-icon-container">
                            <i class="fa-solid fa-ticket text-5xl rotate-12"></i>
                        </div>
                        <div class="badge-percent">
                            <i class="fa-solid fa-percent"></i>
                        </div>
                    </div>
                    <div class="space-y-2">
                        <h2 class="text-lg font-bold text-white">No Coupons Collected</h2>
                        <p class="text-sm text-gray-400 max-w-xs leading-relaxed">
                            You haven't collected any coupons yet. Keep an eye out for upcoming offers!
                        </p>
                    </div>
                </div>
            `;
        } else {
            let html = '<div class="space-y-4">';
            this.activeOffers.forEach(offer => {
                const isExpanded = this.expandedCouponCode === offer.code;
                html += `
                    <div class="bg-[#131A30] rounded-xl border border-[#1E294B] shadow-xl overflow-hidden transition-all">
                        <div class="p-4 flex items-center justify-between gap-3">
                            <div class="flex items-start gap-3.5">
                                <div class="p-3 bg-[#1E294B] text-[#00BCD4] rounded-xl shrink-0 mt-0.5">
                                    <i class="fa-solid fa-percent text-xl"></i>
                                </div>
                                <div class="space-y-1">
                                    <span class="inline-block bg-teal-950/50 text-[#00BCD4] text-[11px] font-bold px-2 py-0.5 rounded border border-teal-900 uppercase tracking-wider">
                                        ${offer.code}
                                    </span>
                                    <h3 class="text-base font-bold text-white">${offer.discount}</h3>
                                    <p class="text-xs text-gray-400 leading-normal">${offer.description}</p>
                                </div>
                            </div>
                            <button onclick="AppEngine.toggleCouponTerms('${offer.code}')" class="text-gray-400">
                                <i class="fa-solid fa-chevron-down transition-transform duration-300 ${isExpanded ? 'rotate-180 text-[#00BCD4]' : ''}"></i>
                            </button>
                        </div>
                        ${isExpanded ? `
                            <div class="bg-[#0B132B] border-t border-[#1E294B] p-4 text-xs text-gray-400 space-y-2 animate-fadeIn">
                                <div class="flex items-center gap-1.5 font-bold text-[#00BCD4] uppercase text-[10px]">
                                    <i class="fa-solid fa-shield-halved"></i> Regulations:
                                </div>
                                <p class="leading-relaxed pl-5">${offer.terms}</p>
                            </div>
                        ` : ''}
                    </div>
                `;
            });
            html += '</div>';
            target.innerHTML = html;
        }
    },

    toggleCouponTerms(code) {
        this.expandedCouponCode = (this.expandedCouponCode === code) ? null : code;
        this.renderCouponsUI();
    },

    // --- SUBSCRIPTION LOGIC ---
    async fetchSubscriptions() {
        if (!this.currentUser) return;
        const { data, error } = await window.supabaseClient.from('subscriptions').select('*').eq('customer_id', this.currentUser.customer_id);
        if (!error && data) { 
            this.subscriptions = data; 
            this.syncSubscriptionsUI(); 
        }
    },

    syncSubscriptionsUI() {
        const target = document.getElementById('view-subscriptions');
        if (!target) return;

        if (this.subscriptions.length === 0) {
            target.innerHTML = `
                <div class="view-header"><h2>Subscription</h2></div>
                <div class="empty-state-view"><div class="empty-vector">🫙❌</div><h3>No Active Subscriptions</h3><p>Schedule your first delivery now!</p></div>
            `;
            return;
        }

        let html = `<div class="view-header"><h2>Subscription</h2></div><div class="space-y-6">`;
        this.subscriptions.forEach(sub => {
            const isPaused = sub.status === 'paused';
            const daysAbbr = ['S','M','T','W','T','F','S'];
            const next7Days = [];
            const today = new Date();
            for(let i=0; i<7; i++) {
                const d = new Date(); d.setDate(today.getDate() + i);
                const dayIdx = d.getDay();
                const isDayScheduled = sub.selected_days.includes(dayIdx);
                const willDeliver = isDayScheduled && !isPaused;
                next7Days.push({ date: d.getDate(), day: daysAbbr[dayIdx], active: willDeliver, scheduled: isDayScheduled });
            }

            html += `
                <div class="glass-card rounded-[32px] p-6 border ${isPaused ? 'border-white/5 opacity-40 grayscale-[0.5]' : 'border-teal-500/20'} transition-all duration-300 relative overflow-hidden">
                    ${isPaused ? '<div class="absolute inset-0 bg-slate-950/20 z-10 pointer-events-none"></div>' : ''}
                    <div class="flex justify-between items-start mb-4 relative z-20">
                        <div class="space-y-1">
                            <h4 class="font-black text-white text-lg uppercase tracking-tight">${sub.product_key.replace(/_/g, ' ')}</h4>
                            <p class="text-[10px] text-teal-400 font-bold uppercase tracking-widest">${sub.frequency}</p>
                        </div>
                        <button onclick="AppEngine.toggleSubStatus(${sub.id}, '${sub.status}')" class="px-5 py-2.5 rounded-2xl border transition-all ${isPaused ? 'bg-slate-900 border-white/5 text-slate-500' : 'bg-rose-500/10 border-rose-500/20 text-rose-500'} text-[10px] font-black uppercase tracking-widest">
                            ${isPaused ? 'RESUME' : 'PAUSE'}
                        </button>
                    </div>
                    <div class="space-y-6 relative z-20 ${isPaused ? 'pointer-events-none' : ''}">
                        <div class="flex justify-between items-center bg-slate-950/50 p-2 rounded-2xl border border-white/5">
                            ${daysAbbr.map((day, idx) => {
                                const isActive = sub.selected_days.includes(idx);
                                return `<button onclick="AppEngine.toggleSubDayInDashboard(${sub.id}, ${idx})" class="w-9 h-9 rounded-xl text-[10px] font-black transition-all ${isActive ? 'bg-teal-600 text-white shadow-lg shadow-teal-900/40' : 'bg-slate-900 text-slate-500'}">${day}</button>`;
                            }).join('')}
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Jars per delivery</span>
                            <div class="flex items-center gap-4 bg-slate-900 p-1.5 rounded-xl border border-white/5">
                                <button onclick="AppEngine.updateSubQty(${sub.id}, ${sub.quantity || 1}, -1)" class="w-8 h-8 flex items-center justify-center text-slate-500"><i class="fa-solid fa-minus text-xs"></i></button>
                                <span class="text-white font-black text-sm w-4 text-center">${sub.quantity || 1}</span>
                                <button onclick="AppEngine.updateSubQty(${sub.id}, ${sub.quantity || 1}, 1)" class="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center text-white"><i class="fa-solid fa-plus text-xs"></i></button>
                            </div>
                        </div>
                        <div class="space-y-3 pt-5 border-t border-white/5">
                            <h5 class="text-[9px] font-black text-slate-500 uppercase tracking-widest">Upcoming Deliveries</h5>
                            <div class="flex justify-between">
                                ${next7Days.map(d => `<div class="flex flex-col items-center gap-1.5"><span class="text-[8px] font-bold ${d.scheduled ? 'text-slate-400' : 'text-slate-700'}">${d.day}</span><div class="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${d.active ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/30' : 'bg-slate-900 text-slate-700 border border-white/5'}">${d.date}</div></div>`).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        target.innerHTML = html + `</div>`;
    },

    async toggleSubStatus(subId, currentStatus) {
        const newStatus = currentStatus === 'active' ? 'paused' : 'active';
        await window.supabaseClient.from('subscriptions').update({ status: newStatus }).eq('id', subId);
        this.fetchSubscriptions();
    },

    async toggleSubDayInDashboard(subId, dayIdx) {
        const sub = this.subscriptions.find(s => s.id === subId);
        if (!sub) return;
        let newDays = [...sub.selected_days];
        const idx = newDays.indexOf(dayIdx);
        if (idx > -1) newDays.splice(idx, 1); else newDays.push(dayIdx);
        await window.supabaseClient.from('subscriptions').update({ selected_days: newDays }).eq('id', subId);
        this.fetchSubscriptions();
    },

    async updateSubQty(subId, currentQty, delta) {
        const newQty = Math.max(1, currentQty + delta);
        if (newQty === currentQty) return;
        await window.supabaseClient.from('subscriptions').update({ quantity: newQty }).eq('id', subId);
        this.fetchSubscriptions();
    },

    // --- CART & SEARCH ---
    updateCartGlobalState() {
        let totalQty = 0; let totalPrice = 0;
        this.cart.forEach(item => { totalQty += item.qty; totalPrice += item.unit_price * item.qty; });
        if (typeof syncProductUI === 'function') syncProductUI();
        if (this.renderSearchResults) this.renderSearchResults();
        this.syncCartUI();
    },

    addToCart(productKey) {
        const product = this.products.find(p => p.product_key === productKey);
        if (!product) return;
        const existing = this.cart.find(item => item.product_key === productKey);
        if (existing) existing.qty++; else this.cart.push({ ...product, qty: 1 });
        this.updateCartGlobalState();
    },

    removeFromCart(productKey) {
        const index = this.cart.findIndex(item => item.product_key === productKey);
        if (index > -1) { if (this.cart[index].qty > 1) this.cart[index].qty--; else this.cart.splice(index, 1); }
        this.updateCartGlobalState();
    },

    getQty(productKey) { const item = this.cart.find(i => i.product_key === productKey); return item ? item.qty : 0; },

    syncCartUI() {
        const cartTarget = document.getElementById('view-cart');
        if (!cartTarget) return;
        if (this.cart.length === 0) {
            cartTarget.innerHTML = `<div class="view-header"><h2>Cart</h2></div><div class="empty-state-view"><div class="empty-vector">🛒❗</div><h3>Don't leave your cart high & dry</h3><button class="action-accent-button" onclick="navigateTo('products')">BROWSE PRODUCTS</button></div>`;
            return;
        }
        let total = 0; let html = `<div class="view-header"><h2>Cart</h2></div><div class="cart-list space-y-4">`;
        this.cart.forEach(item => {
            total += item.unit_price * item.qty;
            html += `<div class="product-item-card glass-surface"><div class="product-info-row flex justify-between items-center"><div class="product-details"><h4 class="product-name font-bold text-sm">${item.display_name}</h4><p class="product-price text-accent text-xs">₹${item.unit_price} x ${item.qty}</p></div><div class="flex items-center gap-3 bg-slate-900 rounded-xl p-1 border border-slate-800"><button onclick="AppEngine.removeFromCart('${item.product_key}')" class="w-8 h-8 flex items-center justify-center text-slate-400"><i class="fa-solid fa-minus text-[10px]"></i></button><span class="font-bold w-4 text-center text-xs">${item.qty}</span><button onclick="AppEngine.addToCart('${item.product_key}')" class="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center text-white"><i class="fa-solid fa-plus text-[10px]"></i></button></div></div></div>`;
        });
        html += `<div class="cart-summary mt-8 p-6 bg-slate-900/50 rounded-3xl border border-white/5"><div class="flex justify-between mb-4"><span class="text-secondary font-bold text-sm">Total</span><span class="text-xl font-black">₹${total.toFixed(2)}</span></div><button class="action-accent-button" onclick="AppEngine.checkout()">PLACE ORDER VIA WHATSAPP</button></div></div>`;
        cartTarget.innerHTML = html;
    },

    initSearch() {
        const input = document.getElementById('main-search-input');
        if (!input) return;
        input.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            const clearBtn = document.getElementById('btn-clear-search');
            const popularBox = document.getElementById('popular-searches-box');
            if (val.length > 0) { clearBtn.classList.remove('hidden'); popularBox.classList.add('hidden'); }
            else { clearBtn.classList.add('hidden'); popularBox.classList.remove('hidden'); }
            this.renderSearchResults(val);
        });
    },

    clearSearch() { const input = document.getElementById('main-search-input'); if (input) { input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); } },
    execPopularSearch(term) { const input = document.getElementById('main-search-input'); if (input) { input.value = term; input.dispatchEvent(new Event('input')); } },

    renderSearchResults(query = "") {
        const target = document.getElementById('search-results-target');
        if (!target || !query) { if (target) target.innerHTML = ""; return; }
        const filtered = this.products.filter(p => p.display_name.toLowerCase().includes(query.toLowerCase()) || p.category.toLowerCase().includes(query.toLowerCase()));
        if (filtered.length === 0) { target.innerHTML = `<p class="p-8 text-center text-slate-500 text-xs italic">No results for "${query}"</p>`; return; }
        target.innerHTML = filtered.map(p => {
            const qty = this.getQty(p.product_key);
            return `<div class="product-item-card glass-surface flex items-center gap-4 p-4 rounded-2xl bg-slate-900/50 border border-slate-800"><div class="w-12 h-12 bg-slate-950 rounded-xl flex items-center justify-center text-2xl"><i class="fa-solid fa-bottle-water text-teal-400"></i></div><div class="flex-1"><h4 class="text-white font-bold text-sm">${p.display_name}</h4><p class="text-teal-400 font-black text-xs">₹${parseFloat(p.unit_price).toFixed(2)}</p></div><div class="cart-control-node">${qty > 0 ? `<div class="flex items-center gap-3 bg-slate-900 rounded-xl p-1 border border-slate-800"><button onclick="AppEngine.removeFromCart('${p.product_key}')" class="w-8 h-8 flex items-center justify-center text-slate-400"><i class="fa-solid fa-minus text-[10px]"></i></button><span class="font-bold text-xs text-white min-w-[12px] text-center">${qty}</span><button onclick="AppEngine.addToCart('${p.product_key}')" class="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center text-white"><i class="fa-solid fa-plus text-[10px]"></i></button></div>` : `<button onclick="AppEngine.addToCart('${p.product_key}')" class="px-6 py-2.5 bg-teal-600 rounded-xl text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-teal-900/20 active:scale-95 transition">ADD</button>`}</div></div>`;
        }).join('');
    },

    // --- OTHER CORE LOGIC ---
    async fetchSystemSettings() {
        try {
            const { data, error } = await window.supabaseClient.from('system_settings').select('*');
            if (!error && data) data.forEach(s => this.systemSettings[s.key] = s.value);
        } catch (e) { console.error("Settings Fetch Failed", e); }
    },

    async handleSubscriptionIntent(productKey = null) {
        if (!this.currentUser) return alert("Please login to subscribe!");
        if (!this.currentUser.deposit_paid) this.openSubscriptionSetup(productKey);
        else { if (productKey) this.openSubscriptionFlow(productKey); else navigateTo('subscriptions'); }
    },

    openSubscriptionSetup(productKey) {
        const deposit = parseFloat(this.systemSettings.subscription_deposit || 2000);
        const planName = productKey ? productKey.replace(/_/g, ' ') : "Daily H2O Plan";
        this.pendingPlan = { key: productKey, name: planName, deposit: deposit };
        document.getElementById('setup-plan-name').innerText = planName;
        document.getElementById('setup-deposit-val').innerText = `₹${deposit.toFixed(2)}`;
        document.getElementById('setup-total-val').innerText = `₹${deposit.toFixed(2)}`;
        navigateTo('subscription-setup');
    },

    showPaymentForm(method) {
        ['options-list', 'form-upi', 'form-card', 'form-cod'].forEach(id => {
            const el = document.getElementById(id === 'options-list' ? 'payment-options-list' : id);
            if (el) el.classList.add('hidden');
        });
        const formEl = document.getElementById(`form-${method.toLowerCase()}`);
        if (formEl) formEl.classList.remove('hidden');
        if (method === 'Card') document.getElementById('btn-card-pay').innerText = `PAY ₹${this.pendingPlan.deposit.toFixed(2)} SECURELY`;
        if (method === 'UPI') this.resetUPIStatus();
    },

    resetUPIStatus() {
        const statusBox = document.getElementById('upi-status-icon');
        const tick = document.getElementById('upi-valid-tick');
        const cross = document.getElementById('upi-invalid-cross');
        const btnVerify = document.getElementById('btn-upi-verify');
        if (statusBox) statusBox.classList.add('hidden');
        if (tick) tick.classList.add('hidden');
        if (cross) cross.classList.add('hidden');
        if (btnVerify) { btnVerify.classList.remove('hidden'); btnVerify.disabled = true; }
    },

    validateUPIInput(val) {
        const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
        const isValid = upiRegex.test(val.trim());
        const statusBox = document.getElementById('upi-status-icon');
        const tick = document.getElementById('upi-valid-tick');
        const cross = document.getElementById('upi-invalid-cross');
        const btnVerify = document.getElementById('btn-upi-verify');
        if (val.length > 0) {
            statusBox.classList.remove('hidden');
            if (isValid) { tick.classList.remove('hidden'); cross.classList.add('hidden'); btnVerify.disabled = false; btnVerify.classList.replace('bg-slate-800', 'bg-teal-600'); }
            else { tick.classList.add('hidden'); cross.classList.remove('hidden'); btnVerify.disabled = true; btnVerify.classList.replace('bg-teal-600', 'bg-slate-800'); }
        } else { statusBox.classList.add('hidden'); btnVerify.disabled = true; }
    },

    initPaymentListeners() {
        const input = document.getElementById('upi-id');
        if (input) input.addEventListener('input', (e) => this.validateUPIInput(e.target.value));
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === 'visible' && this.paymentPending) this.finalizeTransactionAfterReturn(); });
    },

    verifyUPI() {
        const deposit = this.pendingPlan.deposit || this.MerchantConfig.default_deposit_amount;
        const upiUri = `upi://pay?pa=${this.MerchantConfig.merchant_upi_id}&pn=${encodeURIComponent(this.MerchantConfig.name)}&am=${deposit}&cu=INR`;
        this.paymentPending = true; this.currentPaymentMethod = 'UPI';
        if (this.IS_PRODUCTION) window.location.href = upiUri;
        else {
            const loader = document.getElementById('global-loader');
            const loaderText = loader.querySelector('p');
            loader.classList.remove('hidden');
            loaderText.innerText = "REDIRECTING TO YOUR PAYMENT APP...";
            setTimeout(() => { loaderText.innerText = `PLEASE AUTHORIZE THE ₹${deposit} TRANSACTION IN YOUR APP`; setTimeout(() => { this.finalizeTransactionAfterReturn(); }, 4000); }, 1500);
        }
    },

    async finalizeTransactionAfterReturn() {
        if (!this.paymentPending) return; this.paymentPending = false;
        const loader = document.getElementById('global-loader');
        const loaderText = loader.querySelector('p');
        loader.classList.remove('hidden'); loaderText.innerText = "CONFIRMING SETTLEMENT WITH BANK...";
        await new Promise(r => setTimeout(r, 2000));
        this.currentUser.deposit_paid = true;
        this.toggleServiceAlerts(false);
        loader.classList.add('hidden');
        this.showSuccessPopup();
    },

    showSuccessPopup() {
        const popup = document.getElementById('success-popup');
        const card = document.getElementById('success-card');
        popup.classList.remove('hidden');
        setTimeout(() => { card.classList.remove('scale-90', 'opacity-0'); card.classList.add('scale-100', 'opacity-100'); }, 100);
    },

    closeSuccess() { document.getElementById('success-popup').classList.add('hidden'); navigateTo('home'); },

    async fetchCustomerAssets() {
        if (!this.currentUser) return;
        const { data } = await window.supabaseClient.from('customers').select('jars_held, security_deposit').eq('customer_id', this.currentUser.customer_id).single();
        if (data) {
            const jarsEl = document.getElementById('ui-jars-held');
            const depEl = document.getElementById('ui-deposit-held');
            if (jarsEl) jarsEl.innerText = data.jars_held;
            if (depEl) depEl.innerText = `₹${parseFloat(data.security_deposit).toFixed(2)}`;
        }
    },

    loginSuccess(user) {
        this.currentUser = user;
        
        // 1. Force Instant Overlay Unmount (Ref: 1000300987.jpg Fix)
        const overlay = document.getElementById('auth-overlay');
        if (overlay) {
            overlay.classList.add('translate-y-full'); // Slide down
            overlay.style.opacity = '0'; // Instant transparency
            overlay.style.pointerEvents = 'none'; // Disable all interactions
            overlay.style.visibility = 'hidden'; // Remove from render tree
            
            // Completely remove from DOM after transition to save resources
            setTimeout(() => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }, 500);
        }
        
        console.log("LOGIN COMPLETE. Welcome:", user.phone_number);
        
        // 2. Start background engines
        this.initRealtime();
        this.initLocation();
        this.syncProfileUI();
        this.fetchCustomerAssets();
        this.fetchSubscriptions();
    },

    showNotificationToast(msg, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `fixed top-10 left-1/2 -translate-x-1/2 z-[1000] px-6 py-4 rounded-3xl shadow-2xl text-white font-bold text-xs flex items-center gap-3 animate-fadeIn bg-teal-600`;
        toast.innerHTML = `<i class="fa-solid fa-bell"></i> ${msg}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }
};

window.AppEngine = AppEngine;
