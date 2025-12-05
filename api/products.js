import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), "data", "ads.json");
    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const productMap = {};

    json.forEach(ad => {
      const name = ad.f_products || "Unknown";
      if (!productMap[name]) {
        productMap[name] = {
          name,
          adsCount: 0,
          spend: 0,
          impressions: 0
        };
      }
      productMap[name].adsCount += 1;
      productMap[name].spend += Number(ad.spend) || 0;
      productMap[name].impressions += Number(ad.impressions) || 0;
    });

    const products = Object.values(productMap);

    // JavaScript to inject into Webflow
    const code = `
      document.addEventListener("DOMContentLoaded", function () {

        // Locate correct card
        var card = document.querySelector(".card-block-wrap.product-combination-card");
        if (!card) return;

        var wrapper = card.querySelector(".adv-channel-table-wrapper");
        if (!wrapper) return;

        // Breadcrumb logic
        function updateBreadcrumb(state) {
          var tabs = card.querySelectorAll(".drilldown-tab-button");
          tabs.forEach(function (btn) {
            var tab = btn.getAttribute("data-tab");
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

        updateBreadcrumb("product");

        // Render product table
        var html = '<table class="adv-channel-table">';
        html += '<thead><tr>';
        html += '<th>Product</th><th>Ads</th><th>Spend</th><th>Impressions</th>';
        html += '</tr></thead><tbody>';

        var data = ${JSON.stringify(products)};

        data.forEach(function (p) {
          html += '<tr class="dd-row" data-product="' + p.name + '">';
          html += '<td>' + p.name + '</td>';
          html += '<td>' + p.adsCount + '</td>';
          html += '<td>$' + p.spend.toLocaleString() + '</td>';
          html += '<td>' + p.impressions.toLocaleString() + '</td>';
          html += '</tr>';
        });

        html += '</tbody></table>';
        wrapper.innerHTML = html;

        // Click event for each product row
        wrapper.querySelectorAll(".dd-row").forEach(function (row) {
          row.addEventListener("click", function () {
            var product = row.dataset.product;

            updateBreadcrumb("usecase");

            if (window.loadUseCases) {
              window.loadUseCases(product);
            }
          });
        });
      });
    `;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Content-Type", "text/javascript");

    return res.status(200).send(code);

  } catch (err) {
    console.error("API ERROR /api/products:", err);
    return res.status(500).json({ error: err.message });
  }
}
