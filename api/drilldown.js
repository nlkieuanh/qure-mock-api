export default function handler(req, res) {
  const code = `
    document.addEventListener("DOMContentLoaded", function () {
      
      const card = document.querySelector(".card-block-wrap.product-combination-card");
      if (!card) return;
      const wrapper = card.querySelector(".adv-channel-table-wrapper");

      // Backend URLs
      const API_PRODUCTS = "https://qure-mock-api.vercel.app/api/products";
      const API_USECASES = "https://qure-mock-api.vercel.app/api/usecases?product=";

      // Load Product table on start
      loadProducts();

      function loadProducts() {
        fetch(API_PRODUCTS)
          .then(r => r.json())
          .then(data => renderProductTable(data.products));
      }

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

        wrapper.querySelectorAll(".dd-row").forEach(row => {
          row.addEventListener("click", () => loadUseCases(row.dataset.product));
        });
      }

      function loadUseCases(productName) {
        fetch(API_USECASES + encodeURIComponent(productName))
          .then(r => r.json())
          .then(data => renderUseCaseTable(data.usecases, productName));
      }

      function renderUseCaseTable(items, productName) {
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
            updateBreadcrumb("angle");
            if (window.loadAngles) window.loadAngles(productName, usecase);
          });
        });
      }

      function updateBreadcrumb(state) {
        const tabs = card.querySelectorAll(".drilldown-tab-button");
        
        tabs.forEach(btn => {
          const tab = btn.getAttribute("data-tab");
          btn.classList.remove("is-current","is-active","is-inactive");

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

    });
  `;

  res.setHeader("Content-Type", "text/javascript");
  res.status(200).send(code);
}
