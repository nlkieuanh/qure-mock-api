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

  const { searchParams } = new URL(req.url, "http://localhost");

  // Keep existing params used by your frontend
  const platform = searchParams.get("platform") || "";
  const query = searchParams.get("query") || "";

  // ===== HARDCODE CONFIG HERE =====
  const baseUrl = "https://api.foresightiq.ai/".replace(/\/?$/, "/");
  const member = "mem_cmizn6pdk0dmx0ssvf5bc05hw";
  // =================================

  const url = new URL("api/advertising/product-combination", baseUrl);
  url.searchParams.set("member", member);
  url.searchParams.set("query", query || "vs"); // Safe default if backend requires it

  if (platform) url.searchParams.set("platform", platform);

  const { status, json, raw } = await getJson(url.toString());

  if (status < 200 || status >= 300) {
    return res.status(status || 500).json({ error: "Upstream error", detail: raw });
  }

  let results = Array.isArray(json?.data?.results) ? json.data.results : [];

  // Keep old behavior if platform filter isn't supported upstream
  if (platform) {
    results = results.filter(
      (item) => String(item?.platform || "").toLowerCase() === platform.toLowerCase()
    );
  }

  return res.status(200).json(results);
}
