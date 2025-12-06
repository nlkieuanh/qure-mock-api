export default function handler(req, res) {
  const code = `
    document.addEventListener("DOMContentLoaded", function () {

      const card = document.querySelector(".card-block-wrap.product-combination-card");
      if (!card) return;

      const wrapper = card.querySelector(".adv-channel-table-wrapper");
      if (!wrapper) return;

      const chipContainer = card.querySelector(".dd-chips-container");

      const API_PRODUCTS  = "https://qure-mock-api.vercel.app/api/products";
      const API_USECASES  = "https://qure-mock-api.vercel.app/api/usecases";
      const API_ANGLES    = "https://qure-mock-api.vercel.app/api/angles";

      // ======================================================
      // STATE
      // ======================================================
      window.__ddState = {
        level: "product",     // product | usecase | angle
        product: null,
        usecase: null,
        angle: null,
        rowFilter: null       // { type, value }
      };

      // ======================================================
      // TAB UI
      // ======================================================
      function updateTabs() {
        const tabs = card.querySelectorAll(".drilldown-tab-button");
        tabs.forEach(btn => {
          const tab = btn.dataset.tab;
          if (tab === window.__ddState.level) {
            btn.classList.add("is-current");
          } else {
            btn.classList.remove("is-current");
          }
        });
      }

      function attachTabHandlers() {
        const tabs = card.querySelectorAll(".drilldown-tab-button");

        tabs.forEach(btn => {
          btn.addEventListener("click", () => {
            const level = btn.dataset.tab;
            if (!level) return;

            // reset chip + drilldown filters
            window.__ddState.rowFilter = null;
            window.__ddState.product = null;
            window.__ddState.usecase = null;
            window.__ddState.angle = null;

            window.__ddState.level = level;
            updateTabs();
            renderChips();

            // FULL VIEW LOGIC
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

        const f = window.__ddState.rowFilter;
        if (!f) return;

        const chip = document.createElement("div");
        chip.className = "dd-chip";

        chip.innerHTML = \`
          <span class="dd-chip-label">\${f.type}: \${f.value}</span>
          <div class="dd-chip-remove">✕</div>
        \`;

        chip.querySelector(".dd-chip-remove").addEventListener("click", () => {
          window.__ddState.rowFilter = null;

          if (window.__ddState.level === "product") loadProducts();
          if (window.__ddState.level === "usecase") loadAllUseCases();
          if (window.__ddState.level === "angle")   loadAllAngles();

          renderChips();
        });

        chipContainer.appendChild(chip);
      }

      // ======================================================
      // FILTER VIA CHIP
      // ======================================================
      function applyChipFilter(items) {
        const f = window.__ddState.rowFilter;
        if (!f) return items;

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
            <thead>
              <tr>
                <th>Product</th>
                <th>Ads</th>
                <th>Spend</th>
                <th>Impressions</th>
              </tr>
            </thead>
            <tbody>
        \`;

        items.forEach(p => {
          html += \`
            <tr class="dd-row" data-value="\${p.name}">
              <td>\${p.name}</td>
              <td>\${p.adsCount}</td>
              <td>$\${p.spend.toLocaleString()}</td>
              <td>\${p.impressions.toLocaleString()}</td>
            </tr>
          \`;
        });

        html += "</tbody></table>";
        wrapper.innerHTML = html;

        wrapper.querySelectorAll(".dd-row").forEach(row => {
          row.addEventListener("click", () => {

            const product = row.dataset.value;

            // Create chip
            window.__ddState.rowFilter = { type: "product", value: product };
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
            <thead>
              <tr>
                <th>Use Case</th>
                <th>Ads</th>
                <th>Spend</th>
                <th>Impressions</th>
              </tr>
            </thead>
            <tbody>
        \`;

        items.forEach(uc => {
          html += \`
            <tr class="dd-row" data-value="\${uc.name}">
              <td>\${uc.name}</td>
              <td>\${uc.adsCount}</td>
              <td>$\${uc.spend.toLocaleString()}</td>
              <td>\${uc.impressions.toLocaleString()}</td>
            </tr>
          \`;
        });

        html += "</tbody></table>";
        wrapper.innerHTML = html;

        wrapper.querySelectorAll(".dd-row").forEach(row => {
          row.addEventListener("click", () => {
            const usecase = row.dataset.value;

            // Create chip
            window.__ddState.rowFilter = { type: "usecase", value: usecase };
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
            <thead>
              <tr>
                <th>Angle</th>
                <th>Ads</th>
                <th>Spend</th>
                <th>Impressions</th>
              </tr>
            </thead>
            <tbody>
        \`;

        items.forEach(a => {
          html += \`
            <tr class="dd-row" data-value="\${a.name}">
              <td>\${a.name}</td>
              <td>\${a.adsCount}</td>
              <td>$\${a.spend.toLocaleString()}</td>
              <td>\${a.impressions.toLocaleString()}</td>
            </tr>
          \`;
        });

        html += "</tbody></table>";
        wrapper.innerHTML = html;
      }

      // ======================================================
      // LOAD FUNCTIONS
      // ======================================================

      function loadProducts() {
        fetch(API_PRODUCTS)
          .then(r => r.json())
          .then(data => renderProductTable(data.products));
      }

      // FULL USE CASE LIST
      function loadAllUseCases() {
        fetch(API_USECASES)
          .then(r => r.json())
          .then(data => renderUseCaseTable(data.usecases));
      }

      // FULL ANGLE LIST
      function loadAllAngles() {
        fetch(API_ANGLES)
          .then(r => r.json())
          .then(data => renderAngleTable(data.angles));
      }

      // FILTERED USE CASE BY PRODUCT
      function loadUseCasesFiltered(product) {
        fetch(API_USECASES + "?product=" + encodeURIComponent(product))
          .then(r => r.json())
          .then(data => renderUseCaseTable(data.usecases));
      }

      // FILTERED ANGLE BY PRODUCT + USECASE
      function loadAnglesFiltered(product, usecase) {
        const url = 
          API_ANGLES +
          "?product=" + encodeURIComponent(product) +
          "&usecase=" + encodeURIComponent(usecase);

        fetch(url)
          .then(r => r.json())
          .then(data => renderAngleTable(data.angles));
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
