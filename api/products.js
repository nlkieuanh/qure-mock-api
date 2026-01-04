export default async function handler(req, res) {
  try {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") return res.status(200).end();

    const { searchParams } = new URL(req.url, "http://localhost");

    // Optional passthroughs (keep frontend compatible)
    const platform = searchParams.get("platform") || "";
    const queryFromClient = (searchParams.get("query") || "").trim();

    // ===== HARDCODE REAL API CONFIG =====
    const BASE_URL = "https://api.foresightiq.ai/".replace(/\/?$/, "/");
    const MEMBER = "mem_cmizn6pdk0dmx0ssvf5bc05hw";
    const DEFAULT_QUERY = "vs"; // change if needed
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
    const items = Array.isArray(json?.data?.results) ? json.data.results : [];

    // Aggregate by f_products (keep old shape)
    const map = {};
    items.forEach((ad) => {
      const product = String(ad?.f_products || "Unknown").trim() || "Unknown";
      if (!map[product]) {
        map[product] = { name: product, adsCount: 0, spend: 0, impressions: 0 };
      }
      map[product].adsCount += 1;
      map[product].spend += Number(ad?.spend) || 0;
      map[product].impressions += Number(ad?.impressions) || 0;
    });

    return res.status(200).json({ products: Object.values(map) });
  } catch (err) {
    console.error("API ERROR /api/products:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}
