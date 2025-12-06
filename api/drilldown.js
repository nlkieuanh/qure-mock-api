export default function handler(req, res) {
  const code = `
    document.addEventListener("DOMContentLoaded", function () {

      const card = document.querySelector(".card-block-wrap.product-combination-card");
      if (!card) return;

      const wrapper = card.querySelector(".adv-channel-table-wrapper");
      const chipContainer = card.querySelector(".dd-chips-container");

      const API_PRODUCTS  = "https://qure-mock-api.vercel.app/api/products";
      const API_USECASES  = "https://qure-mock-api.vercel.app/api/usecases";
      const API_ANGLES    = "https://qure-mock-api.vercel.app/api/angles";

      // ======================================================
      // STATE
      // ======================================================
      window.__ddState = {
        level: "product",
        product: null,
        usecase: null,
        angle: null,
        filters: []    // array of {type, value}
      };

      // ======================================================
      // TAB UI
      // ======================================================
      function updateTabs() {
        const tabs = card.querySelectorAll(".drilldown-tab-button");
        tabs.forEach(btn => {
          btn.classList.toggle("is-current", btn.dataset.tab === window.__ddState.level);
        });
      }

      function attachTabHandlers() {
        const tabs = card.querySelectorAll(".drilldown-tab-button");

        tabs.forEach(btn => {
          btn.addEventListener("click", () => {
            const level = btn.dataset.tab;
            if (!level) return;

            // RESET DRILLDOWN STATE
            window.__ddState.level = level;
            window.__ddState.product = null;
            window.__ddState.usecase = null;
            window.__ddState.angle = null;
            window.__ddState.rowFilter = null;

            renderChips();
            updateTabs();

            // FULL VIEW logic
            if (level === "product") loadProducts();
            if (level === "usecase") loadAllUseCases();
            if (level === "angle")   loadAllAngles();
          });
        });
      }

      // ======================================================
      // CHIP UI
      // ======================================================
      function renderChips() {
  chipContainer.innerHTML = "";

  window.__ddState.filters.forEach((f, index) => {
    const chip = document.createElement("div");
    chip.className = "dd-chip";

    chip.innerHTML = \`
      <span class="dd-chip-label">\${f.type}: \${f.value}</span>
      <div class="dd-chip-remove">✕</div>
    \`;

    chip.querySelector(".dd-chip-remove").addEventListener("click", () => {
      // Remove this chip
      window.__ddState.filters.splice(index, 1);

      // Reset drilldown state based on remaining chips
      window.__ddState.product = null;
      window.__ddState.usecase = null;

      window.__ddState.filters.forEach(ch => {
        if (ch.type === "product") window.__ddState.product = ch.value;
        if (ch.type === "usecase") window.__ddState.usecase = ch.value;
      });

      // Reload correct level
      if (window.__ddState.level === "product") loadProducts();
      if (window.__ddState.level === "usecase") {
        if (window.__ddState.product) loadUseCasesFiltered(window.__ddState.product);
        else loadAllUseCases();
      }
      if (window.__ddState.level === "angle") {
        if (window.__ddState.product && window.__ddState.usecase)
          loadAnglesFiltered(window.__ddState.product, window.__ddState.usecase);
        else loadAllAngles();
      }

      renderChips();
    });

    chipContainer.appendChild(chip);
  });
}


      // ======================================================
      // APPLY CHIP FILTER — ONLY FOR FULL MODE
      // ======================================================
      function applyChipFilter(items) {
        const f = window.__ddState.rowFilter;
        if (!f) return items;

        // Only filter in FULL VIEW
        if (window.__ddState.product || window.__ddState.usecase) return items;

        return items.filter(i => i.name === f.value);
      }

      // ======================================================
      // TABLE RENDERERS
      // ======================================================
      function renderProductTable(items) {
        window.__ddState.level = "product";
        updateTabs();

        items = applyChipFilter(items);

        let html = \`
        <table class="adv-channel-table">
          <thead><tr>
            <th>Product</th><th>Ads</th><th>Spend</th><th>Impressions</th>
          </tr></thead><tbody>\`;

        items.forEach(p => {
          html += \`
            <tr class="dd-row" data-value="\${p.name}">
              <td>\${p.name}</td><td>\${p.adsCount}</td>
              <td>$\${p.spend.toLocaleString()}</td>
              <td>\${p.impressions.toLocaleString()}</td>
            </tr>\`;
        });

        wrapper.innerHTML = html + "</tbody></table>";

        wrapper.querySelectorAll(".dd-row").forEach(row => {
          row.addEventListener("click", () => {
            const product = row.dataset.value;

            window.__ddState.filters = [
  { type: "product", value: product }
];

            window.__ddState.product = product;

            renderChips();
            loadUseCasesFiltered(product);
          });
        });
      }

      function renderUseCaseTable(items) {
        window.__ddState.level = "usecase";
        updateTabs();

        items = applyChipFilter(items);

        let html = \`
        <table class="adv-channel-table">
          <thead><tr>
            <th>Use Case</th><th>Ads</th><th>Spend</th><th>Impressions</th>
          </tr></thead><tbody>\`;

        items.forEach(uc => {
          html += \`
            <tr class="dd-row" data-value="\${uc.name}">
              <td>\${uc.name}</td><td>\${uc.adsCount}</td>
              <td>$\${uc.spend.toLocaleString()}</td>
              <td>\${uc.impressions.toLocaleString()}</td>
            </tr>\`;
        });

        wrapper.innerHTML = html + "</tbody></table>";

        wrapper.querySelectorAll(".dd-row").forEach(row => {
          row.addEventListener("click", () => {
            const usecase = row.dataset.value;

            window.__ddState.filters.push({ type: "usecase", value: usecase });

            window.__ddState.usecase = usecase;

            renderChips();
            loadAnglesFiltered(window.__ddState.product, usecase);
          });
        });
      }

      function renderAngleTable(items) {
        window.__ddState.level = "angle";
        updateTabs();

        items = applyChipFilter(items);

        let html = \`
        <table class="adv-channel-table">
          <thead><tr>
            <th>Angle</th><th>Ads</th><th>Spend</th><th>Impressions</th>
          </tr></thead><tbody>\`;

        items.forEach(a => {
          html += \`
            <tr class="dd-row" data-value="\${a.name}">
              <td>\${a.name}</td><td>\${a.adsCount}</td>
              <td>$\${a.spend.toLocaleString()}</td>
              <td>\${a.impressions.toLocaleString()}</td>
            </tr>\`;
        });

        wrapper.innerHTML = html + "</tbody></table>";
      }

      // ======================================================
      // LOAD FUNCTIONS
      // ======================================================
      function loadProducts() {
        fetch(API_PRODUCTS)
          .then(r => r.json())
          .then(d => renderProductTable(d.products));
      }

      function loadAllUseCases() {
        fetch(API_USECASES)
          .then(r => r.json())
          .then(d => renderUseCaseTable(d.usecases));
      }

      function loadAllAngles() {
        fetch(API_ANGLES)
          .then(r => r.json())
          .then(d => renderAngleTable(d.angles));
      }

      function loadUseCasesFiltered(product) {
        fetch(API_USECASES + "?product=" + encodeURIComponent(product))
          .then(r => r.json())
          .then(d => renderUseCaseTable(d.usecases));
      }

      function loadAnglesFiltered(product, usecase) {
        fetch(API_ANGLES + "?product=" + encodeURIComponent(product) + "&usecase=" + encodeURIComponent(usecase))
          .then(r => r.json())
          .then(d => renderAngleTable(d.angles));
      }

      // ======================================================
      // INIT
      // ======================================================
      attachTabHandlers();
      loadProducts();
      renderChips();

    });
  `;

  res.setHeader("Content-Type", "text/javascript");
  res.status(200).send(code);
}
