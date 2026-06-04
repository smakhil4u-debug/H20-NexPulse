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

let activeFilter = 'Bisleri';
let searchQuery = '';

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

    // Apply Filters
    let filtered = products.filter(p => {
        const matchesCat = activeFilter ? p.category.toLowerCase().includes(activeFilter.toLowerCase()) : true;
        const matchesSearch = searchQuery ? p.display_name.toLowerCase().includes(searchQuery.toLowerCase()) : true;
        return matchesCat && matchesSearch;
    });

    // Clear loading state
    target.innerHTML = '';

    if (filtered.length === 0) {
        target.innerHTML = `<p class="p-8 text-center text-secondary text-xs italic">No products found matching your search.</p>`;
        return;
    }

    filtered.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-item-card glass-surface';
        
        let icon = '🛢️';
        if (product.product_key.includes('Bottle') || product.product_key.includes('Premium')) icon = '💎';
        if (product.product_key.includes('500ml')) icon = '🏃';

        card.innerHTML = `
            <div class="product-info-row">
                <div class="product-visual">${icon}</div>
                <div class="product-details">
                    <span class="product-cat-tag">${product.category}</span>
                    <h4 class="product-name">${product.display_name}</h4>
                    <p class="product-price text-accent">₹${product.unit_price}</p>
                </div>
                <div class="product-action-node flex flex-col gap-2">
                    <button class="add-to-cart-btn" onclick="AppEngine.addToCart('${product.product_key}')">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                    <button class="w-9 h-9 border border-teal-500/30 rounded-xl flex items-center justify-center text-[10px] text-teal-400 font-bold" onclick="AppEngine.openSubscriptionFlow('${product.product_key}')">
                        SUB
                    </button>
                </div>
            </div>
        `;
        target.appendChild(card);
    });
}

// UI WIRING: Categories
document.querySelectorAll('.cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeFilter = chip.innerText.trim();
        syncProductUI();
    });
});

// UI WIRING: Search
const searchInput = document.getElementById('global-search');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        syncProductUI();
    });
}
