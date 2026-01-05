import https from "https";
import { fetchAds, processAds } from "./helpers/core.js";

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

function getJson(url) {
  return new Promise((resolve) => {
    const req = https.request(
      url,
      { method: "GET", headers: { Accept: "application/json" }, agent: insecureAgent },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          const status = res.statusCode || 0;
          try {
            resolve({ status, json: data ? JSON.parse(data) : null });
          } catch {
            resolve({ status, json: null });
          }
        });
      }
    );
    req.on("error", (err) => resolve({ status: 0, json: null }));
    req.end();
  });
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const platform = url.searchParams.get("platform");
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");

    // 1. Fetch
    const ads = await fetchAds({ platform });

    // 2. Process
    const rows = processAds(ads, {
      groupBy: "f_offers",
      filters: { start, end, platform },
      timeseries: true
    });

    return res.status(200).json({
      columns: ["name", "adsCount", "spend", "revenue", "roas", "ctr"],
      rows
    });

  } catch (err) {
    console.error("API ERROR /api/offers:", err);
    return res.status(500).json({ error: err.message });
  }
}
