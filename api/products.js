export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Always return legacy shape
  const fail = (status, payload) => res.status(status).json({ products: [], ...payload });

  try {
    // ===== HARDCODE CONFIG =====
    const BASE_URL = "https://api.foresightiq.ai/".replace(/\/?$/, "/");
    const MEMBER = "mem_cmizn6pdk0dmx0ssvf5bc05hw";
    const DEFAULT_QUERY = "vs"; // change if you want broader defaults
    // ===========================

    const platform = String(req.query?.platform ?? "").trim();
    const query = String(req.query?.query ?? "").trim();

    const upstreamUrl = new URL("api/advertising/product-combination", BASE_URL);
    upstreamUrl.searchParams.set("member", MEMBER);
    upstreamUrl.searchParams.set("query", query || DEFAULT_QUERY);
    if (platform) upstreamUrl.searchParams.set("platform", platform);

    const resp = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.error("[/api/products] upstream error:", resp.status, detail);
      return fail(resp.status, { error: "Upstream error", detail });
    }

    const json = await resp.json();
    const items = Array.isArray(json?.data?.results) ? json.data.results : [];

    const map = new Map();
    for (const ad of items) {
      const name = String(ad?.f_products ?? "Unknown").trim() || "Unknown";
      if (!map.has(name)) {
        map.set(name, { name, adsCount: 0, spend: 0, impressions: 0 });
      }
      const row = map.get(name);
      row.adsCount += 1;
      row.spend += Number(ad?.spend) || 0;
      row.impressions += Number(ad?.impressions) || 0;
    }

    return res.status(200).json({ products: Array.from(map.values()) });
  } catch (err) {
    console.error("[/api/products] handler error:", err);
    return fail(500, { error: err?.message || "Server error" });
  }
}
