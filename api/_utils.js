import fs from "fs";
import path from "path";

/* -----------------------------------------------
   LOAD ADS DATA
------------------------------------------------ */
export function loadAds() {
  const filePath = path.join(process.cwd(), "data", "ads.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/* -----------------------------------------------
   Extract a clean YYYY-MM-DD from date strings
------------------------------------------------ */
export function extractDate(ad) {
  const raw =
    ad.start_date ||
    ad.start_time ||
    ad?.windsor?.ad_created_time ||
    null;

  if (!raw) return null;
  return raw.substring(0, 10);
}

/* -----------------------------------------------
   Build a metric object from ads
------------------------------------------------ */
export function aggregateMetrics(ads) {
  const spend = Number(ads.spend) || 0;
  const revenue = Number(ads?.windsor?.action_values_omni_purchase) || 0;
  const ctr = Number(ads?.windsor?.ctr) || 0;

  return { spend, revenue, ctr };
}

/* -----------------------------------------------
   Format final row after grouping
------------------------------------------------ */
export function finalizeRow(item) {
  const avgCtr = item.ctrCount > 0 ? item.ctrTotal / item.ctrCount : 0;
  const roas = item.spend > 0 ? item.revenue / item.spend : 0;
  const revPerAd = item.adsCount > 0 ? item.revenue / item.adsCount : 0;

  return {
    name: item.name,
    adsCount: item.adsCount,
    spend: item.spend,
    revenue: item.revenue,
    revPerAd,
    roas,
    ctr: avgCtr,
    timeseries: Object.values(item.timeseries).map(ts => ({
      date: ts.date,
      adsCount: ts.adsCount,
      spend: ts.spend,
      revenue: ts.revenue,
      revPerAd: ts.adsCount > 0 ? ts.revenue / ts.adsCount : 0,
      roas: ts.spend > 0 ? ts.revenue / ts.spend : 0,
      ctr: ts.ctrCount > 0 ? ts.ctrTotal / ts.ctrCount : 0
    }))
  };
}
