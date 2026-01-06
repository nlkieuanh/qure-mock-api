
/* ============================================================
   SHARED UTILS (Client-Side)
   Used by: drilldown.js, init_card_block.js
   ============================================================ */

/**
 * Helper to access nested properties (e.g. "f_insights.trigger_type")
 */
export function resolveValue(obj, path) {
    if (!path) return null;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

/**
 * Format number to locale string or fixed decimals
 */
export function format(v) {
    if (typeof v === "number") {
        if (!Number.isInteger(v)) {
            return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        return v.toLocaleString();
    }
    return v ?? "";
}

/**
 * Beautify field keys (e.g. f_products -> Product)
 */
export function pretty(str) {
    if (!str) return "";

    // Custom Mappings
    const map = {
        "adsCount": "Ads Count",
        "f_products": "Product",
        "f_use_case": "Use Case",
        "f_angles": "Angle",
        "f_offers": "Offer",
        "platform": "Platform"
    };
    if (map[str]) return map[str];

    // Auto-format: remove prefixes, split camelCase, capitalize
    let clean = str.replace(/^f_/, "").replace(/_/g, " ");
    clean = clean.split('.').pop(); // Handle f_insights.trigger_type -> trigger_type

    return clean
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, c => c.toUpperCase());
}

/**
 * Get Top 5 Distribution of a field (for secondary columns)
 */
export function getTopDist(ads, keyField) {
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

/**
 * Core Aggregation Logic
 * - Filters
 * - Grouping
 * - Metrics Calculation
 * - Timeseries Generation
 */
export function processAds(ads, { groupBy, filters = {}, timeseries = true, columns = [] } = {}) {
    let filtered = ads;

    // --- 1. FILTERING ---
    // Platform
    if (filters.platform) {
        filtered = filtered.filter(ad => String(ad.platform).toLowerCase() === filters.platform.toLowerCase());
    }
    // Date Range
    if (filters.start && filters.end) {
        const s = new Date(filters.start);
        const e = new Date(filters.end);
        filtered = filtered.filter(ad => {
            const d = new Date(ad.start_date || ad.date || 0);
            return d >= s && d <= e;
        });
    }

    // Dynamic Filters
    // 1. Array support: [{type: 'f_products', value: 'X'}, ...]
    if (Array.isArray(filters)) {
        filters.forEach(f => {
            filtered = filtered.filter(ad => {
                const actual = resolveValue(ad, f.type);
                if (Array.isArray(actual)) {
                    return actual.some(v => String(v) === String(f.value));
                }
                return String(actual) === String(f.value);
            });
        });
    }
    // 2. Object keys support (for core.js/api compatibility)
    else if (typeof filters === 'object') {
        Object.keys(filters).forEach(key => {
            if (["platform", "start", "end", "groupby", "fields"].includes(key)) return;

            filtered = filtered.filter(ad => {
                const actual = resolveValue(ad, key);
                const val = filters[key];
                if (Array.isArray(actual)) return actual.includes(val);
                return actual === val;
            });
        });
    }

    // --- 2. GROUPING ---
    const groups = {};
    const hasGrouping = !!groupBy;

    filtered.forEach(ad => {
        // Determine Group Key
        let groupKeys = ["Total"];
        if (hasGrouping) {
            const raw = resolveValue(ad, groupBy);
            if (Array.isArray(raw)) groupKeys = raw;
            else if (raw) groupKeys = [raw];
            else groupKeys = ["Unknown"];
        }

        // Extract Metric Values (Dynamically from ad.metrics + hardcoded fallbacks)
        const m = ad.metrics || {};
        // Base keys that we always want to track if they exist in root ad object (fallback)
        const baseMetrics = {
            spend: Number(m.totalSpend ?? ad.spend ?? 0),
            revenue: Number(m.totalRevenue ?? ad.revenue ?? 0),
            impressions: Number(m.impressions ?? ad.impressions ?? 0),
            clicks: Number(m.clicks ?? ad.clicks ?? 0),
            ...Object.keys(m).reduce((acc, k) => {
                if (typeof m[k] === 'number') acc[k] = m[k];
                return acc;
            }, {})
        };

        groupKeys.forEach(key => {
            const k = typeof key === 'string' ? key.trim() : String(key);
            if (!k) return;

            if (!groups[k]) {
                groups[k] = {
                    name: k,
                    adsCount: 0,
                    metrics: {}, // Store aggregated metrics here
                    rawAds: [],
                    timeseries: {}
                };
            }

            const g = groups[k];
            g.adsCount++;
            g.rawAds.push(ad);

            // Aggregate Metrics
            Object.entries(baseMetrics).forEach(([mKey, mVal]) => {
                g.metrics[mKey] = (g.metrics[mKey] || 0) + mVal;
            });

            // Timeseries
            if (timeseries) {
                const rawDate = ad.start_date || ad.date;
                if (rawDate) {
                    const dateKey = rawDate.split("T")[0]; // YYYY-MM-DD
                    if (!g.timeseries[dateKey]) {
                        g.timeseries[dateKey] = {
                            date: dateKey,
                            adsCount: 0,
                            metrics: {}
                        };
                    }
                    const ts = g.timeseries[dateKey];
                    ts.adsCount++;
                    Object.entries(baseMetrics).forEach(([mKey, mVal]) => {
                        ts.metrics[mKey] = (ts.metrics[mKey] || 0) + mVal;
                    });
                }
            }
        });
    });

    // --- 3. FORMAT RESULTS ---
    return Object.values(groups).map(g => {
        // Core Calculated Metrics (ROAS, CTR, CPC)
        // Note: We use 'spend', 'revenue', 'impressions', 'clicks' keys if they exist in aggregated metrics
        // If API returns different keys (e.g. 'totalSpend'), we need to map them for these calculations
        const spend = g.metrics.totalSpend || g.metrics.spend || 0;
        const revenue = g.metrics.totalRevenue || g.metrics.revenue || 0;
        const impressions = g.metrics.impressions || 0;
        const clicks = g.metrics.clicks || 0;

        const roas = spend > 0 ? revenue / spend : 0;
        const ctr = impressions > 0 ? clicks / impressions : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;

        const row = {
            name: g.name,
            adsCount: g.adsCount,
            roas,
            ctr,
            cpc,
            ...g.metrics // Spread all aggregated metrics (totalSpend, totalRevenue, etc.)
        };

        // Distribution columns
        if (columns.length > 0) {
            columns.forEach(col => {
                // Skip if col is a metric key we already have
                if (row.hasOwnProperty(col)) return;
                row[col] = getTopDist(g.rawAds, col);
            });
        }

        // Timeseries Array
        if (timeseries) {
            row.timeseries = Object.values(g.timeseries).map(t => {
                const tSpend = t.metrics.totalSpend || t.metrics.spend || 0;
                const tRevenue = t.metrics.totalRevenue || t.metrics.revenue || 0;
                const tImpressions = t.metrics.impressions || 0;
                const tClicks = t.metrics.clicks || 0;

                return {
                    date: t.date,
                    adsCount: t.adsCount,
                    roas: tSpend > 0 ? tRevenue / tSpend : 0,
                    ctr: tImpressions > 0 ? tClicks / tImpressions : 0,
                    cpc: tClicks > 0 ? tSpend / tClicks : 0,
                    ...t.metrics
                };
            }).sort((a, b) => a.date.localeCompare(b.date));
        }

        return row;
    });
}

