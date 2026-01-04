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



function bump(map, value) {
  const v = String(value ?? "Unknown").trim() || "Unknown";
  map.set(v, (map.get(v) || 0) + 1);
}

function formatTop(map, topN = 5) {
  const arr = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  const top = arr.slice(0, topN).map(([k, c]) => `${k} (${c})`);
  const rest = arr.length > topN ? ` + ${arr.length - topN} more` : "";
  return top.join(", ") + rest;
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

  const level = String(req.query?.level ?? "product");
  const query = String(req.query?.query ?? "").trim();
  const product = String(req.query?.product ?? "").trim();
  const usecase = String(req.query?.usecase ?? "").trim();
  const platform = String(req.query?.platform ?? "").trim();

  const upstreamUrl = new URL("api/advertising/product-combination", BASE_URL);
  upstreamUrl.searchParams.set("member", MEMBER);
  upstreamUrl.searchParams.set("query", query || DEFAULT_QUERY);
  if (platform) upstreamUrl.searchParams.set("platform", platform);

  const { status, json, raw } = await getJson(upstreamUrl.toString());
  if (status < 200 || status >= 300) {
    console.error("[/api/drilldown-data] upstream error:", status, raw);
    return ok({ columns: ["name", "adsCount"], rows: [] });
  }

  const ads = Array.isArray(json?.data?.results) ? json.data.results : [];

  const filtered = ads.filter((ad) => {
    // if (!matchSearch(ad, query)) return false; // Removed to trust API results
    if (product && String(ad?.f_products ?? "") !== product) return false;
    if (usecase && String(ad?.f_use_case ?? "") !== usecase) return false;
    if (platform && String(ad?.platform ?? "").toLowerCase() !== platform.toLowerCase()) return false;
    return true;
  });

  const groupField =
    level === "product" ? "f_products" :
      level === "usecase" ? "f_use_case" :
        "f_angles";

  const groups = new Map();

  for (const ad of filtered) {
    const name = String(ad?.[groupField] ?? "Unknown").trim() || "Unknown";
    if (!groups.has(name)) {
      groups.set(name, {
        name,
        adsCount: 0,
        usecasesMap: new Map(),
        anglesMap: new Map(),
        offersMap: new Map(),
        promotionsMap: new Map(),
        tsMap: new Map(), // date -> count
      });
    }

    const g = groups.get(name);
    g.adsCount += 1;

    bump(g.usecasesMap, ad?.f_use_case);
    bump(g.anglesMap, ad?.f_angles);
    bump(g.offersMap, ad?.f_offers);
    bump(g.promotionsMap, ad?.f_promotion);

    const date = String(ad?.start_date ?? "").slice(0, 10);
    if (date) g.tsMap.set(date, (g.tsMap.get(date) || 0) + 1);
  }

  const rows = Array.from(groups.values()).map((g) => ({
    name: g.name,
    adsCount: g.adsCount,
    usecases: formatTop(g.usecasesMap),
    angles: formatTop(g.anglesMap),
    offers: formatTop(g.offersMap),
    promotions: formatTop(g.promotionsMap),
    timeseries: Array.from(g.tsMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, adsCount]) => ({ date, adsCount })),
  }));

  return ok({
    columns: ["name", "adsCount", "usecases", "angles", "offers", "promotions"],
    rows,
  });
}
