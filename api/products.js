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
