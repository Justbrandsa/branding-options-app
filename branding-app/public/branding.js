/* public/branding.js — debug version */
(() => {
  const CONFIG = {
    // ✅ Your real Shopify variant IDs
    setupFeeVariantId: 10009319473445,
    perUnitVariants: {
      "1 colour screen print, 1 position": 10009331958053,
      "Embroidery, 1 position up to 8000 stitches": 10009343852837,
      "Full colour print (DTF), 1 position": 10009355485477,
    },
    labels: {
      selectLabel: "Choose Branding Options",
      unbranded: "Unbranded",
      fileLabel: "Upload artwork",
    },
  };

  console.log("🔧 Branding app loaded, CONFIG:", CONFIG);

  const $ = (sel, root = document) => root.querySelector(sel);

  function findProductForm() {
    return (
      document.querySelector('form[action^="/cart/add"]') ||
      document.querySelector("#product-form") ||
      document.querySelector('[data-product-form]') ||
      document.querySelector("form.product-form")
    );
  }

  function insertUI(form) {
    if (form.__brandingInjected) return form.__brandingUI;
    console.log("🔧 Inserting branding UI");
    
    const fieldset = document.createElement("fieldset");
    fieldset.style.margin = "12px 0";
    fieldset.style.border = "1px solid #ddd";
    fieldset.style.padding = "10px";

    const label = document.createElement("label");
    label.textContent = CONFIG.labels.selectLabel;
    label.style.display = "block";
    label.style.marginBottom = "6px";
    label.style.fontWeight = "bold";

    const select = document.createElement("select");
    select.name = "properties[Branding Option]";
    select.style.minWidth = "260px";

    const opt0 = document.createElement("option");
    opt0.value = CONFIG.labels.unbranded;
    opt0.textContent = CONFIG.labels.unbranded;
    select.appendChild(opt0);

    Object.keys(CONFIG.perUnitVariants).forEach((k) => {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = k;
      select.appendChild(o);
    });

    const fileWrap = document.createElement("div");
    fileWrap.style.marginTop = "8px";
    const fileLabel = document.createElement("label");
    fileLabel.textContent = CONFIG.labels.fileLabel;
    fileLabel.style.display = "block";
    fileLabel.style.marginBottom = "4px";
    const file = document.createElement("input");
    file.type = "file";
    file.name = "properties[Artwork]";
    file.accept = ".pdf,.ai,.eps,.svg,.png,.jpg,.jpeg";
    fileWrap.appendChild(fileLabel);
    fileWrap.appendChild(file);

    const toggleUpload = () => {
      fileWrap.style.display = select.value === CONFIG.labels.unbranded ? "none" : "block";
      window.__brandingSelected = select.value;
      console.log("🔧 Branding selection changed to:", select.value);
    };
    select.addEventListener("change", toggleUpload);
    toggleUpload();

    fieldset.appendChild(label);
    fieldset.appendChild(select);
    fieldset.appendChild(fileWrap);
    form.insertBefore(fieldset, form.firstChild);

    form.__brandingInjected = true;
    form.__brandingUI = { select };
    return form.__brandingUI;
  }

  async function getCart() {
    const res = await fetch("/cart.js", { credentials: "same-origin" });
    const cart = await res.json();
    console.log("🔧 Current cart:", cart);
    return cart;
  }

  async function addToCart(payload) {
    console.log("🔧 Adding to cart:", payload);
    const headers = { Accept: "application/json", "X-Branding-App": "1" };
    if (!(payload instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch("/cart/add.js", {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: payload instanceof FormData ? payload : JSON.stringify(payload),
    });
    
    const result = await res.json();
    console.log("🔧 Add to cart result:", result);
    
    if (!res.ok) {
      console.error("🔧 Add to cart failed:", result);
      throw new Error("Add to cart failed: " + (result.description || result.message));
    }
    return result;
  }

  async function addSetupFeeOnce() {
    if (!CONFIG.setupFeeVariantId) {
      console.log("🔧 No setup fee variant ID configured");
      return;
    }
    
    console.log("🔧 Checking for existing setup fee...");
    const cart = await getCart();
    const exists = cart.items.some((i) => i.variant_id === Number(CONFIG.setupFeeVariantId));
    
    if (!exists) {
      console.log("🔧 Adding setup fee variant:", CONFIG.setupFeeVariantId);
      try {
        const result = await addToCart({
          id: Number(CONFIG.setupFeeVariantId),
          quantity: 1,
          properties: { _branding_setup_fee: "true" },
        });
        console.log("🔧 Setup fee added successfully:", result);
      } catch (error) {
        console.error("🔧 Setup fee add failed:", error);
        throw error;
      }
    } else {
      console.log("🔧 Setup fee already exists in cart");
    }
  }

  async function addPerUnitCharge(variantId, quantity, mainLineKey) {
    if (!variantId || !quantity) {
      console.log("🔧 Skipping per-unit charge - missing variantId or quantity");
      return;
    }
    
    console.log("🔧 Adding per-unit charge:", { variantId, quantity, mainLineKey });
    try {
      const result = await addToCart({
        id: Number(variantId),
        quantity,
        properties: { _branding_charge_for: mainLineKey || "main-product" },
      });
      console.log("🔧 Per-unit charge added successfully:", result);
    } catch (error) {
      console.error("🔧 Per-unit charge add failed:", error);
      throw error;
    }
  }

  function getQuantityInput(form) {
    return (
      form.querySelector('input[name="quantity"]') ||
      form.querySelector('input[type="number"][min="1"]') ||
      form.querySelector("#Quantity")
    );
  }

  // Enhanced cart refresh function
  async function refreshCartDisplay() {
    console.log("🔧 Attempting to refresh cart display...");
    
    try {
      // Get updated cart
      const cart = await getCart();
      console.log("🔧 Updated cart for refresh:", cart);
      
      // Method 1: Trigger Shopify's built-in cart events
      document.dispatchEvent(new CustomEvent('cart:updated', { detail: cart }));
      document.dispatchEvent(new CustomEvent('cart:refresh', { detail: cart }));
      
      // Method 2: Update cart elements directly
      const cartTotalSelectors = [
        '[data-cart-total]',
        '.cart-total',
        '.cart__total',
        '#cart-total',
        '.cart-subtotal'
      ];
      
      cartTotalSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (window.Shopify && window.Shopify.formatMoney) {
            el.textContent = window.Shopify.formatMoney(cart.total_price);
          } else {
            el.textContent = `$${(cart.total_price / 100).toFixed(2)}`;
          }
          console.log("🔧 Updated total element:", el);
        });
      });
      
      // Method 3: Update cart count
      const cartCountSelectors = [
        '[data-cart-count]',
        '.cart-count',
        '.cart__count',
        '#cart-count'
      ];
      
      cartCountSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          el.textContent = cart.item_count;
          console.log("🔧 Updated count element:", el);
        });
      });
      
      // Method 4: Trigger theme-specific updates
      if (window.theme) {
        console.log("🔧 Theme object found:", Object.keys(window.theme));
        
        // Try common theme cart update methods
        if (window.theme.cartDrawer && typeof window.theme.cartDrawer.updateCart === 'function') {
          window.theme.cartDrawer.updateCart();
        }
        if (window.theme.cart && typeof window.theme.cart.update === 'function') {
          window.theme.cart.update();
        }
      }
      
    } catch (error) {
      console.error("🔧 Cart refresh failed:", error);
    }
  }

  // ---- Handle branded add with enhanced debugging ----
  async function handleBrandedAdd(form, ui) {
    console.log("🔧 Starting branded add process...");
    
    const fd = new FormData(form);
    console.log("🔧 Form data entries:");
    for (let [key, value] of fd.entries()) {
      console.log(`  ${key}:`, value);
    }
    
    let mainItem;
    try {
      console.log("🔧 Adding main product...");
      mainItem = await addToCart(fd);
      console.log("🔧 Main product added:", mainItem);
    } catch (e) {
      console.error("🔧 Main add failed:", e);
      form.submit();
      return;
    }

    try {
      console.log("🔧 Adding setup fee...");
      await addSetupFeeOnce();
    } catch (e2) {
      console.error("🔧 Setup fee add failed:", e2);
    }

    const qtyInput = getQuantityInput(form);
    const qty = qtyInput ? Number(qtyInput.value || 1) : 1;
    console.log("🔧 Quantity:", qty);
    
    const perUnitVariantId = CONFIG.perUnitVariants[ui.select.value];
    console.log("🔧 Per-unit variant ID for", ui.select.value, ":", perUnitVariantId);
    
    if (perUnitVariantId) {
      try {
        console.log("🔧 Adding per-unit charge...");
        await addPerUnitCharge(perUnitVariantId, qty, mainItem?.key);
      } catch (e3) {
        console.error("🔧 Per-unit add failed:", e3);
      }
    }

    // Wait a moment then refresh
    console.log("🔧 Waiting before cart refresh...");
    setTimeout(async () => {
      await refreshCartDisplay();
      console.log("🔧 Cart refresh completed");
    }, 1000);

    if (!document.body.matches(".ajax-cart-enabled")) {
      console.log("🔧 Redirecting to cart page...");
      setTimeout(() => {
        window.location.href = "/cart";
      }, 1500);
    }
  }

  function interceptFormAndButton(form, ui) {
    console.log("🔧 Setting up form interception");
    
    // Submit path
    form.addEventListener(
      "submit",
      (e) => {
        const branded = ui.select.value !== CONFIG.labels.unbranded;
        console.log("🔧 Form submit detected, branded:", branded);
        if (!branded) return;
        e.preventDefault();
        handleBrandedAdd(form, ui);
      },
      { capture: true }
    );

    // Click path
    const addBtn =
      form.querySelector('button[name="add"]') ||
      form.querySelector('button[type="submit"]') ||
      form.querySelector('[data-add-to-cart]');
      
    if (addBtn) {
      console.log("🔧 Add button found:", addBtn);
      addBtn.addEventListener(
        "click",
        (e) => {
          const branded = ui.select.value !== CONFIG.labels.unbranded;
          console.log("🔧 Add button clicked, branded:", branded);
          if (!branded) return;
          e.preventDefault();
          e.stopImmediatePropagation?.();
          handleBrandedAdd(form, ui);
        },
        true
      );
    } else {
      console.warn("🔧 No add button found");
    }
  }

  // Global fetch hook with better debugging
  function installGlobalFetchHook() {
    if (window.__brandingFetchHooked) return;
    window.__brandingFetchHooked = true;
    console.log("🔧 Installing global fetch hook");

    const origFetch = window.fetch;
    window.fetch = async function (...args) {
      const req = args[0];
      const url = typeof req === "string" ? req : req.url || "";
      const init = args[1] || {};

      // Run the request first
      const res = await origFetch(...args);

      try {
        const isOurCall =
          (init && init.headers && (init.headers["X-Branding-App"] || init.headers.get?.("X-Branding-App"))) ||
          (typeof req !== "string" && req.headers && (req.headers["X-Branding-App"] || req.headers.get?.("X-Branding-App")));

        const brandedChosen =
          window.__brandingSelected && window.__brandingSelected !== CONFIG.labels.unbranded;

        if (/\/cart\/add\.js(\?|$)/.test(url)) {
          console.log("🔧 Cart add detected:", {
            url,
            isOurCall,
            brandedChosen,
            success: res.ok,
            selectedBranding: window.__brandingSelected
          });
        }

        if (
          !isOurCall &&
          /\/cart\/add\.js(\?|$)/.test(url) &&
          res.ok &&
          brandedChosen
        ) {
          console.log("🔧 Processing branding add via global hook...");
          
          let qty = 1;
          const body = init?.body;
          if (body instanceof FormData) {
            qty = Number(body.get("quantity") || 1);
          } else if (typeof body === "string") {
            try {
              const parsed = JSON.parse(body);
              qty = Number(parsed.quantity || 1);
            } catch {}
          }
          
          console.log("🔧 Extracted quantity:", qty);

          const perUnitVariantId = CONFIG.perUnitVariants[window.__brandingSelected];
          try {
            await addSetupFeeOnce();
            if (perUnitVariantId) {
              await addPerUnitCharge(perUnitVariantId, qty);
            }
            
            setTimeout(async () => {
              await refreshCartDisplay();
            }, 1000);
            
          } catch (e) {
            console.error("🔧 Branding fee add via global hook failed:", e);
          }
        }
      } catch (e) {
        console.error("🔧 Global hook error:", e);
      }

      return res;
    };
  }

  async function refreshCartDisplay() {
    console.log("🔧 Starting cart refresh...");
    
    try {
      const cart = await getCart();
      console.log("🔧 Cart for refresh:", cart);
      
      // Force a complete page reload if AJAX cart
      if (document.body.matches(".ajax-cart-enabled") || 
          document.querySelector('[data-cart-drawer]') ||
          document.querySelector('.cart-drawer')) {
        console.log("🔧 AJAX cart detected, forcing reload...");
        window.location.reload();
        return;
      }
      
      // Otherwise try to update elements
      const cartTotalSelectors = [
        '[data-cart-total]',
        '.cart-total',
        '.cart__total',
        '#cart-total',
        '.cart-subtotal',
        '.total-price'
      ];
      
      let updatedAny = false;
      cartTotalSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const formatted = window.Shopify && window.Shopify.formatMoney 
            ? window.Shopify.formatMoney(cart.total_price)
            : `$${(cart.total_price / 100).toFixed(2)}`;
          el.textContent = formatted;
          updatedAny = true;
          console.log("🔧 Updated total element:", selector, "to:", formatted);
        });
      });
      
      if (!updatedAny) {
        console.log("🔧 No cart total elements found, forcing page reload...");
        window.location.reload();
      }
      
    } catch (error) {
      console.error("🔧 Cart refresh error:", error);
      // Fallback: reload the page
      window.location.reload();
    }
  }

  function boot() {
    console.log("🔧 Booting branding app...");
    const form = findProductForm();
    if (!form) {
      console.warn("🔧 No product form found");
      return;
    }
    console.log("🔧 Product form found:", form);
    
    const ui = insertUI(form);
    interceptFormAndButton(form, ui);
    installGlobalFetchHook();
    
    console.log("🔧 Branding app setup complete");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
