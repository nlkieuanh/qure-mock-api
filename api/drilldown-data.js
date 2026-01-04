import https from "https";

/* ================= TLS BYPASS (TEMP) ================= */
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

function getJson(url) {
    return new Promise((resolve) => {
        const req = https.request(
            url,
            {
                method: "GET",
                headers: { Accept: "application/json" },
                agent: insecureAgent,
            },
            (res) => {
                let data = "";
                res.on("data", (c) => (data += c));
                res.on("end", () => {
                    try {
                        resolve({ status: res.statusCode || 0, json: JSON.parse(data) });
                    } catch {
                        resolve({ status: res.statusCode || 0, json: null });
                    }
                });
            }
        );
        req.on("error", () => resolve({ status: 0, json: null }));
        req.end();
    });
}

/* ================= HELPERS ================= */

function matchSearch(ad, q) {
    if (!q) return true;
    const t = q.toLowerCase();
    return (
        ad.title?.toLowerCase().includes(t) ||
        ad.f_products?.toLowerCase().includes(t) ||
        ad.f_use_case?.toLowerCase().includes(t) ||
        ad.f_angles?.toLowerCase().includes(t) ||
        ad.f_offers?.toLowerCase().includes(t) ||
        ad.f_promotion?.toLowerCase().includes(t)
    );
}

function bump(map, value) {
    const v = String(value ?? "Unknown").trim() || "Unknown";
    map.set(v, (map.get(v) || 0) + 1);
}

function formatTop(map, topN = 5) {
    const arr = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const top = arr.slice(0, topN).map(([k, c]) => `${k} (${c})`);
    const rest = arr.length > topN ? ` + ${arr.length - topN} more` : "";
    return top.join(", ") + rest;
}

/* ================= HANDLER ================= */

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();

    const BASE_URL = "https://api.foresightiq.ai/";
    const MEMBER = "mem_cmizn6pdk0dmx0ssvf5bc05hw";
    const DEFAULT_QUERY = "";

    const level = req.query?.level || "product"; // product | usecase | angle
    const query = req.query?.query || "";
    const product = req.query?.product || "";
    const usecase = req.query?.usecase || "";
    const angle = req.query?.angle || ""; // ADDED parameter
    const platform = req.query?.platform || "";

    /* ===== 1. LOAD ADS DATA ===== */
    const url = new URL("api/advertising/product-combination", BASE_URL);
    url.searchParams.set("member", MEMBER);
    url.searchParams.set("query", query || DEFAULT_QUERY);
    if (platform) url.searchParams.set("platform", platform);

    const { status, json } = await getJson(url.toString());
    const ads = status === 200 ? json?.data?.results || [] : [];

    /* ===== 2. APPLY SEARCH + DRILLDOWN FILTER ===== */
    const filtered = ads.filter((ad) => {
        if (!matchSearch(ad, query)) return false;
        if (product && ad.f_products !== product) return false;
        if (usecase && ad.f_use_case !== usecase) return false;
        if (angle && ad.f_angles !== angle) return false; // ADDED filter
        return true;
    });

    /* ===== 3. GROUP BY LEVEL ===== */
    const groupKey =
        level === "product"
            ? "f_products"
            : level === "usecase"
                ? "f_use_case"
                : "f_angles";

    const groups = new Map();

    for (const ad of filtered) {
        const name = String(ad?.[groupKey] ?? "Unknown").trim() || "Unknown";

        if (!groups.has(name)) {
            groups.set(name, {
                name,
                adsCount: 0,
                usecasesMap: new Map(),
                anglesMap: new Map(),
                offersMap: new Map(),
                promotionsMap: new Map(),
                tsMap: new Map(),
            });
        }

        const g = groups.get(name);
        g.adsCount += 1;

        bump(g.usecasesMap, ad.f_use_case);
        bump(g.anglesMap, ad.f_angles);
        bump(g.offersMap, ad.f_offers);
        bump(g.promotionsMap, ad.f_promotion);

        const date = String(ad.start_date ?? "").slice(0, 10);
        if (date) g.tsMap.set(date, (g.tsMap.get(date) || 0) + 1);
    }

    /* ===== 4. BUILD ROWS ===== */
    const rows = Array.from(groups.values()).map((g) => ({
        name: g.name,
        adsCount: g.adsCount,
        usecases: formatTop(g.usecasesMap),
        angles: formatTop(g.anglesMap),
        offers: formatTop(g.offersMap),
        promotions: formatTop(g.promotionsMap),
        timeseries: Array.from(g.tsMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, adsCount]) => ({ date, adsCount })),
    }));

    /* ===== 5. RETURN ===== */
    return res.status(200).json({
        columns: ["name", "adsCount", "usecases", "angles", "offers", "promotions"],
        rows,
    });
}
