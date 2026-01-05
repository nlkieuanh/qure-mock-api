import { fetchAds, processAds } from "./helpers/core.js";

export default async function handler(req, res) {
  try {
    const { searchParams } = new URL(req.url, "http://localhost");
    const usecase = searchParams.get("usecase");
    const angle = searchParams.get("angle");

    // 1. Fetch
    const ads = await fetchAds();

    // 2. Process
    // Map legacy query params to actual field names for filtering
    const filters = {};
    if (usecase) filters.f_use_case = usecase;
    if (angle) filters.f_angles = angle;

    const rows = processAds(ads, {
      groupBy: "f_products",
      filters: filters,
      columns: ["f_use_case", "f_angles"] // Include distribution columns
    });

    // Map output keys to match legacy response expectation if needed (usecases, angles)
    // processAds returns keys as 'f_use_case', 'f_angles'. 
    // We might need to map them to 'usecases', 'angles' to maintain backward compatibility?
    // Let's do a quick map.
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
    console.error("API ERROR /api/products:", err);
    return res.status(500).json({ error: err.message });
  }
}
