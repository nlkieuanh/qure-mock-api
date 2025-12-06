import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), "data", "ads.json");
    const ads = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const url = new URL(req.url, "http://localhost");
    const product = url.searchParams.get("product");

    // ===================================================
    // ENABLE CORS FOR WEBFLOW
    // ===================================================
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    // ===================================================
    // MODE 1 — FULL USE CASE LIST (Tab Click)
    // ===================================================
    if (!product) {
      const map = {};

      ads.forEach(ad => {
        let useCases = [];

        if (Array.isArray(ad.f_use_case) && ad.f_use_case.length > 0) {
          useCases = ad.f_use_case;
        } else if (typeof ad.f_use_case === "string" && ad.f_use_case.trim() !== "") {
          useCases = [ad.f_use_case.trim()];
        } else {
          useCases = ["Unknown"];
        }

        useCases.forEach(name => {
          if (!map[name]) {
            map[name] = {
              name,
              adsCount: 0,
              spend: 0,
              impressions: 0,
            };
          }

          map[name].adsCount += 1;
          map[name].spend += Number(ad.spend) || 0;
          map[name].impressions += Number(ad.impressions) || 0;
        });
      });

      return res.status(200).json({ usecases: Object.values(map) });
    }

    // ===================================================
    // MODE 2 — FILTERED BY PRODUCT (Drilldown)
    // ===================================================
    const map = {};

    ads.forEach(ad => {
      if (ad.f_products !== product) return; // filter by product only

      let useCases = [];

      if (Array.isArray(ad.f_use_case) && ad.f_use_case.length > 0) {
        useCases = ad.f_use_case;
      } else if (typeof ad.f_use_case === "string" && ad.f_use_case.trim() !== "") {
        useCases = [ad.f_use_case.trim()];
      } else {
        useCases = ["Unknown"];
      }

      useCases.forEach(name => {
        if (!map[name]) {
          map[name] = {
            name,
            adsCount: 0,
            spend: 0,
            impressions: 0,
          };
        }

        map[name].adsCount += 1;
        map[name].spend += Number(ad.spend) || 0;
        map[name].impressions += Number(ad.impressions) || 0;
      });
    });

    return res.status(200).json({ usecases: Object.values(map) });

  } catch (err) {
    console.error("API ERROR /api/usecases:", err);
    return res.status(500).json({ error: err.message });
  }
}
