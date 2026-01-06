
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

        // Distinguish Summable vs Ratio metrics
        const RATIO_KEYS = ["roas", "ctr", "cpc", "revPerAd"];

        // We only sum keys that are numeric and NOT ratios.
        // We also want to track WHICH keys appeared in the upstream logic.

        // 1. Stats for Calculation (Internal Use Only) guarantees we have data for roas/ctr calcs
        // regardless of whether they appear in the final output or not.
        const stats = {
            spend: Number(m.totalSpend ?? ad.spend ?? 0),
            revenue: Number(m.totalRevenue ?? ad.revenue ?? 0),
            impressions: Number(m.impressions ?? ad.impressions ?? 0),
            clicks: Number(m.clicks ?? ad.clicks ?? 0),
        };

        // 2. Metrics for Display (Strictly what's in upstream 'metrics')
        // We filter out ratios from summing, but we KEEP track that they existed.
        const summableMetrics = {};
        const seenKeys = new Set();

        Object.keys(m).forEach(k => {
            if (typeof m[k] === 'number') {
                seenKeys.add(k);
                if (!RATIO_KEYS.includes(k)) {
                    summableMetrics[k] = m[k];
                }
            }
        });

        groupKeys.forEach(key => {
            const k = typeof key === 'string' ? key.trim() : String(key);
            if (!k) return;

            if (!groups[k]) {
                groups[k] = {
                    name: k,
                    adsCount: 0,
                    metrics: {}, // For Display (Summed)
                    stats: { spend: 0, revenue: 0, impressions: 0, clicks: 0 }, // For Calc
                    seenKeys: new Set(), // Track keys seen in this group
                    rawAds: [],
                    timeseries: {}
                };
            }

            const g = groups[k];
            g.adsCount++;
            g.rawAds.push(ad);

            // Track Seen Keys
            seenKeys.forEach(sk => g.seenKeys.add(sk));

            // Aggregate Stats (Internal)
            g.stats.spend += stats.spend;
            g.stats.revenue += stats.revenue;
            g.stats.impressions += stats.impressions;
            g.stats.clicks += stats.clicks;

            // Aggregate Metrics (Display)
            Object.entries(summableMetrics).forEach(([mKey, mVal]) => {
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
                            metrics: {}, // Display
                            stats: { spend: 0, revenue: 0, impressions: 0, clicks: 0 }, // Calc
                            seenKeys: new Set()
                        };
                    }
                    const ts = g.timeseries[dateKey];
                    ts.adsCount++;

                    // Stats
                    ts.stats.spend += stats.spend;
                    ts.stats.revenue += stats.revenue;
                    ts.stats.impressions += stats.impressions;
                    ts.stats.clicks += stats.clicks;

                    // Metrics
                    Object.entries(summableMetrics).forEach(([mKey, mVal]) => {
                        ts.metrics[mKey] = (ts.metrics[mKey] || 0) + mVal;
                    });

                    seenKeys.forEach(sk => ts.seenKeys.add(sk));
                }
            }
        });
    });

    // --- 3. FORMAT RESULTS ---
    return Object.values(groups).map(g => {
        // Calculate Ratios based on Aggregated Stats
        const spend = g.stats.spend;
        const revenue = g.stats.revenue;
        const impressions = g.stats.impressions;
        const clicks = g.stats.clicks;
        const adsCount = g.adsCount || 1;

        // Potential Calculated Values
        const calculations = {
            roas: spend > 0 ? revenue / spend : 0,
            ctr: impressions > 0 ? (clicks / impressions) * 100 : 0, // Assuming % conventions
            cpc: clicks > 0 ? spend / clicks : 0,
            revPerAd: adsCount > 0 ? revenue / adsCount : 0
        };

        // Construct Row strictly based on what was seen or summed
        const row = {
            name: g.name,
            adsCount: g.adsCount,
            ...g.metrics // Spread Summed Metrics (totalSpend, totalRevenue, etc)
        };

        // Conditionally add Calculated Ratios ONLY if they appeared in Upstream Keys
        // or if they are explicitly requested (but we stick to upstream fidelity)
        ["roas", "ctr", "cpc", "revPerAd"].forEach(key => {
            if (g.seenKeys.has(key)) {
                row[key] = calculations[key];
            }
        });

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
                const tRow = {
                    date: t.date,
                    adsCount: t.adsCount,
                    ...t.metrics
                };

                // Calc local stats
                const tSpend = t.stats.spend;
                const tRevenue = t.stats.revenue;
                const tImp = t.stats.impressions;
                const tClicks = t.stats.clicks;
                const tAdsCount = t.adsCount;

                const tCalcs = {
                    roas: tSpend > 0 ? tRevenue / tSpend : 0,
                    ctr: tImp > 0 ? (tClicks / tImp) * 100 : 0,
                    cpc: tClicks > 0 ? tSpend / tClicks : 0,
                    revPerAd: tAdsCount > 0 ? tRevenue / tAdsCount : 0
                };

                ["roas", "ctr", "cpc", "revPerAd"].forEach(key => {
                    if (t.seenKeys.has(key)) {
                        tRow[key] = tCalcs[key];
                    }
                });

                return tRow;
            }).sort((a, b) => a.date.localeCompare(b.date));
        }

        return row;
    });
}

