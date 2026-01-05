import https from "https";
import { resolveValue, processAds, getTopDist } from "../../public/utils.js";

export { resolveValue, processAds };

/* ============================================================
   SHARED CONFIG & UTILS
   ============================================================ */
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

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
 * processAds is imported from public/utils.js
 */
