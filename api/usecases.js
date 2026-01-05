import { fetchAds, processAds } from "./helpers/core.js";

export default async function handler(req, res) {
  try {
    const { searchParams } = new URL(req.url, "http://localhost");
    const product = searchParams.get("product");
    const angle = searchParams.get("angle");

    // 1. Fetch
    const ads = await fetchAds();

    // 2. Process
    const filters = {};
    if (product) filters.f_products = product;
    if (angle) filters.f_angles = angle;

    const rows = processAds(ads, {
      groupBy: "f_use_case",
      filters: filters,
      columns: ["f_use_case", "f_angles"]
    });

    const mappedRows = rows.map(r => ({
      ...r,
      usecases: r.f_use_case,
      angles: r.f_angles
    }));

    return res.status(200).json({
      columns: ["name", "adsCount", "usecases", "angles"],
      rows: mappedRows
    });

  } catch (err) {
    console.error("API ERROR /api/usecases:", err);
    return res.status(500).json({ error: err.message });
  }
}
