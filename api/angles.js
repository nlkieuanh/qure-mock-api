import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), "data", "ads.json");
    const ads = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const url = new URL(req.url, "http://localhost");
    const product = url.searchParams.get("product");
    const usecase = url.searchParams.get("usecase");

    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === "OPTIONS") return res.status(200).end();

    const map = {};

    ads.forEach(ad => {
      if (product && ad.f_products !== product) return;

      let uc = [];
      if (Array.isArray(ad.f_use_case)) uc = ad.f_use_case;
      else if (typeof ad.f_use_case === "string") uc = [ad.f_use_case];

      if (usecase && !uc.includes(usecase)) return;

      let angles = [];
      if (Array.isArray(ad.f_angles)) angles = ad.f_angles;
      else if (typeof ad.f_angles === "string") angles = [ad.f_angles];
      else angles = ["Unknown"];

      const date = ad.date || ad.created_at || ad.timestamp || null;

      angles.forEach(name => {
        if (!map[name]) {
          map[name] = {
            name,
            adsCount: 0,
            spend: 0,
            revenue: 0,
            roas: 0,
            ctr: 0,
            timeseries: {}
          };
        }

        map[name].adsCount += 1;
        map[name].spend += Number(ad.spend) || 0;
        map[name].revenue += Number(ad.revenue) || 0;

        // Timeseries (group by date)
        if (date) {
          if (!map[name].timeseries[date]) {
            map[name].timeseries[date] = {
              date,
              adsCount: 0,
              spend: 0,
              revenue: 0
            };
          }

          map[name].timeseries[date].adsCount += 1;
          map[name].timeseries[date].spend += Number(ad.spend) || 0;
          map[name].timeseries[date].revenue += Number(ad.revenue) || 0;
        }
      });
    });

    const rows = Object.values(map).map(r => {
      const tsArray = Object.values(r.timeseries).sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      const roas = r.spend > 0 ? r.revenue / r.spend : 0;

      return {
        name: r.name,
        adsCount: r.adsCount,
        spend: r.spend,
        revenue: r.revenue,
        roas,
        ctr: 0, 
        timeseries: tsArray
      };
    });

    return res.status(200).json({
      columns: ["name", "adsCount", "spend", "revenue", "roas", "ctr"],
      rows
    });

  } catch (err) {
    console.error("API ERROR /api/angles:", err);
    return res.status(500).json({ error: err.message });
  }
}
