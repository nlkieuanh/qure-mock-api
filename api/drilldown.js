export default function handler(req, res) {
  const code = `
    document.addEventListener("DOMContentLoaded", function () {

      var card = document.querySelector(".card-block-wrap.product-combination-card");
      if (!card) return;

      var wrapper = card.querySelector(".adv-channel-table-wrapper");
      if (!wrapper) return;

      const API_PRODUCTS = "https://qure-mock-api.vercel.app/api/products";
      const API_USECASES = "https://qure-mock-api.vercel.app/api/usecases?product=";

      // Selected state tracking
      window.__selectedProduct = null;
      window.__selectedUsecase = null;

      // Load products when page loads
      window.loadProducts = function () {
        fetch(API_PRODUCTS)
          .then(r => r.json())
          .then(data => {
            renderProductTable(data.products);
            window.__selectedProduct = null;
            window.__selectedUsecase = null;
          });
      };

      function renderProductTable(items) {
        updateBreadcrumb("product");

        let html = '<table class="adv-channel-table">';
        html += '<thead><tr>';
        html += '<th>Product</th><th>Ads</th><th>Spend</th><th>Impressions</th>';
        html += '</tr></thead><tbody>';

        items.forEach(p => {
          html += '<tr class="dd-row" data-product="' + p.name + '">';
          html += '<td>' + p.name + '</td>';
          html += '<td>' + p.adsCount + '</td>';
          html += '<td>$' + p.spend.toLocaleString() + '</td>';
          html += '<td>' + p.impressions.toLocaleString() + '</td>';
          html += '</tr>';
        });

        html += '</tbody></table>';
        wrapper.innerHTML = html;

        // Click Product Row → Load Use Cases
        wrapper.querySelectorAll(".dd-row").forEach(row => {
          row.addEventListener("click", () => {
            const productName = row.dataset.product;
            window.__selectedProduct = productName;
            window.__selectedUsecase = null;
            loadUseCases(productName);
          });
        });
      }

      // Load usecases for selected product
      window.loadUseCases = function (productName) {
        fetch(API_USECASES + encodeURIComponent(productName))
          .then(r => r.json())
          .then(data => renderUseCaseTable(data.usecases));
      };

      function renderUseCaseTable(items) {
        updateBreadcrumb("usecase");

        let html = '<table class="adv-channel-table">';
        html += '<thead><tr>';
        html += '<th>Use Case</th><th>Ads</th><th>Spend</th><th>Impressions</th>';
        html += '</tr></thead><tbody>';

        items.forEach(uc => {
          html += '<tr class="dd-row" data-usecase="' + uc.name + '">';
          html += '<td>' + uc.name + '</td>';
          html += '<td>' + uc.adsCount + '</td>';
          html += '<td>$' + uc.spend.toLocaleString() + '</td>';
          html += '<td>' + uc.impressions.toLocaleString() + '</td>';
          html += '</tr>';
        });

        html += '</tbody></table>';
        wrapper.innerHTML = html;

        wrapper.querySelectorAll(".dd-row").forEach(row => {
          row.addEventListener("click", () => {
            const usecase = row.dataset.usecase;
            window.__selectedUsecase = usecase;
            updateBreadcrumb("angle");
            if (window.loadAngles) window.loadAngles(window.__selectedProduct, usecase);
          });
        });
      }

      // Breadcrumb tab click behavior
      function attachBreadcrumbHandlers() {
        const tabs = card.querySelectorAll(".drilldown-tab-button");

        tabs.forEach(btn => {
          btn.addEventListener("click", function () {
            if (!btn.classList.contains("is-active")) return;

            const tab = btn.getAttribute("data-tab");

            if (tab === "product" && window.loadProducts) {
              window.loadProducts();
            }

            if (tab === "usecase" && window.loadUseCases && window.__selectedProduct) {
              window.loadUseCases(window.__selectedProduct);
            }

            if (
              tab === "angle" &&
              window.loadAngles &&
              window.__selectedProduct &&
              window.__selectedUsecase
            ) {
              window.loadAngles(window.__selectedProduct, window.__selectedUsecase);
            }
          });
        });
      }

      // Update breadcrumb UI
      function updateBreadcrumb(state) {
        const tabs = card.querySelectorAll(".drilldown-tab-button");

        tabs.forEach(btn => {
          const tab = btn.getAttribute("data-tab");
          btn.classList.remove("is-current", "is-active", "is-inactive");

          if (state === "product") {
            if (tab === "product") btn.classList.add("is-current");
            else btn.classList.add("is-inactive");
          }

          if (state === "usecase") {
            if (tab === "product") btn.classList.add("is-active");
            if (tab === "usecase") btn.classList.add("is-current");
            if (tab === "angle") btn.classList.add("is-inactive");
          }

          if (state === "angle") {
            if (tab === "product") btn.classList.add("is-active");
            if (tab === "usecase") btn.classList.add("is-active");
            if (tab === "angle") btn.classList.add("is-current");
          }
        });
      }

      // INIT
      attachBreadcrumbHandlers();
      window.loadProducts();

    });
  `;

  res.setHeader("Content-Type", "text/javascript");
  res.status(200).send(code);
}
