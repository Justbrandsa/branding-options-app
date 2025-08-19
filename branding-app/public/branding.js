/* public/branding.js — Vercel-friendly, no server required */
(() => {
  const CONFIG = {
    // ✅ Your real Shopify variant IDs
    setupFeeVariantId: 8651112710282, // Branding Setup Fee variant ID
    perUnitVariants: {
      "1 colour screen print, 1 position": 8651115561098,
      "Embroidery, 1 position up to 8000 stitches": 8651116052618,
      "Full colour print (DTF), 1 position": 8651116314762,
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

  async function addToCart(payload) {
    const res = await fetch("/cart/add.js", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
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

  async function handleBrandedAdd(form, ui) {
    // 1) Add main product with properties (includes artwork file)
    const fd = new FormData(form);
    let mainItem;
    try {
      mainItem = await addToCart(fd);
    } catch (e) {
      console.warn("Main add failed, falling back to native submit", e);
      form.submit();
      return;
    }

    // 2) One-time setup fee
    try {
      await addSetupFeeOnce();
    } catch (e2) {
      console.warn("Setup fee add failed/skipped", e2);
    }

    // 3) Per-unit charge (qty matches main product)
    const qtyInput = getQuantityInput(form);
    const qty = qtyInput ? Number(qtyInput.value || 1) : 1;
    const perUnitVariantId = CONFIG.perUnitVariants[ui.select.value];
    if (!perUnitVariantId) {
      console.warn("No per-unit variant ID mapped for:", ui.select.value);
    } else {
      try {
        await addPerUnitCharge(perUnitVariantId, qty, mainItem?.key);
      } catch (e3) {
        console.warn("Per-unit add failed", e3);
      }
    }

    // 4) Go to cart if the theme doesn't open a drawer
    if (!document.body.matches(".ajax-cart-enabled")) {
      window.location.href = "/cart";
    }
  }

  function interceptBoth(form, ui) {
    // A) submit hook (some themes use this)
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

    // B) click hook (covers themes that bypass native submit)
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

  function boot() {
    const form = findProductForm();
    if (!form) return;
    const ui = insertUI(form);
    interceptBoth(form, ui);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
