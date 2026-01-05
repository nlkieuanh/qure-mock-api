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

// Helpers
function getTopDist(ads, keyField) {
    const counts = {};
    ads.forEach(ad => {
        // Handle flattened keys like f_insights.trigger_type vs f_products
        const items = resolveValue(ad, keyField);
        const list = Array.isArray(items) ? items : [items];

        list.forEach(i => {
            const val = (i || "Unknown").trim();
            if (!val) return;
            counts[val] = (counts[val] || 0) + 1;
        });
    });

    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1]) // Sort by count desc
        .slice(0, 5) // Top 5
        .map(([k, v]) => `${k} (${v})`)
        .join(", ");
}

// Safely access nested property (e.g. "f_insights.trigger_type")
function resolveValue(obj, path) {
    if (!path) return null;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") return res.status(200).end();

    const { searchParams } = new URL(req.url, "http://localhost");
    const groupby = searchParams.get("groupby") || "f_products"; // Default
    const fieldsParam = searchParams.get("fields");

    // Other filters
    const platform = searchParams.get("platform");
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    // Optional: support filtering by specific field values for drilldown context
    // e.g. &f_products=Qure...

    const baseUrl = "https://api.foresightiq.ai/";
    const member = "mem_cmizn6pdk0dmx0ssvf5bc05hw";
    const url = new URL("api/advertising/product-combination", baseUrl);
    url.searchParams.set("member", member);
    url.searchParams.set("query", "vs. Old Method");

    try {
        const { status, json, raw } = await getJson(url.toString());

        if (status < 200 || status >= 300) {
            return res.status(status || 500).json({ error: "Upstream error", detail: raw });
        }

        let ads = Array.isArray(json?.data?.results) ? json.data.results : [];

        /* ------------------------------------------------
           1. FILTERING
           ------------------------------------------------ */
        // Apply standard filters
        if (platform) ads = ads.filter(ad => ad.platform === platform);
        if (start && end) {
            const s = new Date(start);
            const e = new Date(end);
            ads = ads.filter(ad => {
                const d = new Date(ad.start_date || ad.date || 0);
                return d >= s && d <= e;
            });
        }

        // Apply filters from query params that match known fields (dynamic filtering)
        // We iterate over searchParams and if key is not reserved, we treat it as a filter
        const reserved = ["groupby", "fields", "platform", "start", "end", "member", "query"];
        for (const [key, val] of searchParams.entries()) {
            if (!reserved.includes(key)) {
                ads = ads.filter(ad => {
                    const actual = resolveValue(ad, key);
                    if (Array.isArray(actual)) return actual.includes(val);
                    return actual === val;
                });
            }
        }

        /* ------------------------------------------------
           2. GROUPING
           ------------------------------------------------ */
        const groups = {};

        ads.forEach(ad => {
            const groupValRaw = resolveValue(ad, groupby);
            // Group val might be array (e.g. usecases) -> split rows? or primary? 
            // For drilldown, usually we pivot. If array, we create entry for each.
            let groupKeys = [];
            if (Array.isArray(groupValRaw)) groupKeys = groupValRaw;
            else if (groupValRaw) groupKeys = [groupValRaw];
            else groupKeys = ["Unknown"];

            groupKeys.forEach(key => {
                const k = typeof key === 'string' ? key.trim() : key;
                if (!k) return;

                if (!groups[k]) {
                    groups[k] = {
                        name: k,
                        adsCount: 0,
                        rawAds: []
                        // Add summable metrics here if needed
                    };
                }
                groups[k].adsCount++;
                groups[k].rawAds.push(ad);
            });
        });

        /* ------------------------------------------------
           3. SHAPING RESPONSE (COLUMNS)
           ------------------------------------------------ */
        // Determine columns to return
        // Default columns if not specified
        let columns = ["name", "adsCount"];

        if (fieldsParam) {
            // If user asks for fields, we append them. 
            // Note: "name" and "adsCount" are base metrics for the group. 
            // Additional fields usually mean "Distribution of X within this group" (like top usecases)
            // or sum of metrics (spend). 
            const requested = fieldsParam.split(",").map(s => s.trim());
            columns = [...columns, ...requested];
        } else {
            // Legacy Default fallback
            columns = ["name", "adsCount", "usecases", "angles"];
        }

        // Map rows
        const rows = Object.values(groups).map(g => {
            const row = {
                name: g.name,
                adsCount: g.adsCount
            };

            // Compute requested extra columns
            columns.forEach(col => {
                if (col === "name" || col === "adsCount") return;

                // If the column corresponds to a distribution (like "usecases" in old API)
                // We map generic names to specific logic or generic logic
                if (col === "usecases") row.usecases = getTopDist(g.rawAds, "f_use_case");
                else if (col === "angles") row.angles = getTopDist(g.rawAds, "f_angles");
                else {
                    // Generic distribution for any other field requested?
                    // Or maybe it's a metric sum (spend)?
                    // Simple heuristic: if field exists in ad, sum it? Or distribution?
                    // For now, let's assume if it starts with 'f_' it's a dimension -> distribution
                    // If it matches spend/impressions -> sum.

                    if (["spend", "revenue", "impressions", "clicks"].includes(col)) {
                        row[col] = g.rawAds.reduce((sum, ad) => sum + (Number(ad[col]) || 0), 0);
                    } else {
                        // Assume dimension -> show top distribution
                        // Check if col is a valid key in ad (e.g. f_products)
                        // We trust the frontend sends valid keys.
                        row[col] = getTopDist(g.rawAds, col);
                    }
                }
            });
            return row;
        });

        return res.status(200).json({
            columns,
            rows
        });

    } catch (err) {
        console.error("API ERROR /api/data:", err);
        return res.status(500).json({ error: err.message });
    }
}
