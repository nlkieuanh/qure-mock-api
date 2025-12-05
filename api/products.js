import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), "data", "ads.json");
    const ads = JSON.parse(fs.readFileSync(filePath, "utf8"));

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

    const result = Object.values(map);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    return res.status(200).json({ products: result });

  } catch (err) {
    console.error("API ERROR /api/products:", err);
    return res.status(500).json({ error: err.message });
  }
}
