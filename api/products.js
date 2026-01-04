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
    req.on("error", () => resolve({ status: 0, json: null, raw: "" }));
    req.end();
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const BASE_URL = "https://api.foresightiq.ai/".replace(/\/?$/, "/");
  const MEMBER = "mem_cmizn6pdk0dmx0ssvf5bc05hw";
  const DEFAULT_QUERY = "vs";

  const platform = String(req.query?.platform ?? "").trim();
  const query = String(req.query?.query ?? "").trim();

  // detect consumer:
  // - init_card_block: expects { columns, rows }
  // - drilldown.js: expects { products }
  const wantsTableShape = !("mode" in (req.query || {})) && (platform || req.query?.start || req.query?.end);

  try {
    const upstream = new URL("api/advertising/product-combination", BASE_URL);
    upstream.searchParams.set("member", MEMBER);
    upstream.searchParams.set("query", query || DEFAULT_QUERY);
    if (platform) upstream.searchParams.set("platform", platform);

    const { status, json, raw } = await getJson(upstream.toString());
    if (status < 200 || status >= 300) {
      console.error("[/api/products] upstream error:", status, raw);
      return res.status(200).json(
        wantsTableShape
          ? { columns: ["name", "adsCount", "spend", "impressions"], rows: [] }
          : { products: [] }
      );
    }

    const items = Array.isArray(json?.data?.results) ? json.data.results : [];

    // aggregate by f_products
    const map = new Map();
    for (const ad of items) {
      const name = String(ad?.f_products ?? "Unknown").trim() || "Unknown";
      if (!map.has(name)) map.set(name, { name, adsCount: 0, spend: 0, impressions: 0 });
      const row = map.get(name);
      row.adsCount += 1;
      row.spend += Number(ad?.spend) || 0;
      row.impressions += Number(ad?.impressions) || 0;
    }

    const list = Array.from(map.values());

    // Return shape based on consumer
    if (wantsTableShape) {
      return res.status(200).json({
        columns: ["name", "adsCount", "spend", "impressions"],
        rows: list.map((r) => ({ ...r, timeseries: [] })), // keep timeseries key for safety
      });
    }

    return res.status(200).json({ products: list });
  } catch (err) {
    console.error("[/api/products] handler error:", err);
    return res.status(200).json(
      wantsTableShape
        ? { columns: ["name", "adsCount", "spend", "impressions"], rows: [] }
        : { products: [] }
    );
  }
}
