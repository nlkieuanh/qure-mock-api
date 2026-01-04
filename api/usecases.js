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
            spend: 0,
            impressions: 0,
          };
        }

        map[name].adsCount += 1;
        map[name].spend += Number(ad.spend) || 0;
        map[name].impressions += Number(ad.impressions) || 0;
      });
    });

    const rows = Object.values(map);

    return res.status(200).json({
      columns: ["name", "adsCount", "spend", "impressions"],
      rows
    });

  } catch (err) {
    console.error("API ERROR /api/usecases:", err);
    return res.status(500).json({ error: err.message });
  }
}
