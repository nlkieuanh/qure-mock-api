import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), "data", "ads.json");
    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const map = {};

    json.forEach(ad => {
      const productName = ad.f_products || "Unknown";

      let useCases = [];

      if (Array.isArray(ad.f_use_case) && ad.f_use_case.length > 0) {
        useCases = ad.f_use_case;
      } else if (typeof ad.f_use_case === "string" && ad.f_use_case.trim() !== "") {
        useCases = [ad.f_use_case.trim()];
      } else {
        useCases = ["Unknown"];
      }

      if (!map[productName]) {
        map[productName] = {};
      }

      useCases.forEach(name => {
        const key = name || "Unknown";
        if (!map[productName][key]) {
          map[productName][key] = {
            name: key,
            adsCount: 0,
            spend: 0,
            impressions: 0
          };
        }

        map[productName][key].adsCount += 1;
        map[productName][key].spend += Number(ad.spend) || 0;
        map[productName][key].impressions += Number(ad.impressions) || 0;
      });
    });

    const usecaseData = {};
    Object.keys(map).forEach(product => {
      usecaseData[product] = Object.values(map[product]);
    });

    const code = `
      document.addEventListener("DOMContentLoaded", function () {
        var USECASE_DATA = ${JSON.stringify(usecaseData)};

        window.loadUseCases = function (productName) {
          var card = document.querySelector(".card-block-wrap.product-combination-card");
          if (!card) return;

          var wrapper = card.querySelector(".adv-channel-table-wrapper");
          if (!wrapper) return;

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

          updateBreadcrumb("usecase");

          var items = USECASE_DATA[productName] || [];

          var html = '<table class="adv-channel-table">';
          html += '<thead><tr>';
          html += '<th>Use Case</th><th>Ads</th><th>Spend</th><th>Impressions</th>';
          html += '</tr></thead><tbody>';

          items.forEach(function (uc) {
            html += '<tr class="dd-row" data-usecase="' + uc.name + '">';
            html += '<td>' + uc.name + '</td>';
            html += '<td>' + uc.adsCount + '</td>';
            html += '<td>$' + uc.spend.toLocaleString() + '</td>';
            html += '<td>' + uc.impressions.toLocaleString() + '</td>';
            html += '</tr>';
          });

          html += '</tbody></table>';
          wrapper.innerHTML = html;

          wrapper.querySelectorAll(".dd-row").forEach(function (row) {
            row.addEventListener("click", function () {
              var usecaseName = row.dataset.usecase;
              updateBreadcrumb("angle");
              if (window.loadAngles) {
                window.loadAngles(productName, usecaseName);
              }
            });
          });
        };
      });
    `;

    res.setHeader("Content-Type", "text/javascript");
    return res.status(200).send(code);

  } catch (err) {
    console.error("API ERROR /api/usecases:", err);
    return res.status(500).json({ error: err.message });
  }
}
