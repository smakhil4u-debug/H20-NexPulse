/**
 * H2O NexPulse - Dynamic Product Engine with Filtering
 */

async function fetchProductCatalog() {
    const supabase = window.supabaseClient;
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('products')
        .select('product_key, display_name, unit_price, category')
        .order('unit_price', { ascending: false });

    if (error) {
        console.error('Error fetching products:', error.message);
        return null;
    }
    return data;
}

let activeFilter = 'Daily H2O';
let searchQuery = '';

window.setProductFilter = function(category) {
    activeFilter = category;
    
    // Update chip UI if it exists
    document.querySelectorAll('.cat-chip').forEach(chip => {
        if (chip.innerText.trim() === category) chip.classList.add('active');
        else chip.classList.remove('active');
    });

    syncProductUI();
};

async function syncProductUI() {
    const target = document.getElementById('dynamic-product-list-target');
    if (!target) return;

    let products = await fetchProductCatalog();
    if (!products) {
        target.innerHTML = `<p class="error-msg">Failed to load products. Check connection.</p>`;
        return;
    }

    // Store in AppEngine for cart mapping
    window.AppEngine.products = products;

    // Apply Filters (Global Search Integrated)
    let filtered = products.filter(p => {
        const matchesCat = activeFilter ? p.category.toLowerCase() === activeFilter.toLowerCase() : true;
        const matchesSearch = searchQuery ? (
            p.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.category.toLowerCase().includes(searchQuery.toLowerCase())
        ) : true;
        
        // If there is a search query, ignore the category chip filter to allow global search
        if (searchQuery) return matchesSearch;
        return matchesCat && matchesSearch;
    });

    // Clear loading state
    target.innerHTML = '';

    if (filtered.length === 0) {
        target.innerHTML = `<p class="p-8 text-center text-secondary text-xs italic">No products found in "${activeFilter}".</p>`;
        return;
    }

    filtered.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-item-card glass-surface';
        
        let icon = 'fa-bottle-water'; // Unified modern bottle icon
        const qty = window.AppEngine.getQty(product.product_key);

        card.innerHTML = `
            <div class="product-info-row">
                <div class="product-visual"><i class="fa-solid ${icon}"></i></div>
                <div class="product-details">
                    <span class="product-cat-tag">${product.category}</span>
                    <h4 class="product-name">${product.display_name}</h4>
                    <p class="product-price text-accent">₹${parseFloat(product.unit_price).toFixed(2)}</p>
                </div>
                <div class="product-action-node flex flex-col gap-2 items-end">
                    <div class="cart-control-node">
                        ${qty > 0 ? `
                            <div class="flex items-center gap-3 bg-slate-900 rounded-xl p-1 border border-slate-800">
                                <button onclick="AppEngine.removeFromCart('${product.product_key}')" class="w-8 h-8 flex items-center justify-center text-slate-400"><i class="fa-solid fa-minus text-[10px]"></i></button>
                                <span class="font-bold text-xs text-white min-w-[12px] text-center">${qty}</span>
                                <button onclick="AppEngine.addToCart('${product.product_key}')" class="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center text-white"><i class="fa-solid fa-plus text-[10px]"></i></button>
                            </div>
                        ` : `
                            <button onclick="AppEngine.addToCart('${product.product_key}')" class="px-6 py-2.5 bg-teal-600 rounded-xl text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-teal-900/20 active:scale-95 transition">ADD</button>
                        `}
                    </div>
                    <button class="w-9 h-9 border border-teal-500/30 rounded-xl flex items-center justify-center text-[10px] text-teal-400 font-bold" onclick="AppEngine.handleSubscriptionIntent('${product.product_key}')">
                        SUB
                    </button>
                </div>
            </div>
        `;
        target.appendChild(card);
    });
}

// UI WIRING: Categories
function initCategoryChips() {
    document.querySelectorAll('.cat-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            window.setProductFilter(chip.innerText.trim());
        });
    });
}

// UI WIRING: Search
const searchInput = document.getElementById('global-search');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        
        // If user is searching, navigate to products view to show results
        if (searchQuery.length > 0) {
            if (typeof navigateTo === 'function') navigateTo('products');
        }
        
        syncProductUI();
    });
}

// Initialize chips on script load
initCategoryChips();
