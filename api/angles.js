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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const ok = (payload) => res.status(200).json(payload);

  const BASE_URL = "https://api.foresightiq.ai/".replace(/\/?$/, "/");
  const MEMBER = "mem_cmizn6pdk0dmx0ssvf5bc05hw";
  const DEFAULT_QUERY = "vs";

  const product = String(req.query?.product ?? "").trim();
  const usecase = String(req.query?.usecase ?? "").trim();
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
      console.error("[/api/angles] upstream error:", status, raw);
      return ok({ columns, rows: [] });
    }

    let items = Array.isArray(json?.data?.results) ? json.data.results : [];
    if (product) items = items.filter((ad) => String(ad?.f_products ?? "") === product);
    if (usecase) items = items.filter((ad) => String(ad?.f_use_case ?? "") === usecase);

    const map = new Map();
    for (const ad of items) {
      const name = String(ad?.f_angles ?? "Unknown").trim() || "Unknown";
      if (!map.has(name)) map.set(name, { name, adsCount: 0, spend: 0, impressions: 0, timeseries: [] });
      const row = map.get(name);
      row.adsCount += 1;
      row.spend += Number(ad?.spend) || 0;
      row.impressions += Number(ad?.impressions) || 0;
    }

    return ok({ columns, rows: Array.from(map.values()) });
  } catch (err) {
    console.error("[/api/angles] handler error:", err);
    return ok({ columns, rows: [] });
  }
}
