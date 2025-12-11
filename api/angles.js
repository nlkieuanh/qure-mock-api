import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), "data", "ads.json");
    const ads = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const url = new URL(req.url, "http://localhost");
    const product = url.searchParams.get("product");
    const usecase = url.searchParams.get("usecase");

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    // ------------------------------------------------------
    // GROUPING FUNCTION (reused for full and filtered mode)
    // ------------------------------------------------------
    const map = {};

    ads.forEach(ad => {
      // Filter by product
      if (product && ad.f_products !== product) return;

      // Extract usecases
      let useCases = [];

      if (Array.isArray(ad.f_use_case) && ad.f_use_case.length > 0) {
        useCases = ad.f_use_case;
      } else if (typeof ad.f_use_case === "string" && ad.f_use_case.trim() !== "") {
        useCases = [ad.f_use_case.trim()];
      } else {
        useCases = ["Unknown"];
      }

      // Filter by usecase when provided
      if (usecase && !useCases.includes(usecase)) return;

      // Extract angles
      let angles = [];

      if (Array.isArray(ad.f_angles) && ad.f_angles.length > 0) {
        angles = ad.f_angles;
      } else if (typeof ad.f_angles === "string" && ad.f_angles.trim() !== "") {
        angles = [ad.f_angles.trim()];
      } else {
        angles = ["Unknown"];
      }

      // Grouping
      angles.forEach(name => {
        if (!map[name]) {
          map[name] = {
            name,
            adsCount: 0,
            spend: 0,
            impressions: 0
          };
        }

        map[name].adsCount += 1;
        map[name].spend += Number(ad.spend) || 0;
        map[name].impressions += Number(ad.impressions) || 0;
      });
    });

    const rows = Object.values(map);

    // ------------------------------------------------------
    // UNIVERSAL OUTPUT SCHEMA (used by UniversalTable)
    // ------------------------------------------------------
    return res.status(200).json({
      columns: ["name", "adsCount", "spend", "impressions"],
      rows
    });

  } catch (err) {
    console.error("API ERROR /api/angles:", err);
    return res.status(500).json({ error: err.message });
  }
}
