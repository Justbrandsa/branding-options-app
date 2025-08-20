/* public/branding.js — debug version with per-category setup fee */
(() => {
  const CONFIG = {
    // ✅ Setup fee SKUs mapped by branding_category
    setupFeeVariants: {
      "apparel": 10009319473445,   // T-shirts, hoodies
      "drinkware": 10009319473446, // mugs, bottles
      "headwear": 10009319473447   // caps, beanies
    },
    // ✅ Per-unit branding fee SKUs mapped as "category:option"
    perUnitVariants: {
      "apparel:Embroidery, 1 position up to 8000 stitches": 10009343852837,
      "apparel:Screen print, 1 colour": 10009331958053,
      "drinkware:Full colour print (DTF)": 10009355485477,
    },
    labels: {
      selectLabel: "Choose Branding Options",
      unbranded: "Unbranded",
      fileLabel: "Upload artwork",
    },
    // ✅ Product type injected via Liquid on PDP
    productType: window.__JB_PRODUCT_TYPE || "unclassified",
  };

  console.log("🔧 Branding app loaded, CONFIG:", CONFIG);

  // --- Utilities ---
  const $ = (sel, root = document) => root.querySelector(sel);

  async function getCart() {
    const res = await fetch("/cart.js", { credentials: "same-origin" });
    return await res.json();
  }

  async function addToCart(payload) {
    const res = await fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Branding-App": "1" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.description || result.message);
    return result;
  }

  // --- Setup Fee per category ---
  async function addSetupFeeForCategory(category) {
    const feeVariantId = CONFIG.setupFeeVariants[category];
    if (!feeVariantId) {
      console.log("🔧 No setup fee variant for category:", category);
      return;
    }
    const cart = await getCart();
    const exists = cart.items.some(
      (i) =>
        i.variant_id === Number(feeVariantId) &&
        i.properties &&
        i.properties._branding_setup_type === category
    );
    if (!exists) {
      console.log("🔧 Adding setup fee for:", category);
      await addToCart({
        id: feeVariantId,
        quantity: 1,
        properties: { _branding_setup_fee: "true", _branding_setup_type: category },
      });
    } else {
      console.log("🔧 Setup fee already exists for:", category);
    }
  }

  async function addPerUnitCharge(key, quantity, mainLineKey) {
    const variantId = CONFIG.perUnitVariants[key];
    if (!variantId) return;
    console.log("🔧 Adding per-unit fee:", key, "x", quantity);
    await addToCart({
      id: variantId,
      quantity,
      properties: { _branding_charge_for: mainLineKey || "main" },
    });
  }

  // --- UI Injection ---
  function insertUI(form) {
    if (form.__brandingInjected) return form.__brandingUI;

    const fieldset = document.createElement("fieldset");
    fieldset.style.margin = "12px 0";
    fieldset.style.border = "1px solid #ddd";
    fieldset.style.padding = "10px";

    const label = document.createElement("label");
    label.textContent = CONFIG.labels.selectLabel;
    label.style.display = "block";
    label.style.fontWeight = "bold";

    const select = document.createElement("select");
    select.name = "properties[Branding Option]";
    select.style.minWidth = "260px";

    const opt0 = document.createElement("option");
    opt0.value = CONFIG.labels.unbranded;
    opt0.textContent = CONFIG.labels.unbranded;
    select.appendChild(opt0);

    // show only per-unit options that match this product type
    Object.keys(CONFIG.perUnitVariants).forEach((k) => {
      if (k.startsWith(CONFIG.productType + ":")) {
        const niceLabel = k.split(":")[1];
        const o = document.createElement("option");
        o.value = k;
        o.textContent = niceLabel;
        select.appendChild(o);
      }
    });

    const fileWrap = document.createElement("div");
    fileWrap.style.marginTop = "8px";
    const fileLabel = document.createElement("label");
    fileLabel.textContent = CONFIG.labels.fileLabel;
    const file = document.createElement("input");
    file.type = "file";
    file.name = "properties[Artwork]";
    file.accept = ".pdf,.ai,.eps,.svg,.png,.jpg,.jpeg";
    fileWrap.appendChild(fileLabel);
    fileWrap.appendChild(file);

    const toggleUpload = () => {
      fileWrap.style.display =
        select.value === CONFIG.labels.unbranded ? "none" : "block";
      window.__brandingSelected = select.value;
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

  // --- Add to Cart Handler ---
  async function handleBrandedAdd(form, ui) {
    const fd = new FormData(form);
    const qty = Number(fd.get("quantity") || 1);
    const brandingKey = ui.select.value;

    // Add main product
    let mainItem;
    try {
      mainItem = await addToCart(fd);
    } catch (err) {
      console.error("🔧 Main add failed", err);
      form.submit();
      return;
    }

    if (brandingKey !== CONFIG.labels.unbranded) {
      try {
        await addSetupFeeForCategory(CONFIG.productType);
        await addPerUnitCharge(brandingKey, qty, mainItem.key);
      } catch (e) {
        console.error("🔧 Fee add failed", e);
      }
    }

    window.location.href = "/cart";
  }

  function intercept(form, ui) {
    form.addEventListener(
      "submit",
      (e) => {
        if (ui.select.value === CONFIG.labels.unbranded) return;
        e.preventDefault();
        handleBrandedAdd(form, ui);
      },
      true
    );
  }

  // --- Boot ---
  function boot() {
    const form =
      document.querySelector('form[action^="/cart/add"]') ||
      document.querySelector("form.product-form");
    if (!form) return;

    const ui = insertUI(form);
    intercept(form, ui);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
