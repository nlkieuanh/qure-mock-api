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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const BASE_URL = "https://api.foresightiq.ai/";
  const MEMBER = "mem_cmizn6pdk0dmx0ssvf5bc05hw";
  const QUERY = req.query?.query || "vs";
  const platform = req.query?.platform || "";

  const columns = ["name", "adsCount", "spend", "impressions"];

  try {
    const url = new URL("api/advertising/product-combination", BASE_URL);
    url.searchParams.set("member", MEMBER);
    url.searchParams.set("query", QUERY);
    if (platform) url.searchParams.set("platform", platform);

    const { status, json } = await getJson(url.toString());
    const results = status === 200 ? json?.data?.results || [] : [];

    const map = new Map();
    results.forEach((ad) => {
      const name = ad?.f_products || "Unknown";
      if (!map.has(name)) map.set(name, { name, adsCount: 0, spend: 0, impressions: 0 });
      map.get(name).adsCount += 1;
    });

    const products = Array.from(map.values());

    return res.status(200).json({
      products,
      columns,
      rows: products.map((p) => ({ ...p, timeseries: [] })),
    });
  } catch {
    return res.status(200).json({ products: [], columns, rows: [] });
  }
}
