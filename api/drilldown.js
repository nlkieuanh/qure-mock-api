export default function handler(req, res) {
  const code = `
    document.addEventListener("DOMContentLoaded", function () {

      const card = document.querySelector(".card-block-wrap.product-combination-card");
      if (!card) return;

      const wrapper = card.querySelector(".adv-channel-table-wrapper");
      if (!wrapper) return;

      const chipContainer = card.querySelector(".dd-chips-container");

      const API_PRODUCTS = "https://qure-mock-api.vercel.app/api/products";
      const API_USECASES = "https://qure-mock-api.vercel.app/api/usecases?product=";
      const API_ANGLES = "https://qure-mock-api.vercel.app/api/angles?product=";

      // ======================================================
      // GLOBAL STATE
      // ======================================================
      window.__ddState = {
        level: "product",
        rowFilter: null,
        product: null,
        usecase: null,
        angle: null
      };

      // ======================================================
      // TAB UI
      // ======================================================
      function updateTabs() {
        const tabs = card.querySelectorAll(".drilldown-tab-button");
        tabs.forEach(btn => {
          const tabLvl = btn.dataset.tab;
          if (tabLvl === window.__ddState.level) {
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
            const selected = btn.dataset.tab;
            if (!selected) return;

            // reset chip filter
            window.__ddState.rowFilter = null;
            renderChips();

            // update level
            window.__ddState.level = selected;

            if (selected === "product") {
              loadProducts();
            }
            if (selected === "usecase") {
              loadUseCases(window.__ddState.product);
            }
            if (selected === "angle") {
              loadAngles(window.__ddState.product, window.__ddState.usecase);
            }

            updateTabs();
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
          // remove chip
          window.__ddState.rowFilter = null;

          // reload level
          if (window.__ddState.level === "product") loadProducts();
          if (window.__ddState.level === "usecase") loadUseCases(window.__ddState.product);
          if (window.__ddState.level === "angle") loadAngles(window.__ddState.product, window.__ddState.usecase);

          renderChips();
        });

        chipContainer.appendChild(chip);
      }

      // ======================================================
      // APPLY CHIP FILTER
      // ======================================================
      function applyRowFilter(items) {
        const f = window.__ddState.rowFilter;
        if (!f) return items;
        return items.filter(i => i.name === f.value);
      }

      // ======================================================
      // RENDER TABLES
      // ======================================================
      function renderProductTable(items) {
        window.__ddState.level = "product";
        updateTabs();

        // filter via chip
        items = applyRowFilter(items);

        let html = '<table class="adv-channel-table">';
        html += "<thead><tr>";
        html += "<th>Product</th><th>Ads</th><th>Spend</th><th>Impressions</th>";
        html += "</tr></thead><tbody>";

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
            const value = row.dataset.value;

            // create chip filter
            window.__ddState.rowFilter = { type: "product", value };
            renderChips();

            // update drilldown state
            window.__ddState.product = value;

            loadUseCases(value);
          });
        });
      }

      function renderUseCaseTable(items) {
        window.__ddState.level = "usecase";
        updateTabs();

        items = applyRowFilter(items);

        let html = '<table class="adv-channel-table">';
        html += "<thead><tr>";
        html += "<th>Use Case</th><th>Ads</th><th>Spend</th><th>Impressions</th>";
        html += "</tr></thead><tbody>";

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
            const value = row.dataset.value;

            // chip filter
            window.__ddState.rowFilter = { type: "usecase", value };
            renderChips();

            window.__ddState.usecase = value;

            loadAngles(window.__ddState.product, value);
          });
        });
      }

      function renderAngleTable(items) {
        window.__ddState.level = "angle";
        updateTabs();

        items = applyRowFilter(items);

        let html = '<table class="adv-channel-table">';
        html += "<thead><tr>";
        html += "<th>Angle</th><th>Ads</th><th>Spend</th><th>Impressions</th>";
        html += "</tr></thead><tbody>";

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

        wrapper.querySelectorAll(".dd-row").forEach(row => {
          row.addEventListener("click", () => {
            const value = row.dataset.value;

            window.__ddState.rowFilter = { type: "angle", value };
            renderChips();

            window.__ddState.angle = value;
          });
        });
      }

      // ======================================================
      // LOADERS
      // ======================================================
      function loadProducts() {
        fetch(API_PRODUCTS)
          .then(r => r.json())
          .then(data => {
            renderProductTable(data.products);
          });
      }

      function loadUseCases(productName) {
        fetch(API_USECASES + encodeURIComponent(productName))
          .then(r => r.json())
          .then(data => {
            renderUseCaseTable(data.usecases);
          });
      }

      function loadAngles(productName, usecaseName) {
        const url = API_ANGLES +
          encodeURIComponent(productName) +
          "&usecase=" +
          encodeURIComponent(usecaseName);

        fetch(url)
          .then(r => r.json())
          .then(data => {
            renderAngleTable(data.angles);
          });
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
