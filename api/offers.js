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
          try {
            resolve({
              status: res.statusCode || 0,
              json: data ? JSON.parse(data) : null,
              raw: data,
            });
          } catch {
            resolve({ status: res.statusCode || 0, json: null, raw: data });
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const ok = (payload) => res.status(200).json(payload);

  try {
    const BASE_URL = "https://api.foresightiq.ai/";
    const MEMBER = "mem_cmizn6pdk0dmx0ssvf5bc05hw";
    const DEFAULT_QUERY = "vs";

    const platform = String(req.query?.platform ?? "").trim();
    const query = String(req.query?.query ?? "").trim();

    const url = new URL("api/advertising/product-combination", BASE_URL);
    url.searchParams.set("member", MEMBER);
    url.searchParams.set("query", query || DEFAULT_QUERY);
    if (platform) url.searchParams.set("platform", platform);

    const { status, json } = await getJson(url.toString());
    if (status < 200 || status >= 300) {
      return ok({ offers: [] });
    }

    const items = Array.isArray(json?.data?.results) ? json.data.results : [];

    const map = new Map();
    for (const ad of items) {
      const name = String(ad?.f_offers ?? "Unknown").trim() || "Unknown";
      if (!map.has(name)) {
        map.set(name, { name, adsCount: 0 });
      }
      map.get(name).adsCount += 1;
    }

    return ok({ offers: Array.from(map.values()) });
  } catch {
    return ok({ offers: [] });
  }
}
