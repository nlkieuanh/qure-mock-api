
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

        // Extract Metric Values
        const m = ad.metrics || {};
        const spend = Number(m.totalSpend ?? ad.spend ?? 0);
        const revenue = Number(m.totalRevenue ?? ad.revenue ?? 0);
        const impressions = Number(m.impressions ?? ad.impressions ?? 0);
        const clicks = Number(m.clicks ?? ad.clicks ?? 0);

        groupKeys.forEach(key => {
            const k = typeof key === 'string' ? key.trim() : String(key);
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
            g.adsCount++;
            g.spend += spend;
            g.revenue += revenue;
            g.impressions += impressions;
            g.clicks += clicks;
            g.rawAds.push(ad);

            // Timeseries
            if (timeseries) {
                const rawDate = ad.start_date || ad.date;
                if (rawDate) {
                    const dateKey = rawDate.split("T")[0]; // YYYY-MM-DD
                    if (!g.timeseries[dateKey]) {
                        g.timeseries[dateKey] = {
                            date: dateKey,
                            adsCount: 0, spend: 0, revenue: 0, impressions: 0, clicks: 0
                        };
                    }
                    const ts = g.timeseries[dateKey];
                    ts.adsCount++;
                    ts.spend += spend;
                    ts.revenue += revenue;
                    ts.impressions += impressions;
                    ts.clicks += clicks;
                }
            }
        });
    });

    // --- 3. FORMAT RESULTS ---
    return Object.values(groups).map(g => {
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

        // Distribution columns
        if (columns.length > 0) {
            columns.forEach(col => {
                if (["name", "adsCount", "spend", "revenue", "roas", "ctr", "cpc"].includes(col)) return;
                row[col] = getTopDist(g.rawAds, col);
            });
        }

        // Timeseries Array
        if (timeseries) {
            row.timeseries = Object.values(g.timeseries).map(t => ({
                ...t,
                roas: t.spend > 0 ? t.revenue / t.spend : 0,
                ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
                cpc: t.clicks > 0 ? t.spend / t.clicks : 0
            })).sort((a, b) => a.date.localeCompare(b.date));
        }

        return row;
    });
}

