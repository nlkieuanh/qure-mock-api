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

    // Build JS code string to run on the client
    const code = `
      document.addEventListener("DOMContentLoaded", function () {
        var card = document.querySelector(".card-block-wrap.product-combination-card");
        if (!card) return;

        var wrapper = card.querySelector(".adv-channel-table-wrapper");
        var tabs = card.querySelectorAll(".drilldown-tab-button");

        function setActive(tab) {
          tabs.forEach(btn => {
            var t = btn.getAttribute("data-tab");
            if (t === tab) btn.classList.add("is-active");
            else btn.classList.remove("is-active");
          });
        }

        setActive("product");

        var html = '<table class="adv-channel-table">';
        html += '<thead><tr><th>Product</th><th>Ads</th><th>Spend</th><th>Impressions</th></tr></thead>';
        html += '<tbody>';

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

        // Click → load use cases
        wrapper.querySelectorAll(".dd-row").forEach(function (row) {
          row.addEventListener("click", function () {
            var product = row.dataset.product;
            window.loadUseCases && window.loadUseCases(product);
            setActive("usecase");
          });
        });
      });
    `;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "text/javascript");
    return res.status(200).send(code);

  } catch (err) {
    console.error("API ERROR /api/products:", err);
    return res.status(500).json({ error: err.message });
  }
}
