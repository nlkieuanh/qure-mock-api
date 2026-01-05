import https from "https";

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
    // Upstream Configuration
    const baseUrl = "https://api.foresightiq.ai/";
    const member = "mem_cmizn6pdk0dmx0ssvf5bc05hw";
    const apiUrl = new URL("api/advertising/product-combination", baseUrl);
    apiUrl.searchParams.set("member", member);
    apiUrl.searchParams.set("query", "vs. Old Method");

    // Fetch Data
    const { status, json } = await getJson(apiUrl.toString());

    if (status < 200 || status >= 300) {
      throw new Error(`Upstream API Error: ${status}`);
    }

    const ads = Array.isArray(json?.data?.results) ? json.data.results : [];

    const url = new URL(req.url, "http://localhost");
    const platform = url.searchParams.get("platform");
    const startDate = url.searchParams.get("start");
    const endDate = url.searchParams.get("end");

    // Enable CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === "OPTIONS") return res.status(200).end();

    const summaryMap = {};
    const timeseriesMap = {}; // offerName → date → metrics

    ads.forEach(ad => {
      // Filter by platform
      if (platform && ad.platform !== platform) return;

      // Date filter
      const adDate = ad.start_date ? new Date(ad.start_date) : null;
      if (!adDate) return;

      if (startDate && adDate < new Date(startDate)) return;
      if (endDate && adDate > new Date(endDate)) return;

      let offers = [];

      if (Array.isArray(ad.f_offers) && ad.f_offers.length > 0) {
        offers = ad.f_offers;
      } else if (typeof ad.f_offers === "string" && ad.f_offers.trim() !== "") {
        offers = [ad.f_offers.trim()];
      } else {
        offers = ["Other"];
      }

      const spend = Number(ad.spend) || 0;
      const revenue = Number(ad.windsor?.action_values_omni_purchase || 0);
      const ctr = Number(ad.ctr) || 0;
      const dateKey = ad.start_date.split("T")[0]; // yyyy-mm-dd

      offers.forEach(name => {
        /* -----------------------------
           SUMMARY ROW AGGREGATION
        ----------------------------- */
        if (!summaryMap[name]) {
          summaryMap[name] = {
            name,
            adsCount: 0,
            spend: 0,
            revenue: 0,
            roas: 0,
            ctr: 0
          };
        }

        summaryMap[name].adsCount += 1;
        summaryMap[name].spend += spend;
        summaryMap[name].revenue += revenue;
        summaryMap[name].ctr += ctr;

        /* -----------------------------
           TIMESERIES PER OFFER
        ----------------------------- */
        if (!timeseriesMap[name]) timeseriesMap[name] = {};
        if (!timeseriesMap[name][dateKey]) {
          timeseriesMap[name][dateKey] = {
            date: dateKey,
            adsCount: 0,
            spend: 0,
            revenue: 0,
            roas: 0,
            ctr: 0
          };
        }

        const ts = timeseriesMap[name][dateKey];
        ts.adsCount += 1;
        ts.spend += spend;
        ts.revenue += revenue;
        ts.ctr += ctr;
      });
    });

    /* -----------------------------
       FINALIZE SUMMARY + TIMESERIES
    ----------------------------- */
    const rows = Object.values(summaryMap).map(row => {
      const name = row.name;
      const tsObj = timeseriesMap[name] || {};

      row.roas = row.spend > 0 ? row.revenue / row.spend : 0;
      row.ctr = row.adsCount > 0 ? row.ctr / row.adsCount : 0;

      row.timeseries = Object.values(tsObj).map(item => ({
        ...item,
        roas: item.spend > 0 ? item.revenue / item.spend : 0,
        ctr: item.adsCount > 0 ? item.ctr / item.adsCount : 0
      }));

      return row;
    });

    return res.status(200).json({
      columns: ["name", "adsCount", "spend", "revenue", "roas", "ctr"],
      rows
    });

  } catch (err) {
    console.error("API ERROR /api/offers_v2:", err);
    return res.status(500).json({ error: err.message });
  }
}
