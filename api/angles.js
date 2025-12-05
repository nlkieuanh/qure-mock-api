import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), "data", "ads.json");
    const ads = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const url = new URL(req.url, "http://localhost");
    const product = url.searchParams.get("product");
    const usecase = url.searchParams.get("usecase");

    if (!product) {
      return res.status(400).json({ error: "Missing product query param" });
    }
    if (!usecase) {
      return res.status(400).json({ error: "Missing usecase query param" });
    }

    const map = {};

    ads.forEach(ad => {
      if (ad.f_products !== product) return;

      let useCases = [];
      if (Array.isArray(ad.f_use_case)) {
        useCases = ad.f_use_case;
      } else if (typeof ad.f_use_case === "string" && ad.f_use_case.trim() !== "") {
        useCases = [ad.f_use_case.trim()];
      }

      // Must match use case to continue
      if (!useCases.includes(usecase)) return;

      // Normalize angle field
      let angles = [];

      if (Array.isArray(ad.f_angle) && ad.f_angle.length > 0) {
        angles = ad.f_angle;
      } else if (typeof ad.f_angle === "string" && ad.f_angle.trim() !== "") {
        angles = [ad.f_angle.trim()];
      } else {
        angles = ["Unknown"];
      }

      // Aggregate angle data
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

    const result = Object.values(map);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    return res.status(200).json({ angles: result });

  } catch (err) {
    console.error("API ERROR /api/angles:", err);
    return res.status(500).json({ error: err.message });
  }
}
