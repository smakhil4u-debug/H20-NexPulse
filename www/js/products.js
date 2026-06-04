/**
 * H2O NexPulse - Dynamic Product Engine
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

async function syncProductUI() {
    const target = document.getElementById('dynamic-product-list-target');
    if (!target) return;

    const products = await fetchProductCatalog();
    if (!products) {
        target.innerHTML = `<p class="error-msg">Failed to load products. Check connection.</p>`;
        return;
    }

    // Clear loading state
    target.innerHTML = '';
    
    // Store in AppEngine
    window.AppEngine.products = products;

    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-item-card glass-surface';
        
        // Define icons based on product type
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

// Simple Cart Logic for the new SPA
window.appCart = [];

function addToCart(productKey) {
    window.appCart.push(productKey);
    console.log("Cart Updated:", window.appCart);
    updateCartBadge();
}

function updateCartBadge() {
    // Logic to update cart tab icon or badge if needed
}
