export default async function handler(req, res) {
  try {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") return res.status(200).end();

    const url = new URL(req.url, "http://localhost");
    const product = (url.searchParams.get("product") || "").trim();
    const platform = (url.searchParams.get("platform") || "").trim();
    const queryFromClient = (url.searchParams.get("query") || "").trim();

    // ===== HARDCODE REAL API CONFIG =====
    const BASE_URL = "https://api.foresightiq.ai/".replace(/\/?$/, "/");
    const MEMBER = "mem_cmizn6pdk0dmx0ssvf5bc05hw";
    const DEFAULT_QUERY = "vs";
    // ==================================

    const upstreamUrl = new URL("api/advertising/product-combination", BASE_URL);
    upstreamUrl.searchParams.set("member", MEMBER);
    upstreamUrl.searchParams.set("query", queryFromClient || DEFAULT_QUERY);
    if (platform) upstreamUrl.searchParams.set("platform", platform);

    const resp = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return res.status(resp.status).json({ error: "Upstream error", detail: text });
    }

    const json = await resp.json();
    let items = Array.isArray(json?.data?.results) ? json.data.results : [];

    // MODE 2 — FILTERED BY PRODUCT (keep old behavior)
    if (product) {
      items = items.filter((ad) => String(ad?.f_products || "") === product);
    }

    const map = {};
    items.forEach((ad) => {
      // normalize f_use_case to array
      let useCases = [];
      if (Array.isArray(ad?.f_use_case) && ad.f_use_case.length > 0) {
        useCases = ad.f_use_case;
      } else if (typeof ad?.f_use_case === "string" && ad.f_use_case.trim() !== "") {
        useCases = [ad.f_use_case.trim()];
      } else {
        useCases = ["Unknown"];
      }

      useCases.forEach((nameRaw) => {
        const name = String(nameRaw || "Unknown").trim() || "Unknown";
        if (!map[name]) {
          map[name] = { name, adsCount: 0, spend: 0, impressions: 0 };
        }
        map[name].adsCount += 1;
        map[name].spend += Number(ad?.spend) || 0;
        map[name].impressions += Number(ad?.impressions) || 0;
      });
    });

    return res.status(200).json({ usecases: Object.values(map) });
  } catch (err) {
    console.error("API ERROR /api/usecases:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}
