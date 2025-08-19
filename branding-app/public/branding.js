/* public/branding.js — Vercel-friendly, no server required */
(() => {
  const CONFIG = {
    // 🔁 REPLACE these with your real Shopify variant IDs
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
    file.name = "properties[Artwork]"; // Shopify saves this with the line item
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

    return { select };
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

  function interceptSubmit(form, ui) {
    form.addEventListener("submit", async (e) => {
      const branded = ui.select.value !== CONFIG.labels.unbranded;
      if (!branded) return; // normal flow

      e.preventDefault();

      // 1) Add main product with properties (includes the artwork file)
      const fd = new FormData(form);
      let mainItem;
      try {
        mainItem = await addToCart(fd);
      } catch {
        form.submit(); // fallback to theme behavior
        return;
      }

      // 2) One-time setup fee
      try {
        await addSetupFeeOnce();
      } catch {}

      // 3) Per-unit charge, same qty as main product
      const qtyInput = getQuantityInput(form);
      const qty = qtyInput ? Number(qtyInput.value || 1) : 1;
      const perUnitVariantId = CONFIG.perUnitVariants[ui.select.value];
      try {
        await addPerUnitCharge(perUnitVariantId, qty, mainItem?.key);
      } catch {}

      // 4) Go to cart if your theme doesn’t open a drawer
      if (!document.body.matches(".ajax-cart-enabled")) {
        window.location.href = "/cart";
      }
    });
  }

  function boot() {
    const form = findProductForm();
    if (!form) return;
    const ui = insertUI(form);
    interceptSubmit(form, ui);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
