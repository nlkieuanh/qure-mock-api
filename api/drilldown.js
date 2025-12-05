export default function handler(req, res) {
  const code = `
    document.addEventListener("DOMContentLoaded", function () {

      var card = document.querySelector(".card-block-wrap.product-combination-card");
      if (!card) return;

      var wrapper = card.querySelector(".adv-channel-table-wrapper");
      if (!wrapper) return;

      // Summary Text (Text Blocks in Webflow)
      const summaryProduct = card.querySelector(".dd-summary-product");
      const summaryUsecase = card.querySelector(".dd-summary-usecase");
      const summaryAngle = card.querySelector(".dd-summary-angle");

      const API_PRODUCTS = "https://qure-mock-api.vercel.app/api/products";
      const API_USECASES = "https://qure-mock-api.vercel.app/api/usecases?product=";
      const API_ANGLES = "https://qure-mock-api.vercel.app/api/angles?product=";

      window.__selectedProduct = null;
      window.__selectedUsecase = null;
      window.__selectedAngle = null;

      // ======================================================
      // UPDATE SUMMARY UI
      // ======================================================
      function updateSummaryUI() {
        if (summaryProduct) {
          summaryProduct.textContent =
            window.__selectedProduct
              ? "Selected Product: " + window.__selectedProduct
              : "";
        }

        if (summaryUsecase) {
          summaryUsecase.textContent =
            window.__selectedUsecase
              ? "Selected Use Case: " + window.__selectedUsecase
              : "";
        }

        if (summaryAngle) {
          summaryAngle.textContent =
            window.__selectedAngle
              ? "Selected Angle: " + window.__selectedAngle
              : "";
        }
      }

      // ======================================================
      // BUILD TABLE HEADER (dynamic)
      // ======================================================
      function buildHeader(label) {
        let meta = [];

        if (window.__selectedProduct) {
          meta.push("Product: " + window.__selectedProduct);
        }
        if (window.__selectedUsecase) {
          meta.push("Use Case: " + window.__selectedUsecase);
        }
        if (window.__selectedAngle) {
          meta.push("Angle: " + window.__selectedAngle);
        }

        const suffix = meta.length ? " (" + meta.join(" / ") + ")" : "";
        return label + suffix;
      }

      // ======================================================
      // UPDATE BREADCRUMB UI
      // ======================================================
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

      // ======================================================
      // BREADCRUMB CLICK HANDLER (FIXED)
      // ======================================================
      function attachBreadcrumbHandlers() {
        const tabs = card.querySelectorAll(".drilldown-tab-button");

        tabs.forEach(btn => {
          btn.addEventListener("click", function () {

            if (!btn.classList.contains("is-active")) return;

            const tab = btn.getAttribute("data-tab");

            // Back to PRODUCT
            if (tab === "product") {
              window.__selectedProduct = null;
              window.__selectedUsecase = null;
              window.__selectedAngle = null;
              updateSummaryUI();
              window.loadProducts();
            }

            // Back to USE CASE
            if (tab === "usecase") {
              if (!window.__selectedProduct) return;
              window.__selectedUsecase = null;
              window.__selectedAngle = null;
              updateSummaryUI();
              window.loadUseCases(window.__selectedProduct);
            }

            // Back to ANGLE
            if (tab === "angle") {
              if (!window.__selectedProduct || !window.__selectedUsecase) return;
              window.__selectedAngle = null;
              updateSummaryUI();
              window.loadAngles(window.__selectedProduct, window.__selectedUsecase);
            }
          });
        });
      }

      // ======================================================
      // RENDER PRODUCT TABLE
      // ======================================================
      function renderProductTable(items) {

      // Remove products without valid name
        items = items.filter(p => {
        const name = p.name?.trim();
        return name && name !== "Unknown" && name !== "-";
        });

        window.__selectedProduct = null;
        window.__selectedUsecase = null;
        window.__selectedAngle = null;

        updateSummaryUI();
        updateBreadcrumb("product");

        let html = '<table class="adv-channel-table">';
        html += "<thead><tr>";
        html += "<th>" + buildHeader("PRODUCT") + "</th>";
        html += "<th>Ads</th><th>Spend</th><th>Impressions</th>";
        html += "</tr></thead><tbody>";

        items.forEach(p => {
          html += 
            '<tr class="dd-row" data-product="' + p.name + '">' +
            '<td>' + p.name + '</td>' +
            '<td>' + p.adsCount + '</td>' +
            '<td>$' + p.spend.toLocaleString() + '</td>' +
            '<td>' + p.impressions.toLocaleString() + '</td>' +
            '</tr>';
        });

        html += "</tbody></table>";
        wrapper.innerHTML = html;

        wrapper.querySelectorAll(".dd-row").forEach(row => {
          row.addEventListener("click", () => {
            const product = row.dataset.product;
            window.__selectedProduct = product;
            window.__selectedUsecase = null;
            window.__selectedAngle = null;

            updateSummaryUI();
            window.loadUseCases(product);
          });
        });
      }

      // ======================================================
      // RENDER USE CASE TABLE
      // ======================================================
      function renderUseCaseTable(items) {
        updateBreadcrumb("usecase");
        updateSummaryUI();

        let html = '<table class="adv-channel-table">';
        html += "<thead><tr>";
        html += "<th>" + buildHeader("USE CASE") + "</th>";
        html += "<th>Ads</th><th>Spend</th><th>Impressions</th>";
        html += "</tr></thead><tbody>";

        items.forEach(uc => {
          html += 
            '<tr class="dd-row" data-usecase="' + uc.name + '">' +
            '<td>' + uc.name + '</td>' +
            '<td>' + uc.adsCount + '</td>' +
            '<td>$' + uc.spend.toLocaleString() + '</td>' +
            '<td>' + uc.impressions.toLocaleString() + '</td>' +
            '</tr>';
        });

        html += "</tbody></table>";
        wrapper.innerHTML = html;

        wrapper.querySelectorAll(".dd-row").forEach(row => {
          row.addEventListener("click", () => {
            const usecase = row.dataset.usecase;
            window.__selectedUsecase = usecase;
            window.__selectedAngle = null;

            updateSummaryUI();
            window.loadAngles(window.__selectedProduct, usecase);
          });
        });
      }

      // ======================================================
      // RENDER ANGLE TABLE
      // ======================================================
      function renderAngleTable(items) {
        updateBreadcrumb("angle");
        updateSummaryUI();

        let html = '<table class="adv-channel-table">';
        html += "<thead><tr>";
        html += "<th>" + buildHeader("ANGLE") + "</th>";
        html += "<th>Ads</th><th>Spend</th><th>Impressions</th>";
        html += "</tr></thead><tbody>";

        items.forEach(a => {
          html += 
            '<tr class="dd-row" data-angle="' + a.name + '">' +
            '<td>' + a.name + '</td>' +
            '<td>' + a.adsCount + '</td>' +
            '<td>$' + a.spend.toLocaleString() + '</td>' +
            '<td>' + a.impressions.toLocaleString() + '</td>' +
            '</tr>';
        });

        html += "</tbody></table>";
        wrapper.innerHTML = html;

        wrapper.querySelectorAll(".dd-row").forEach(row => {
          row.addEventListener("click", () => {
            const angle = row.dataset.angle;
            window.__selectedAngle = angle;

            updateSummaryUI();
          });
        });
      }

      // ======================================================
      // LOADERS
      // ======================================================
      window.loadProducts = function () {
        fetch(API_PRODUCTS)
          .then(r => r.json())
          .then(data => renderProductTable(data.products));
      };

      window.loadUseCases = function (productName) {
        fetch(API_USECASES + encodeURIComponent(productName))
          .then(r => r.json())
          .then(data => renderUseCaseTable(data.usecases));
      };

      window.loadAngles = function (productName, usecaseName) {
        const url =
          API_ANGLES +
          encodeURIComponent(productName) +
          "&usecase=" +
          encodeURIComponent(usecaseName);

        fetch(url)
          .then(r => r.json())
          .then(data => renderAngleTable(data.angles));
      };

      // ======================================================
      // INIT
      // ======================================================
      attachBreadcrumbHandlers();
      window.loadProducts();

    });
  `;

  res.setHeader("Content-Type", "text/javascript");
  res.status(200).send(code);
}
