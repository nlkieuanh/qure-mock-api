import { fetchAds, processAds } from "./helpers/core.js";

export default async function handler(req, res) {
  try {
    const { searchParams } = new URL(req.url, "http://localhost");
    const product = searchParams.get("product");
    const usecase = searchParams.get("usecase");
    const platform = searchParams.get("platform");
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    // 1. Fetch
    const ads = await fetchAds({ platform });

    // 2. Process
    const filters = {};
    if (product) filters.f_products = product;
    if (usecase) filters.f_use_case = usecase;
    if (platform) filters.platform = platform;
    if (start) filters.start = start;
    if (end) filters.end = end;

    const rows = processAds(ads, {
      groupBy: "f_angles",
      filters: filters,
      timeseries: true,
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
    console.error("API ERROR /api/angles:", err);
    return res.status(500).json({ error: err.message });
  }
}
