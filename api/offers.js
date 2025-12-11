import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), "data", "ads.json");
    const ads = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const url = new URL(req.url, "http://localhost");
    const platform = url.searchParams.get("platform");
    const startDate = url.searchParams.get("start");
    const endDate = url.searchParams.get("end");

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    const map = {};

    ads.forEach(ad => {
      // Platform filter
      if (platform && ad.platform !== platform) return;

      // Date filter
      const adDate = new Date(ad.start_date);
      if (startDate && adDate < new Date(startDate)) return;
      if (endDate && adDate > new Date(endDate)) return;

      // Offer extraction
      let offers = [];

      if (Array.isArray(ad.f_offers) && ad.f_offers.length > 0) {
        offers = ad.f_offers;
      } else if (typeof ad.f_offers === "string" && ad.f_offers.trim() !== "") {
        offers = [ad.f_offers.trim()];
      } else {
        offers = ["Other"];
      }

      offers.forEach(name => {
        if (!map[name]) {
          map[name] = {
            name,
            adsCount: 0,
            spend: 0,
            revenue: 0,
            revenuePerAd: 0,
            roas: 0,
            ctr: 0
          };
        }

        const revenue = Number(ad.windsor?.action_values_omni_purchase || 0);

        map[name].adsCount += 1;
        map[name].spend += Number(ad.spend) || 0;
        map[name].revenue += revenue;
        map[name].ctr += Number(ad.ctr) || 0;
      });
    });

    // Post process (ROAS, rev/ad, ctr avg)
    const rows = Object.values(map).map(o => {
      o.revenuePerAd = o.adsCount > 0 ? o.revenue / o.adsCount : 0;
      o.roas = o.spend > 0 ? o.revenue / o.spend : 0;
      o.ctr = o.adsCount > 0 ? o.ctr / o.adsCount : 0;
      return o;
    });

    return res.status(200).json({
      columns: ["name", "adsCount", "spend", "revenue", "revenuePerAd", "roas", "ctr"],
      rows
    });

  } catch (err) {
    console.error("API ERROR /api/offers:", err);
    return res.status(500).json({ error: err.message });
  }
}
