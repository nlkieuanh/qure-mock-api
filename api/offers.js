import { loadAds, extractDate, aggregateMetrics, finalizeRow } from "./_utils";

export default function handler(req, res) {
  try {
    const ads = loadAds();
    const bucket = {};

    ads.forEach(ad => {
      let keys = [];
      if (Array.isArray(ad.f_offers)) keys = ad.f_offers;
      else if (typeof ad.f_offers === "string") keys = [ad.f_offers];
      else keys = ["Unknown"];

      const date = extractDate(ad);
      const { spend, revenue, ctr } = aggregateMetrics(ad);

      keys.forEach(key => {
        if (!bucket[key]) {
          bucket[key] = {
            name: key,
            adsCount: 0,
            spend: 0,
            revenue: 0,
            ctrTotal: 0,
            ctrCount: 0,
            timeseries: {}
          };
        }

        const row = bucket[key];
        row.adsCount++;
        row.spend += spend;
        row.revenue += revenue;
        row.ctrTotal += ctr;
        row.ctrCount += ctr > 0 ? 1 : 0;

        if (date) {
          if (!row.timeseries[date]) {
            row.timeseries[date] = {
              date,
              adsCount: 0,
              spend: 0,
              revenue: 0,
              ctrTotal: 0,
              ctrCount: 0
            };
          }
          const ts = row.timeseries[date];
          ts.adsCount++;
          ts.spend += spend;
          ts.revenue += revenue;
          ts.ctrTotal += ctr;
          ts.ctrCount += ctr > 0 ? 1 : 0;
        }
      });
    });

    const rows = Object.values(bucket).map(finalizeRow);

    return res.status(200).json({
      columns: ["name", "adsCount", "spend", "revenue", "revPerAd", "roas", "ctr"],
      rows
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
