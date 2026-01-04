export default async function handler(req, res) {
  try {
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

    if (!member) return res.status(400).json({ error: "Missing member" });

    // Build real API URL
    const url = new URL("api/advertising/product-combination", baseUrl);

    // If your upstream requires query non-empty, set a safe default:
    url.searchParams.set("query", query || "vs");
    url.searchParams.set("member", member);

    if (platform) url.searchParams.set("platform", platform);

    const resp = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return res.status(resp.status).json({ error: "Upstream error", detail: text });
    }

    const json = await resp.json();

    let results = Array.isArray(json?.data?.results) ? json.data.results : [];

    // Keep old behavior if platform filter isn't supported upstream
    if (platform) {
      results = results.filter(
        (item) => String(item?.platform || "").toLowerCase() === platform.toLowerCase()
      );
    }

    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}
