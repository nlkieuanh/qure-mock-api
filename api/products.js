import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), "data", "ads.json");
    const ads = JSON.parse(fs.readFileSync(filePath, "utf8"));

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    // -------------------------------------------
    // GROUP BY PRODUCT
    // -------------------------------------------
    const map = {};

    ads.forEach(ad => {
      const product = ad.f_products || "Unknown";

      if (!map[product]) {
        map[product] = {
          name: product,
          adsCount: 0,
          spend: 0,
          impressions: 0
        };
      }

      map[product].adsCount += 1;
      map[product].spend += Number(ad.spend) || 0;
      map[product].impressions += Number(ad.impressions) || 0;
    });

    const rows = Object.values(map);

    // -------------------------------------------
    // UNIVERSAL FORMAT FOR DRILLDOWN TABLE UI
    // -------------------------------------------
    const response = {
      columns: ["name", "adsCount", "spend", "impressions"],
      rows: rows
    };

    return res.status(200).json(response);

  } catch (err) {
    console.error("API ERROR /api/products:", err);
    return res.status(500).json({ error: err.message });
  }
}
