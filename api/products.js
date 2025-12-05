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

    const result = Object.values(productMap);

    // --- CORS FIX ---
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({ products: result });

  } catch (err) {
    console.error("API ERROR /api/products:", err);
    return res.status(500).json({ error: err.message });
  }
}

document.addEventListener('DOMContentLoaded', function () {
  var card = document.querySelector('.card-block-wrap.product-combination-card');
  if (!card) return;

  var tableWrapper = card.querySelector('.adv-channel-table-wrapper');
  if (!tableWrapper) return;

  var apiUrl = 'https://qure-mock-api.vercel.app/api/products';

  fetch(apiUrl)
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      var products = (data && data.products) ? data.products : [];

      var html = ''
        + '<table class="adv-channel-table">'
        + '  <thead>'
        + '    <tr>'
        + '      <th>Product</th>'
        + '      <th>Ads</th>'
        + '      <th>Spend</th>'
        + '      <th>Impressions</th>'
        + '    </tr>'
        + '  </thead>'
        + '  <tbody>';

      products.forEach(function (item) {
        html += ''
          + '<tr class="dd-row" data-product="' + item.name + '">'
          + '  <td>' + item.name + '</td>'
          + '  <td>' + item.adsCount + '</td>'
          + '  <td>$' + item.spend.toLocaleString() + '</td>'
          + '  <td>' + item.impressions.toLocaleString() + '</td>'
          + '</tr>';
      });

      html += '</tbody></table>';
      tableWrapper.innerHTML = html;
    })
    .catch(function () {
      tableWrapper.innerHTML = '<div>Cannot load product data.</div>';
    });
});
