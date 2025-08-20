/* public/branding.js — universal hook for most themes */
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
    if (form.__brandingInjected) return form.__brandingUI; // avoid duplicates
    const fieldset = document.createElement("fieldset");
    fieldset.style.margin = "12px 0";

    const label = document.createElement("label");
    label.textContent = CONFIG.labels.selectLabel;
    label.style.display = "block";
    label.style.marginBottom = "6px";

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
    file.name = "properties[Artwork]"; // Shopify stores with line item
    file.accept = ".pdf,.ai,.eps,.svg,.png,.jpg,.jpeg";
    fileWrap.appendChild(fileLabel);
    fileWrap.appendChild(file);

    const toggleUpload = () => {
      fileWrap.style.display = select.value === CONFIG.labels.unbranded ? "none" : "block";
      window.__brandingSelected = select.value; // expose for global hook
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
    return res.json();
  }

  // Our own add calls carry a header so the global fetch hook ignores them
  async function addToCart(payload) {
    const headers = { Accept: "application/json", "X-Branding-App": "1" };
    const res = await fetch("/cart/add.js", {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: payload instanceof FormData ? payload : JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Add to cart failed");
    return res.json();
  }

  async function addSetupFeeOnce() {
    if (!CONFIG.setupFeeVariantId) return;
    const cart = await getCart();
    const exists = cart.items.some((i) => i.variant_id === Number(CONFIG.setupFeeVariantId));
    if (!exists) {
      await addToCart({
        id: Number(CONFIG.setupFeeVariantId),
        quantity: 1,
        properties: { _branding_setup_fee: "true" },
      });
    }
  }

  async function addPerUnitCharge(variantId, quantity, mainLineKey) {
    if (!variantId || !quantity) return;
    await addToCart({
      id: Number(variantId),
      quantity,
      properties: { _branding_charge_for: mainLineKey || "main-product" },
    });
  }

  function getQuantityInput(form) {
    return (
      form.querySelector('input[name="quantity"]') ||
      form.querySelector('input[type="number"][min="1"]') ||
      form.querySelector("#Quantity")
    );
  }

  // ---- Robust path A: we handle the whole branded add ourselves (submit/click) ----
  async function handleBrandedAdd(form, ui) {
    const fd = new FormData(form); // includes file & properties
    let mainItem;
    try {
      mainItem = await addToCart(fd);
    } catch (e) {
      console.warn("Main add failed, falling back to native submit", e);
      form.submit();
      return;
    }

    try {
      await addSetupFeeOnce();
    } catch (e2) {
      console.warn("Setup fee add failed/skipped", e2);
    }

    const qtyInput = getQuantityInput(form);
    const qty = qtyInput ? Number(qtyInput.value || 1) : 1;
    const perUnitVariantId = CONFIG.perUnitVariants[ui.select.value];
    if (perUnitVariantId) {
      try {
        await addPerUnitCharge(perUnitVariantId, qty, mainItem?.key);
      } catch (e3) {
        console.warn("Per-unit add failed", e3);
      }
    } else {
      console.warn("No per-unit variant mapped for:", ui.select.value);
    }

    if (!document.body.matches(".ajax-cart-enabled")) {
      window.location.href = "/cart";
    }
  }

  function interceptFormAndButton(form, ui) {
    // Submit path
    form.addEventListener(
      "submit",
      (e) => {
        const branded = ui.select.value !== CONFIG.labels.unbranded;
        if (!branded) return;
        e.preventDefault();
        handleBrandedAdd(form, ui);
      },
      { capture: true }
    );

    // Click path (themes that bypass submit)
    const addBtn =
      form.querySelector('button[name="add"]') ||
      form.querySelector('button[type="submit"]') ||
      form.querySelector('[data-add-to-cart]');
    if (addBtn) {
      addBtn.addEventListener(
        "click",
        (e) => {
          const branded = ui.select.value !== CONFIG.labels.unbranded;
          if (!branded) return;
          e.preventDefault();
          e.stopImmediatePropagation?.();
          handleBrandedAdd(form, ui);
        },
        true
      );
    }
  }

  // ---- Robust path B: global fetch hook (catches theme AJAX adds we didn't intercept) ----
  function installGlobalFetchHook() {
    if (window.__brandingFetchHooked) return;
    window.__brandingFetchHooked = true;

    const origFetch = window.fetch;
    window.fetch = async function (...args) {
      const req = args[0];
      const url = typeof req === "string" ? req : req.url || "";
      const init = args[1] || {};

      // Run the request first
      const res = await origFetch(...args);

      try {
        // Ignore our own fee adds
        const isOurCall =
          (init && init.headers && (init.headers["X-Branding-App"] || init.headers.get?.("X-Branding-App"))) ||
          (typeof req !== "string" && req.headers && (req.headers["X-Branding-App"] || req.headers.get?.("X-Branding-App")));

        const brandedChosen =
          window.__brandingSelected && window.__brandingSelected !== CONFIG.labels.unbranded;

        // Only react to successful native add-to-cart calls
        if (
          !isOurCall &&
          /\/cart\/add\.js(\?|$)/.test(url) &&
          res.ok &&
          brandedChosen
        ) {
          // Extract quantity if possible
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

          const perUnitVariantId = CONFIG.perUnitVariants[window.__brandingSelected];
          try {
            await addSetupFeeOnce();
            if (perUnitVariantId) {
              await addPerUnitCharge(perUnitVariantId, qty);
            }
          } catch (e) {
            console.warn("Branding fee add via global hook failed", e);
          }
        }
      } catch (e) {
        console.warn("Branding global hook error", e);
      }

      return res;
    };
  }

  function boot() {
    const form = findProductForm();
    if (!form) return;
    const ui = insertUI(form);
    interceptFormAndButton(form, ui);
    installGlobalFetchHook();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
