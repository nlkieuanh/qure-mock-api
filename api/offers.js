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
    req.on("error", () => resolve({ status: 0, json: null }));
    req.end();
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const BASE_URL = "https://api.foresightiq.ai/";
  const MEMBER = "mem_cmizn6pdk0dmx0ssvf5bc05hw";
  const QUERY = req.query?.query || "vs";

  try {
    const url = new URL("api/advertising/product-combination", BASE_URL);
    url.searchParams.set("member", MEMBER);
    url.searchParams.set("query", QUERY);

    const { status, json } = await getJson(url.toString());
    const results = status === 200 ? json?.data?.results || [] : [];

    const map = new Map();
    results.forEach((ad) => {
      const name = ad?.f_offers || "Other";
      if (!map.has(name)) map.set(name, { name });
    });

    return res.status(200).json({ offers: Array.from(map.values()) });
  } catch {
    return res.status(200).json({ offers: [] });
  }
}
