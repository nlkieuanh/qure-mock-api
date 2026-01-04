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

function getTopDist(ads, keyField) {
  const counts = {};
  ads.forEach(ad => {
    const items = Array.isArray(ad[keyField]) ? ad[keyField] : [ad[keyField]];
    items.forEach(i => {
      const val = (i || "Unknown").trim();
      if (!val) return;
      counts[val] = (counts[val] || 0) + 1;
    });
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1]) // Sort by count desc
    .slice(0, 5) // Top 5
    .map(([k, v]) => `${k} (${v})`)
    .join(", ");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { searchParams } = new URL(req.url, "http://localhost");
  const product = searchParams.get("product");
  const angle = searchParams.get("angle");

  const baseUrl = "https://api.foresightiq.ai/";
  const member = "mem_cmizn6pdk0dmx0ssvf5bc05hw";
  const url = new URL("api/advertising/product-combination", baseUrl);
  url.searchParams.set("member", member);
  url.searchParams.set("query", "vs. Old Method"); // Default query

  try {
    const { status, json, raw } = await getJson(url.toString());

    if (status < 200 || status >= 300) {
      return res.status(status || 500).json({ error: "Upstream error", detail: raw });
    }

    const ads = Array.isArray(json?.data?.results) ? json.data.results : [];

    // -------------------------------------------------------
    // GROUPING LOGIC
    // -------------------------------------------------------
    const map = {};

    ads.forEach(ad => {
      // 1. FILTER
      if (product && ad.f_products !== product) return;

      if (angle) {
        let ang = [];
        if (Array.isArray(ad.f_angles)) ang = ad.f_angles;
        else if (typeof ad.f_angles === "string") ang = [ad.f_angles];
        if (!ang.includes(angle)) return;
      }

      // 2. EXTRACT USE CASES
      let useCases = [];
      if (Array.isArray(ad.f_use_case) && ad.f_use_case.length > 0) {
        useCases = ad.f_use_case;
      } else if (typeof ad.f_use_case === "string" && ad.f_use_case.trim() !== "") {
        useCases = [ad.f_use_case.trim()];
      } else {
        useCases = ["Unknown"];
      }

      // 3. AGGREGATE
      useCases.forEach(name => {
        if (!map[name]) {
          map[name] = {
            name,
            adsCount: 0,
            rawAds: []
          };
        }

        map[name].adsCount += 1;
        map[name].rawAds.push(ad);
      });
    });

    const rows = Object.values(map).map(u => ({
      name: u.name,
      adsCount: u.adsCount,
      usecases: getTopDist(u.rawAds, "f_use_case"),
      angles: getTopDist(u.rawAds, "f_angles")
    }));

    return res.status(200).json({
      columns: ["name", "adsCount", "usecases", "angles"],
      rows
    });

  } catch (err) {
    console.error("API ERROR /api/usecases:", err);
    return res.status(500).json({ error: err.message });
  }
}
