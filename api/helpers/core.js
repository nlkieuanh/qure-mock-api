import https from "https";

/* ============================================================
   SHARED CONFIG & UTILS
   ============================================================ */
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

// Helper to access nested properties (e.g. "f_insights.trigger_type")
export function resolveValue(obj, path) {
    if (!path) return null;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

// Internal Fetch Helper
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

// Logic to get Top 5 Distribution of a field (for secondary columns)
function getTopDist(ads, keyField) {
    const counts = {};
    ads.forEach(ad => {
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
        .map(([k, v]) => `${k} <span style="color:#888; font-size:0.9em">(${v})</span>`)
        .join("<br>");
}


/* ============================================================
   CORE FUNCTIONS (PUBLIC)
   ============================================================ */

/**
 * 1. Fetch Raw Ads from Upstream API
 */
export async function fetchAds(params = {}) {
    const baseUrl = "https://api.foresightiq.ai/";
    const member = "mem_cmizn6pdk0dmx0ssvf5bc05hw";
    const url = new URL("api/advertising/product-combination", baseUrl);

    // Set Default & Override Params
    url.searchParams.set("member", member);
    url.searchParams.set("query", params.query || "vs. Old Method");
    if (params.platform) url.searchParams.set("platform", params.platform);

    const { status, json, raw } = await getJson(url.toString());

    if (status < 200 || status >= 300) {
        throw new Error(`Upstream API Error: ${status} - ${raw}`);
    }

    return Array.isArray(json?.data?.results) ? json.data.results : [];
}

/**
 * 2. Process Ads (Filter -> Group -> Metrics -> Timeseries)
 * 
 * @param {Array} ads - Raw ad objects
 * @param {Object} options
 * @param {String} options.groupBy - Field ID to group by (e.g. "f_products")
 * @param {Object} options.filters - { start, end, platform, [dynamicKey]: value }
 * @param {Boolean} options.timeseries - Whether to generate daily timeseries
 * @param {Array} options.columns - List of additional columns/fields to include (distributions)
 */
export function processAds(ads, { groupBy, filters = {}, timeseries = false, columns = [] } = {}) {
    let filtered = ads;

    // --- A. FILTERING ---
    // 1. Platform
    if (filters.platform) {
        filtered = filtered.filter(ad => ad.platform === filters.platform);
    }
    // 2. Date Range
    if (filters.start && filters.end) {
        const s = new Date(filters.start);
        const e = new Date(filters.end);
        filtered = filtered.filter(ad => {
            const d = new Date(ad.start_date || ad.date || 0);
            return d >= s && d <= e;
        });
    }
    // 3. Dynamic Filters (e.g. searching specific product)
    Object.keys(filters).forEach(key => {
        if (["platform", "start", "end", "groupby", "fields"].includes(key)) return;

        filtered = filtered.filter(ad => {
            const actual = resolveValue(ad, key);
            const val = filters[key];
            if (Array.isArray(actual)) return actual.includes(val);
            return actual === val;
        });
    });

    // --- B. GROUPING ---
    const groups = {};
    const hasGrouping = !!groupBy;

    filtered.forEach(ad => {
        // Determine Group Key(s)
        let groupKeys = ["Total"];
        if (hasGrouping) {
            const raw = resolveValue(ad, groupBy);
            if (Array.isArray(raw)) groupKeys = raw;
            else if (raw) groupKeys = [raw];
            else groupKeys = ["Unknown"];
        }

        groupKeys.forEach(key => {
            const k = typeof key === 'string' ? key.trim() : key;
            if (!k) return;

            if (!groups[k]) {
                groups[k] = {
                    name: k,
                    adsCount: 0,
                    spend: 0,
                    revenue: 0,
                    impressions: 0,
                    clicks: 0,
                    rawAds: [],
                    timeseries: {}
                };
            }

            const g = groups[k];
            // Metrics Sum
            g.adsCount++;
            g.spend += Number(ad.spend) || 0;
            g.revenue += Number(ad.windsor?.action_values_omni_purchase || 0); // Normalized revenue key?
            // Fallback revenue check if needed, but stick to observed keys for now
            if (!Number(ad.windsor?.action_values_omni_purchase)) {
                g.revenue += Number(ad.revenue) || 0;
            }
            g.impressions += Number(ad.impressions) || 0;
            g.clicks += Number(ad.clicks) || 0;

            g.rawAds.push(ad);

            // Timeseries Accumulation
            if (timeseries) {
                const rawDate = ad.start_date || ad.date;
                const dateKey = rawDate ? rawDate.split("T")[0] : null;
                if (dateKey) {
                    if (!g.timeseries[dateKey]) {
                        g.timeseries[dateKey] = {
                            date: dateKey,
                            adsCount: 0, spend: 0, revenue: 0, impressions: 0, clicks: 0, roas: 0, ctr: 0
                        };
                    }
                    const ts = g.timeseries[dateKey];
                    ts.adsCount++;
                    ts.spend += Number(ad.spend) || 0;
                    ts.revenue += Number(ad.windsor?.action_values_omni_purchase || ad.revenue || 0);
                    ts.impressions += Number(ad.impressions) || 0;
                    ts.clicks += Number(ad.clicks) || 0;
                }
            }
        });
    });

    // --- C. FORMATTING RESULTS ---
    const resultRows = Object.values(groups).map(g => {
        // Calculate Derived Metrics
        const roas = g.spend > 0 ? g.revenue / g.spend : 0;
        const ctr = g.impressions > 0 ? g.clicks / g.impressions : 0;
        const cpc = g.clicks > 0 ? g.spend / g.clicks : 0;

        const row = {
            name: g.name,
            adsCount: g.adsCount,
            spend: g.spend,
            revenue: g.revenue,
            roas,
            ctr,
            cpc
        };

        // Add Distribution Columns (secondary fields)
        if (columns.length > 0) {
            columns.forEach(col => {
                if (["name", "adsCount", "spend", "revenue", "roas", "ctr", "cpc"].includes(col)) return;
                // It's a dimension, compute top dist
                row[col] = getTopDist(g.rawAds, col);
            });
        }

        // Finalize Timeseries
        if (timeseries) {
            row.timeseries = Object.values(g.timeseries).map(t => ({
                ...t,
                roas: t.spend > 0 ? t.revenue / t.spend : 0,
                ctr: t.impressions > 0 ? t.clicks / t.impressions : 0
            })).sort((a, b) => a.date.localeCompare(b.date));
        }

        return row;
    });

    return resultRows;
}
