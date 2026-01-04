import https from "https";

function getJson(url) {
  return new Promise((resolve) => {
    const req = https.request(
      url,
      { method: "GET", headers: { Accept: "application/json" } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          const status = res.statusCode || 0;
          try {
            resolve({ status, json: data ? JSON.parse(data) : null, raw: data });
          } catch {
            resolve({ status, json: null, raw: data });
          }
        });
      }
    );
    req.on("error", (err) => resolve({ status: 0, json: null, raw: String(err?.message || "") }));
    req.end();
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Always 200 to prevent drilldown.js / init_card_block.js crash
  const ok = (payload) => res.status(200).json(payload);

  // ===== HARDCODE CONFIG =====
  const BASE_URL = "https://api.foresightiq.ai/".replace(/\/?$/, "/");
  const MEMBER = "mem_cmizn6pdk0dmx0ssvf5bc05hw";
  const DEFAULT_QUERY = "vs"; // you can change later if you want broader default
  // ===========================

  const platform = String(req.query?.platform ?? "").trim();
  const query = String(req.query?.query ?? "").trim();

  const columns = ["name", "adsCount", "spend", "impressions"];

  try {
    const upstreamUrl = new URL("api/advertising/product-combination", BASE_URL);
    upstreamUrl.searchParams.set("member", MEMBER);
    upstreamUrl.searchParams.set("query", query || DEFAULT_QUERY);
    if (platform) upstreamUrl.searchParams.set("platform", platform);

    const { status, json, raw } = await getJson(upstreamUrl.toString());

    if (status < 200 || status >= 300) {
      console.error("[/api/products] upstream error:", status, raw);
      return ok({
        products: [],
        columns,
        rows: [],
        error: "upstream_error",
        status,
      });
    }

    const items = Array.isArray(json?.data?.results) ? json.data.results : [];

    // Aggregate
    const map = new Map();
    for (const ad of items) {
      const name = String(ad?.f_products ?? "Unknown").trim() || "Unknown";
      if (!map.has(name)) map.set(name, { name, adsCount: 0, spend: 0, impressions: 0 });
      const row = map.get(name);
      row.adsCount += 1;
      row.spend += Number(ad?.spend) || 0;
      row.impressions += Number(ad?.impressions) || 0;
    }

    const products = Array.from(map.values());

    // Return BOTH shapes, so both modules work
    return ok({
      products,
      columns,
      rows: products.map((p) => ({ ...p, timeseries: [] })), // safe for chart/table code
    });
  } catch (err) {
    console.error("[/api/products] handler error:", err);
    return ok({
      products: [],
      columns,
      rows: [],
      error: err?.message || "handler_error",
    });
  }
}
