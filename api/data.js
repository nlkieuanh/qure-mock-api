import { fetchAds, processAds } from "./helpers/core.js";

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") return res.status(200).end();

    const { searchParams } = new URL(req.url, "http://localhost");
    const groupby = searchParams.get("groupby") || "f_products";
    const fieldsParam = searchParams.get("fields");

    // Extract arbitrary filters
    const filters = {};
    for (const [key, val] of searchParams.entries()) {
        filters[key] = val;
    }

    try {
        // 1. Fetch
        // Pass query/platform if needed for initial fetch optimization, though filters context handles most
        const ads = await fetchAds({
            platform: filters.platform,
            query: filters.query
        });

        // 2. Process
        const requestedColumns = fieldsParam ? fieldsParam.split(",").map(s => s.trim()) : [];

        // Determine columns to ensure we return requested + base
        // If fieldsParam is used, we return exactly those + name? Or Drilldown convention?
        // Drilldown expects: [name, adsCount, ...others]
        let columns = ["name", "adsCount", ...requestedColumns];
        if (!fieldsParam) {
            // Legacy default
            columns = ["name", "adsCount", "usecases", "angles"];
            requestedColumns.push("f_use_case", "f_angles");
        }

        const rows = processAds(ads, {
            groupBy: groupby,
            filters: filters,
            timeseries: false, // Drilldown table doesn't need timeseries usually
            columns: requestedColumns
        });

        return res.status(200).json({
            columns,
            rows: rows
        });

    } catch (err) {
        console.error("API ERROR /api/data:", err);
        return res.status(500).json({ error: err.message });
    }
}
