/*
 * branding.js
 *
 * This script injects a branding options selector into Shopify product pages. When
 * a shopper selects a branded option, the price is adjusted accordingly and a
 * file upload field appears to allow artwork to be provided. The script also
 * ensures that a one‑time setup fee is added to the cart without duplication.
 *
 * NOTE: This script relies on a backend service (the accompanying Express
 * server) to provide product configuration and to handle file uploads. It
 * communicates with the backend relative to its own hosting location.
 */

(function() {
  // Determine the origin of this script so API calls are sent to the correct server
  const scriptOrigin = new URL(document.currentScript.src).origin;

  /**
   * Attempt to extract the current product's JSON data. Many Shopify themes
   * include a script element with type="application/json" that contains
   * product information. Fallbacks are included for older themes.
   */
  function getProductData() {
    // Look for a script tag with data-product attribute (used by Dawn theme)
    const productScript = document.querySelector('script[data-product]');
    if (productScript) {
      try {
        return JSON.parse(productScript.textContent.trim());
      } catch (err) {
        console.warn('Failed to parse product JSON from data-product:', err);
      }
    }
    // Look for a product JSON contained in a script tag
    const jsonScripts = document.querySelectorAll('script[type="application/json"]');
    for (const s of jsonScripts) {
      try {
        const json = JSON.parse(s.textContent.trim());
        if (json && json.id && json.variants) {
          return json;
        }
      } catch (err) {
        // continue searching
      }
    }
    // Fallback to global variables (may not exist)
    if (window.meta && window.meta.product) {
      return window.meta.product;
    }
    if (window.product) {
      return window.product;
    }
    return null;
  }

  /**
   * Convert a number to a currency string. This implementation assumes ZAR
   * formatting (R for South African Rand). In a real app you would pull the
   * store's currency formatting settings.
   */
  function currencyFormat(amount) {
    return 'R' + amount.toFixed(2);
  }

  /**
   * Update the displayed product price based on the selected branding option
   * and quantity. This function finds a price element in the DOM and replaces
   * its text content. If your theme uses different selectors you may need to
   * adjust the query here.
   */
  function updateDisplayedPrice(basePrice, addPrice, quantity) {
    const priceEl = document.querySelector('[data-product-price], .product__price, .price__regular, .price-item');
    if (priceEl) {
      const newPrice = basePrice + addPrice * quantity;
      priceEl.textContent = currencyFormat(newPrice);
    }
  }

  /**
   * Main entry point. Fetch configuration and build the UI when product data
   * is available.
   */
  function init() {
    const product = getProductData();
    if (!product || !product.id) {
      return; // not a product page
    }
    const productId = product.id.toString();
    fetch(`${scriptOrigin}/api/options?productId=${encodeURIComponent(productId)}`)
      .then(res => res.json())
      .then(data => {
        if (!data.success || !data.options) {
          return; // no branding options for this product
        }
        const config = data.options;
        const options = config.options || [];
        // Insert our custom UI into the product form
        const form = document.querySelector('form[action^="/cart"]');
        if (!form) return;

        // Determine the base price from product JSON (price is in cents)
        const basePrice = (product.price || product.variants[0].price) / 100;
        // Create a wrapper element for our branding controls
        const wrapper = document.createElement('div');
        wrapper.className = 'branding-options';
        wrapper.style.margin = '1rem 0';

        // Label
        const label = document.createElement('label');
        label.textContent = 'Branding Options';
        label.style.display = 'block';
        label.style.marginBottom = '0.25rem';
        wrapper.appendChild(label);

        // Select element for branding options
        const select = document.createElement('select');
        select.name = 'properties[_branding_option]';
        select.style.padding = '0.5rem';
        select.style.width = '100%';
        options.forEach(opt => {
          const optEl = document.createElement('option');
          optEl.value = opt.value;
          optEl.dataset.price = opt.price;
          optEl.textContent = opt.label + (opt.price > 0 ? ` ( +${currencyFormat(opt.price)} )` : '');
          select.appendChild(optEl);
        });
        wrapper.appendChild(select);

        // File input for artwork upload; hidden by default
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.name = 'branding_file';
        fileInput.style.display = 'none';
        fileInput.accept = '.jpg,.jpeg,.png,.pdf,.eps,.ai,.svg';
        fileInput.style.marginTop = '0.5rem';
        wrapper.appendChild(fileInput);

        // Quantity selector; reuse existing quantity input if present
        let quantityInput = form.querySelector('input[name="quantity"]');
        if (!quantityInput) {
          quantityInput = document.createElement('input');
          quantityInput.type = 'number';
          quantityInput.name = 'quantity';
          quantityInput.min = '1';
          quantityInput.value = '1';
          quantityInput.style.marginTop = '0.5rem';
          quantityInput.style.padding = '0.5rem';
          quantityInput.style.width = '100%';
          wrapper.appendChild(quantityInput);
        }

        // Insert the wrapper into the form, just before the add to cart button
        const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
        form.insertBefore(wrapper, submitBtn);

        // Keep track of whether the setup fee variant is already present in the cart
        let feeAdded = false;

        // Event listeners to handle changes
        function handleOptionChange() {
          const selected = select.options[select.selectedIndex];
          const extra = parseFloat(selected.dataset.price);
          const qty = parseInt(quantityInput.value, 10) || 1;
          // Show or hide file input based on whether branding is selected
          fileInput.style.display = extra > 0 ? 'block' : 'none';
          updateDisplayedPrice(basePrice, extra, qty);
        }
        function handleQuantityChange() {
          const selected = select.options[select.selectedIndex];
          const extra = parseFloat(selected.dataset.price);
          const qty = parseInt(quantityInput.value, 10) || 1;
          updateDisplayedPrice(basePrice, extra, qty);
        }
        select.addEventListener('change', handleOptionChange);
        quantityInput.addEventListener('change', handleQuantityChange);

        // Initialize price display
        handleOptionChange();

        // Override the form submission to add our logic
        form.addEventListener('submit', function(event) {
          event.preventDefault();
          // Extract selected option information
          const selected = select.options[select.selectedIndex];
          const optionValue = selected.value;
          const optionLabel = selected.textContent;
          const optionPrice = parseFloat(selected.dataset.price);
          const qty = parseInt(quantityInput.value, 10) || 1;
          // Prepare line item properties
          const properties = {};
          properties['_branding_option'] = optionLabel;
          // Determine if a file needs to be uploaded
          let uploadPromise = Promise.resolve(null);
          if (optionPrice > 0 && fileInput.files.length > 0) {
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            uploadPromise = fetch(`${scriptOrigin}/api/upload`, {
              method: 'POST',
              body: formData
            }).then(resp => resp.json());
          }
          uploadPromise.then(uploadResult => {
            if (uploadResult && uploadResult.url) {
              properties['_branding_file'] = uploadResult.url;
            }
            // Build items array for cart
            const items = [];
            // Determine variant ID for the selected product; we choose the first variant if none is selected
            const variantId = (product.selected_or_first_available_variant || product.variants[0]).id;
            items.push({ id: variantId, quantity: qty, properties });
            // If branding is selected, add the setup fee product as a separate line item
            if (optionPrice > 0) {
              // Check the cart to avoid duplicate setup fee
              fetch('/cart.js')
                .then(resp => resp.json())
                .then(cart => {
                  const exists = cart.items.some(item => item.id.toString() === config.feeProductVariantId);
                  if (!exists) {
                    items.push({ id: parseInt(config.feeProductVariantId, 10), quantity: 1, properties: { _note: 'Branding Setup Fee' } });
                  }
                  addItemsToCart(items);
                })
                .catch(() => addItemsToCart(items));
            } else {
              addItemsToCart(items);
            }
          });
        });

        /**
         * Sends the items to Shopify's cart AJAX API and then redirects the
         * shopper to the cart page. Without using the store's form action the
         * additional fee line item would not be added.
         */
        function addItemsToCart(items) {
          fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items })
          })
            .then(resp => resp.json())
            .then(() => {
              // Redirect to cart page after successful addition
              window.location.href = '/cart';
            })
            .catch(err => {
              console.error('Failed to add items to cart', err);
            });
        }
      });
  }

  // Wait for the DOM to be fully loaded before running
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();