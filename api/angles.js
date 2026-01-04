import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), "data", "ads.json");
    const ads = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const url = new URL(req.url, "http://localhost");

    const product  = url.searchParams.get("product");
    const usecase  = url.searchParams.get("usecase");
    const platform = url.searchParams.get("platform");
    const start    = url.searchParams.get("start");
    const end      = url.searchParams.get("end");

    /* ---------------- CORS ---------------- */
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    /* ---------------- FILTER ADS ---------------- */
    let filtered = ads.slice();

    if (product) {
      filtered = filtered.filter(ad => ad.f_products === product);
    }

    if (usecase) {
      filtered = filtered.filter(ad => {
        let uc = [];
        if (Array.isArray(ad.f_use_case)) uc = ad.f_use_case;
        else if (typeof ad.f_use_case === "string") uc = [ad.f_use_case];
        return uc.includes(usecase);
      });
    }

    if (platform) {
      filtered = filtered.filter(ad => ad.platform === platform);
    }

    if (start && end) {
      const s = new Date(start);
      const e = new Date(end);
      filtered = filtered.filter(ad => {
        const d = new Date(ad.start_date || ad.date || 0);
        return d >= s && d <= e;
      });
    }

    /* ---------------- GROUP BY ANGLE ---------------- */
    const groups = {};

    filtered.forEach(ad => {
      let angles = [];

      if (Array.isArray(ad.f_angles) && ad.f_angles.length > 0) {
        angles = ad.f_angles;
      } else if (typeof ad.f_angles === "string" && ad.f_angles.trim() !== "") {
        angles = [ad.f_angles.trim()];
      } else {
        angles = ["Unknown"];
      }

      angles.forEach(angle => {
        if (!groups[angle]) {
          groups[angle] = {
            name: angle,
            adsCount: 0,
            spend: 0,
            revenue: 0,
            impressions: 0,
            clicks: 0,
            timeseries: {}
          };
        }

        const g = groups[angle];
        g.adsCount += 1;
        g.spend += Number(ad.spend) || 0;
        g.revenue += Number(ad.revenue) || 0;
        g.impressions += Number(ad.impressions) || 0;
        g.clicks += Number(ad.clicks) || 0;

        /* ---- Timeseries ---- */
        const date = ad.start_date || ad.date || null;
        if (date) {
          if (!g.timeseries[date]) {
            g.timeseries[date] = {
              date,
              adsCount: 0,
              spend: 0,
              revenue: 0,
              impressions: 0,
              clicks: 0
            };
          }

          g.timeseries[date].adsCount += 1;
          g.timeseries[date].spend += Number(ad.spend) || 0;
          g.timeseries[date].revenue += Number(ad.revenue) || 0;
          g.timeseries[date].impressions += Number(ad.impressions) || 0;
          g.timeseries[date].clicks += Number(ad.clicks) || 0;
        }
      });
    });

    /* ---------------- FORMAT OUTPUT ---------------- */
    const rows = Object.values(groups).map(g => {
      const ts = Object.values(g.timeseries).sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      return {
        name: g.name,
        adsCount: g.adsCount,
        spend: g.spend,
        revenue: g.revenue,
        revPerAd: g.adsCount > 0 ? g.revenue / g.adsCount : 0,
        roas: g.spend > 0 ? g.revenue / g.spend : 0,
        ctr: g.impressions > 0 ? g.clicks / g.impressions : 0,
        timeseries: ts
      };
    });

    /* ---------------- RETURN UNIVERSAL FORMAT ---------------- */
    return res.status(200).json({
      columns: [
        "name",
        "adsCount",
        "spend",
        "revenue",
        "revPerAd",
        "roas",
        "ctr"
      ],
      rows
    });

  } catch (err) {
    console.error("API ERROR /api/angles:", err);
    return res.status(500).json({ error: err.message });
  }
}
