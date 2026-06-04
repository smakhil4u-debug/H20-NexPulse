/**
 * Fetch active products matching your UI layout from Supabase
 */
async function fetchProductCatalog() {
  const supabase = window.supabaseClient;
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('products')
    .select('product_key, display_name, unit_price');

  if (error) {
    console.error('Error fetching data from Supabase:', error.message);
    return null;
  }
  
  return data;
}

// Global function to sync the UI with the fetched data
async function syncProductUI() {
    const products = await fetchProductCatalog();
    if (!products) return;

    products.forEach(product => {
        // Map product_key to the UI IDs
        // UI IDs used: can, b2l, b1l, b500m
        let uiKey = '';
        if (product.product_key === '20L_Master_Can') uiKey = 'can';
        else if (product.product_key === '2L_Premium') uiKey = 'b2l';
        else if (product.product_key === '1L_Premium') uiKey = 'b1l';
        else if (product.product_key === '500ml_Premium') uiKey = 'b500m';

        if (uiKey) {
            const priceEl = document.getElementById(`${uiKey}-price`);
            if (priceEl) priceEl.innerText = product.unit_price;
            
            // Update app state price if needed
            if (window.cart && window.cart[uiKey]) {
                window.cart[uiKey].price = product.unit_price;
            }
        }
    });
    console.log("Product UI synchronized with Supabase.");
}
