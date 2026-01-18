
/* ============================================================
   BUNDLED DRILLDOWN SCRIPT
   Combined from: utils.js + drilldown.js + init_card_block.js
   Usage: Host this file on GitHub/CDN and include via <script src="...">
   ============================================================ */

(function () {

    /* ============================================================
       PART 1: SHARED UTILS
       ============================================================ */

    /**
     * Helper to access nested properties (e.g. "f_insights.trigger_type")
     */
    function resolveValue(obj, path) {
        if (!path) return null;
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    }

    /**
     * Format number to locale string or fixed decimals
     */
    function format(v) {
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
    function pretty(str) {
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

    /**
     * Core Aggregation Logic
     */
    function processAds(ads, { groupBy, filters = {}, timeseries = true, columns = [] } = {}) {
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
            let groupKeys = ["Total"];
            if (hasGrouping) {
                const raw = resolveValue(ad, groupBy);
                if (Array.isArray(raw)) groupKeys = raw;
                else if (raw) groupKeys = [raw];
                else groupKeys = ["Unknown"];
            }

            const m = ad.metrics || {};
            const RATIO_KEYS = ["roas", "ctr", "cpc", "revPerAd"];
            const stats = {
                spend: Number(m.totalSpend ?? ad.spend ?? 0),
                revenue: Number(m.totalRevenue ?? ad.revenue ?? 0),
                impressions: Number(m.impressions ?? ad.impressions ?? 0),
                clicks: Number(m.clicks ?? ad.clicks ?? 0),
            };

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
                        metrics: {},
                        stats: { spend: 0, revenue: 0, impressions: 0, clicks: 0 },
                        seenKeys: new Set(),
                        rawAds: [],
                        timeseries: {}
                    };
                }

                const g = groups[k];
                g.adsCount++;
                g.rawAds.push(ad);
                seenKeys.forEach(sk => g.seenKeys.add(sk));

                g.stats.spend += stats.spend;
                g.stats.revenue += stats.revenue;
                g.stats.impressions += stats.impressions;
                g.stats.clicks += stats.clicks;

                Object.entries(summableMetrics).forEach(([mKey, mVal]) => {
                    g.metrics[mKey] = (g.metrics[mKey] || 0) + mVal;
                });

                if (timeseries) {
                    const rawDate = ad.start_date || ad.date;
                    if (rawDate) {
                        const dateKey = rawDate.split("T")[0];
                        if (!g.timeseries[dateKey]) {
                            g.timeseries[dateKey] = {
                                date: dateKey,
                                adsCount: 0,
                                metrics: {},
                                stats: { spend: 0, revenue: 0, impressions: 0, clicks: 0 },
                                seenKeys: new Set()
                            };
                        }
                        const ts = g.timeseries[dateKey];
                        ts.adsCount++;
                        ts.stats.spend += stats.spend;
                        ts.stats.revenue += stats.revenue;
                        ts.stats.impressions += stats.impressions;
                        ts.stats.clicks += stats.clicks;
                        Object.entries(summableMetrics).forEach(([mKey, mVal]) => {
                            ts.metrics[mKey] = (ts.metrics[mKey] || 0) + mVal;
                        });
                        seenKeys.forEach(sk => ts.seenKeys.add(sk));
                    }
                }
            });
        });

        return Object.values(groups).map(g => {
            const spend = g.stats.spend;
            const revenue = g.stats.revenue;
            const impressions = g.stats.impressions;
            const clicks = g.stats.clicks;
            const adsCount = g.adsCount || 1;

            const calculations = {
                roas: spend > 0 ? revenue / spend : 0,
                ctr: impressions > 0 ? (clicks / impressions) * 100 : 0, // Assuming % conventions
                cpc: clicks > 0 ? spend / clicks : 0,
                revPerAd: adsCount > 0 ? revenue / adsCount : 0
            };

            const row = {
                name: g.name,
                adsCount: g.adsCount,
                ...g.metrics
            };

            ["roas", "ctr", "cpc", "revPerAd"].forEach(key => {
                if (g.seenKeys.has(key)) {
                    row[key] = calculations[key];
                }
            });

            if (columns.length > 0) {
                columns.forEach(col => {
                    if (row.hasOwnProperty(col)) return;
                    row[col] = getTopDist(g.rawAds, col);
                });
            }

            if (timeseries) {
                row.timeseries = Object.values(g.timeseries).map(t => {
                    const tRow = {
                        date: t.date,
                        adsCount: t.adsCount,
                        ...t.metrics
                    };
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

    function sortRows(rows, key, dir) {
        return rows.sort((a, b) => {
            const A = a[key] ?? 0;
            const B = b[key] ?? 0;

            const isStr = typeof A === 'string' || typeof B === 'string';
            if (isStr) {
                const sA = String(A).toLowerCase();
                const sB = String(B).toLowerCase();
                return dir === "asc" ? sA.localeCompare(sB) : sB.localeCompare(sA);
            }
            return dir === "asc" ? A - B : B - A;
        });
    }

    /**
     * SHARED: Fetch Data from Real API
     */
    async function fetchRawAdsCache() {
        if (window._globalAdCache) return window._globalAdCache;

        const baseUrl = "https://api.foresightiq.ai/";
        const member = "mem_cmizn6pdk0dmx0ssvf5bc05hw";
        const url = new URL("api/advertising/product-combination", baseUrl);
        url.searchParams.set("memberId", member);

        // If needed, remove default limit to get all data for client aggregation
        // url.searchParams.set("limit", 10000); 

        try {
            const res = await fetch(url.toString());
            const json = await res.json();

            // Normalize response: Expect an array of ads
            // If API returns { data: { results: [...] } }, normalize it
            let ads = [];
            if (Array.isArray(json)) {
                ads = json;
            } else if (json.data && Array.isArray(json.data.results)) {
                ads = json.data.results;
            } else if (json.results && Array.isArray(json.results)) {
                ads = json.results;
            }

            window._globalAdCache = ads;
            return ads;
        } catch (err) {
            console.error("[Data Fetch] Error:", err);
            return [];
        }
    }


    /* ============================================================
       PART 2: DRILLDOWN LOGIC (Product Combination)
       ============================================================ */
    document.addEventListener("DOMContentLoaded", function () {

        const card = document.querySelector(".card-block-wrap.product-combination-card");
        if (!card) return;

        const wrapper = card.querySelector(".adv-channel-table-wrapper");
        const chipContainer = card.querySelector(".dd-chips-container");
        const searchInput = card.querySelector(".dd-search-input");
        const searchDropdown = card.querySelector(".dd-search-dropdown");
        const tabContainer = card.querySelector(".drilldown-tab-filter-wrap");

        // State
        const state = {
            currentTabId: "f_products",
            tabs: [
                { id: "f_products", label: "Product" },
                { id: "f_use_case", label: "Use Case" },
                { id: "f_angles", label: "Angle" }
            ],
            filters: []
        };

        /* ============================================================
           UNIVERSAL TABLE MODULE
           ============================================================ */
        class UniversalTable {
            constructor(root, onRowClick) {
                this.root = root;
                this.onRowClick = onRowClick;
                this.data = { columns: [], rows: [] };
                this.sort = { key: null, dir: null };
            }

            setData(data) {
                this.data = data ?? { columns: [], rows: [] };
                this.render();
            }

            render() {
                const { columns, rows } = this.data;

                // 1. Build Header
                let html = '<table class="adv-channel-table"><thead><tr>';
                columns.forEach(col => {
                    let headerText = pretty(col);
                    if (col === "name" && state.tabs.find(t => t.id === state.currentTabId)) {
                        headerText = state.tabs.find(t => t.id === state.currentTabId).label;
                    }
                    html += `<th data-col="${col}">${headerText}</th>`;
                });
                html += '</tr></thead><tbody>';

                // 2. Build Rows
                rows.forEach(row => {
                    const keyVal = row["name"];
                    html += `<tr class="dd-row" data-value="${keyVal}">`;
                    columns.forEach(col => {
                        html += `<td>${format(row[col])}</td>`;
                    });
                    html += '</tr>';
                });

                html += '</tbody></table>';
                this.root.innerHTML = html;

                this.attachSortEvents();
                this.attachRowEvents();
            }

            attachSortEvents() {
                const ths = this.root.querySelectorAll("th");
                ths.forEach(th => {
                    th.addEventListener("click", () => {
                        const key = th.dataset.col;
                        this.updateSort(key);
                        this.sortRows();
                        this.render();
                    });
                });
            }

            updateSort(key) {
                if (this.sort.key !== key) {
                    this.sort = { key, dir: "asc" };
                } else {
                    this.sort.dir = this.sort.dir === "asc" ? "desc" : "asc";
                }
            }

            sortRows() {
                const { key, dir } = this.sort;
                if (!key) return;
                sortRows(this.data.rows, key, dir);
            }

            attachRowEvents() {
                if (!this.onRowClick) return;
                const rows = this.root.querySelectorAll(".dd-row");
                rows.forEach(row => {
                    row.addEventListener("click", () => {
                        this.onRowClick(row.dataset.value);
                    });
                });
            }
        }

        /* ============================================================
           SEARCH BAR (GLOBAL)
           ============================================================ */
        let searchTimer = null;

        function initSearch() {
            if (!searchInput || !searchDropdown) return;

            searchInput.addEventListener("input", (e) => {
                const term = e.target.value.trim().toLowerCase();
                if (!term) {
                    hideSearchDropdown();
                    return;
                }

                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => {
                    performGlobalSearch(term);
                }, 300);
            });

            document.addEventListener("click", (evt) => {
                if (!card.contains(evt.target)) {
                    hideSearchDropdown();
                }
            });
        }

        async function performGlobalSearch(term) {
            try {
                const ads = await fetchRawAdsCache();
                const suggestions = buildGlobalSuggestions(ads, term);
                renderSearchDropdown(suggestions);
            } catch (err) {
                console.error("Search error", err);
            }
        }

        function buildGlobalSuggestions(ads, term) {
            const hits = new Map(); // Dedup
            const activeKeys = state.tabs.map(t => t.id); // Only search checked fields

            ads.forEach(ad => {
                activeKeys.forEach(key => {
                    let raw = resolveValue(ad, key);
                    if (raw === undefined || raw === null) return;

                    let values = [];
                    if (Array.isArray(raw)) values = raw;
                    else values = [raw];

                    values.forEach(val => {
                        const strVal = String(val);
                        if (strVal.toLowerCase().includes(term)) {
                            const uniqueKey = strVal + "|" + key;
                            if (!hits.has(uniqueKey)) {
                                hits.set(uniqueKey, { value: strVal, type: key });
                            }
                        }
                    });
                });
            });

            return Array.from(hits.values()).slice(0, 15);
        }

        function renderSearchDropdown(list) {
            if (!list.length) {
                searchDropdown.innerHTML = '<div class="dd-search-item">No results</div>';
                searchDropdown.classList.remove("is-hidden");
                return;
            }

            searchDropdown.innerHTML = list.map(item => {
                const label = pretty(item.type);
                return `<div class="dd-search-item" data-value="${item.value}" data-type="${item.type}">
                <strong>${label}</strong>: ${item.value}
              </div>`;
            }).join("");

            searchDropdown.classList.remove("is-hidden");

            searchDropdown.querySelectorAll(".dd-search-item").forEach(el => {
                el.addEventListener("click", () => {
                    handleSearchSelect(el.dataset.value, el.dataset.type);
                });
            });
        }

        function hideSearchDropdown() {
            if (!searchDropdown) return;
            searchDropdown.classList.add("is-hidden");
            searchDropdown.innerHTML = "";
        }

        function handleSearchSelect(value, type) {
            searchInput.value = "";
            hideSearchDropdown();

            const exists = state.filters.some(f => f.type === type && f.value === value);
            if (!exists) {
                state.filters.push({ type, value });
            }
            loadLevel();
        }

        /* ============================================================
           CHIP UI
           ============================================================ */
        function renderChips() {
            chipContainer.innerHTML = "";
            state.filters.forEach((f, idx) => {
                const chip = document.createElement("div");
                chip.className = "dd-chip";
                const niceType = f.type.replace("f_", "").replace("_", " ");
                chip.innerHTML = `
        <span class="dd-chip-label">${niceType}: ${f.value}</span>
        <div class="dd-chip-remove">✕</div>
      `;
                chip.querySelector(".dd-chip-remove").addEventListener("click", () => {
                    state.filters.splice(idx, 1);
                    loadLevel();
                });
                chipContainer.appendChild(chip);
            });
        }

        /* ============================================================
           FIELD SELECTOR (CHECKBOX DROPDOWN)
           ============================================================ */
        function renderFieldSelector() {
            const dropdown = card.querySelector(".dd-add-field-select");
            if (!dropdown) return;

            const toggle = dropdown.querySelector(".dd-add-field-toggle");
            const listWrap = dropdown.querySelector(".dd-add-field-list");
            const listInner = dropdown.querySelector(".dd-add-field-list-inner") || listWrap;

            if (!toggle || !listWrap) return;

            renderFieldOptions(listInner);

            if (dropdown.dataset.bound) return;
            dropdown.dataset.bound = "true";

            toggle.addEventListener("click", (e) => {
                e.stopPropagation();
                const isHidden = getComputedStyle(listWrap).display === "none";
                if (isHidden) {
                    listWrap.style.display = "block";
                    listWrap.style.minWidth = "100%";
                    listWrap.style.width = "max-content";
                    listWrap.style.position = "absolute";
                    listWrap.style.right = "0";
                    listWrap.style.left = "auto";
                    renderFieldOptions(listInner);
                } else {
                    listWrap.style.display = "none";
                }
            });

            document.addEventListener("click", (e) => {
                if (!dropdown.contains(e.target)) {
                    listWrap.style.display = "none";
                }
            });
        }

        function renderFieldOptions(container) {
            if (!container) return;

            const allFields = [
                { id: "f_products", label: "Product" },
                { id: "f_use_case", label: "Use Case" },
                { id: "f_angles", label: "Angle" },
                { id: "f_insights.trigger_type", label: "Trigger Type" },
                { id: "f_insights.visual_style", label: "Visual Style" },
                { id: "f_insights.hook_type", label: "Hook Type" },
                { id: "platform", label: "Platform" },
                { id: "f_offers", label: "Offer" },
                { id: "f_insights.cta_type", label: "CTA Type" }
            ];

            container.innerHTML = allFields.map(f => {
                const isChecked = state.tabs.some(t => t.id === f.id);
                return `
        <div class="dd-add-field-item">
           <label class="dd-field-item-div" style="display: flex; align-items: center; cursor: pointer; margin:0; white-space: nowrap;">
              <input type="checkbox" class="dd-field-item-checkbox" data-id="${f.id}" data-label="${f.label}" ${isChecked ? "checked" : ""} style="margin-right: 8px;">
              <div class="dd-field-item-text" style="font-size: 14px;">${f.label}</div>
           </label>
        </div>
      `;
            }).join("");

            container.querySelectorAll(".dd-field-item-checkbox").forEach(chk => {
                chk.addEventListener("change", (e) => {
                    handleToggleTab(e.target.dataset.id, e.target.dataset.label, e.target.checked);
                });
            });
        }

        function showToast(message) {
            const toast = card.querySelector(".dd-warning-toast");
            if (toast) {
                toast.textContent = message;
                toast.style.display = "flex";
                setTimeout(() => {
                    toast.style.display = "none";
                }, 3000);
            } else {
                alert(message);
            }
        }

        function handleToggleTab(id, label, isChecked) {
            if (isChecked) {
                if (state.tabs.length >= 5) {
                    showToast("Limit reached: Maximum 5 fields.");
                    renderTabs();
                    return;
                }
                if (!state.tabs.find(t => t.id === id)) {
                    state.tabs.push({ id, label });
                }
            } else {
                if (state.tabs.length <= 1) {
                    showToast("Limit reached: Minimum 1 field.");
                    renderTabs();
                    return;
                }
                const idx = state.tabs.findIndex(t => t.id === id);
                if (idx !== -1) {
                    state.tabs.splice(idx, 1);
                    if (state.currentTabId === id) {
                        state.currentTabId = state.tabs[0]?.id || null;
                    }
                }
            }
            renderTabs();
            if (state.currentTabId) loadLevel();
        }

        function renderTabs() {
            if (!tabContainer) return;
            tabContainer.innerHTML = "";
            state.tabs.forEach((tab, index) => {
                const btn = document.createElement("a");
                btn.className = "drilldown-tab-button w-inline-block";
                if (tab.id === state.currentTabId) btn.classList.add("is-current");
                btn.innerHTML = `<div class="text-block-7" style="pointer-events: none;">${tab.label}</div>`;
                btn.addEventListener("click", () => {
                    state.currentTabId = tab.id;
                    renderTabs();
                    loadLevel();
                });
                btn.setAttribute("draggable", "true");
                btn.dataset.index = index;
                btn.addEventListener("dragstart", (e) => {
                    e.dataTransfer.setData("text/plain", index);
                    e.dataTransfer.effectAllowed = "move";
                    btn.style.opacity = "0.5";
                });
                btn.addEventListener("dragend", () => {
                    btn.style.opacity = "1";
                    document.querySelectorAll(".drilldown-tab-button").forEach(b => b.classList.remove("drag-over"));
                });
                btn.addEventListener("dragover", (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    btn.classList.add("drag-over");
                });
                btn.addEventListener("dragleave", () => {
                    btn.classList.remove("drag-over");
                });
                btn.addEventListener("drop", (e) => {
                    e.preventDefault();
                    const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
                    const toIndex = index;
                    if (fromIndex !== toIndex) {
                        const movedItem = state.tabs.splice(fromIndex, 1)[0];
                        state.tabs.splice(toIndex, 0, movedItem);
                        renderTabs();
                        loadLevel();
                    }
                });
                tabContainer.appendChild(btn);
            });
            renderFieldSelector();
        }

        async function loadLevel() {
            if (!state.currentTabId) return;
            try {
                const ads = await fetchRawAdsCache(); // Use shared fetcher
                const rows = processAds(ads, {
                    groupBy: state.currentTabId,
                    filters: state.filters
                });
                let columns = ["name", "adsCount"];
                if (rows.length > 0) {
                    const firstRow = rows[0];
                    const metricKeys = Object.keys(firstRow).filter(k =>
                        typeof firstRow[k] === 'number' &&
                        !["adsCount"].includes(k)
                    );
                    columns.push(...metricKeys);
                } else {
                    columns.push("spend", "revenue");
                }
                console.log(`[Drilldown] Aggregated ${state.currentTabId}: `, rows.length, "rows");
                table.setData({ columns, rows });
                renderChips();
                renderTabs();
            } catch (err) {
                console.error("Load Error", err);
            }
        }

        const table = new UniversalTable(wrapper, (value) => {
            state.filters.push({ type: state.currentTabId, value });
            const curIdx = state.tabs.findIndex(t => t.id === state.currentTabId);
            if (curIdx >= 0 && curIdx < state.tabs.length - 1) {
                state.currentTabId = state.tabs[curIdx + 1].id;
            }
            loadLevel();
        });

        initSearch();
        renderTabs();
        loadLevel();

        document.addEventListener("click", (e) => {
            document.querySelectorAll(".dd-field-selector").forEach(selector => {
                if (!selector.contains(e.target)) {
                    const dd = selector.querySelector(".dd-field-dropdown");
                    if (dd) dd.style.display = "none";
                }
            });
        });
    });

    /* ============================================================
       PART 3: GENERIC CARD BLOCK LOGIC (init_card_block.js)
       ============================================================ */
    document.addEventListener("DOMContentLoaded", function () {

        /* Select by data-groupby ONLY */
        const cards = document.querySelectorAll(".card-block-wrap[data-groupby]");
        if (!cards.length) return;

        cards.forEach(initCardBlock);

        function initCardBlock(card) {
            // OLD: const API_ADS = "https://qure-mock-api.vercel.app/api/ads";
            // NEW: Use shared fetchRawAdsCache()

            // Configuration
            let groupby = card.dataset.groupby;
            let fieldsParam = card.dataset.fields; // Optional custom columns
            const defaultMetric = card.dataset.defaultMetric || "adsCount";

            const tableWrapper = card.querySelector(".table-render");
            const canvas = card.querySelector("canvas");

            /* ---- Webflow Metric Dropdown ---- */
            const metricDropdown = card.querySelector(".chart-metric-dd-select");
            const metricList = metricDropdown?.querySelector(".filter-dropdown-list-inner");
            const metricSelectedLabel = metricDropdown?.querySelector(".chart-metric-dd-selected");

            const platformSelect = card.querySelector(".platform-select");
            const dateSelect = card.querySelector(".date-select");

            let columns = [];
            let tableData = [];
            let tableView = [];
            let selectedKeys = new Set();
            let currentMetric = defaultMetric;

            let chart = null;

            /* Filters */
            if (platformSelect) platformSelect.addEventListener("change", () => loadData());
            if (dateSelect) dateSelect.addEventListener("change", () => loadData());

            loadData();

            async function loadData() {
                console.log(`[CardBlock] Loading data for groupby=${groupby}...`);

                try {
                    // 1. Fetch Raw Ads Using Shared Function
                    const ads = await fetchRawAdsCache();

                    // 2. Prepare Filters
                    const filters = {};
                    if (platformSelect?.value) filters.platform = platformSelect.value;
                    if (dateSelect?.value) {
                        const end = new Date();
                        const start = new Date();
                        start.setDate(end.getDate() - Number(dateSelect.value));
                        filters.start = start.toISOString();
                        filters.end = end.toISOString();
                    }

                    // 3. Process Locally (Using Shared Utils)
                    const processedRows = processAds(ads, {
                        groupBy: groupby,
                        filters: filters
                    });

                    // 4. Determine Columns
                    let defaultCols = ["name", "adsCount"];
                    if (processedRows.length > 0) {
                        const firstRow = processedRows[0];
                        const dynamicKeys = Object.keys(firstRow).filter(k =>
                            !["name", "adsCount", "timeseries", "rawAds"].includes(k)
                        );
                        defaultCols.push(...dynamicKeys);
                    } else {
                        defaultCols.push("spend", "revenue", "roas", "ctr", "cpc");
                    }

                    if (fieldsParam) {
                        defaultCols = ["name", ...fieldsParam.split(",").map(s => s.trim())];
                    }

                    columns = defaultCols;
                    tableData = processedRows;
                    tableView = [...tableData];

                    if (tableData.length === 0) {
                        console.warn("[CardBlock] No data returned for this card");
                    }

                    // Default: All rows selected
                    selectedKeys = new Set(tableData.map(r => r.name));

                    buildMetricDropdown();
                    renderTable(columns, tableView);
                    updateChart();

                } catch (err) {
                    console.error("[CardBlock] Error:", err);
                }
            }

            /* =========================================================================
                METRIC DROPDOWN
            ========================================================================= */
            function buildMetricDropdown() {
                if (!metricList) return;
                metricList.innerHTML = "";

                const metrics = columns.filter(c => c !== "name");

                metrics.forEach(m => {
                    const item = document.createElement("div");
                    item.className = "filter-dropdown-item";

                    const text = document.createElement("div");
                    text.className = "dropdown-item-text";
                    text.textContent = pretty(m);

                    item.appendChild(text);
                    metricList.appendChild(item);

                    item.addEventListener("click", () => {
                        currentMetric = m;
                        if (metricSelectedLabel) metricSelectedLabel.textContent = pretty(m);
                        updateChart();
                    });
                });

                if (metricSelectedLabel)
                    metricSelectedLabel.textContent = pretty(currentMetric);
            }

            /* =========================================================================
                TABLE RENDER + SORT + SELECT ROWS
            ========================================================================= */
            let sortState = { col: null, dir: null };

            function renderTable(cols, rows) {
                if (!tableWrapper) return;

                let html = `
        <div class="adv-channel-table-wrapper">
          <table class="adv-channel-table">
            <thead><tr>
              <th></th>
              ${cols.map(c => `<th data-col="${c}" class="sortable">${pretty(c)}</th>`).join("")}
            </tr></thead>
            <tbody>
      `;

                rows.forEach(row => {
                    html += `
          <tr data-key="${row.name}">
            <td><input type="checkbox" class="row-check" data-key="${row.name}" ${selectedKeys.has(row.name) ? "checked" : ""}></td>
            ${cols.map(c => `<td>${format(row[c])}</td>`).join("")}
          </tr>
        `;
                });

                html += `</tbody></table></div>`;
                tableWrapper.innerHTML = html;

                /* Checkbox handling */
                tableWrapper.querySelectorAll(".row-check").forEach(cb => {
                    cb.addEventListener("change", () => {
                        const key = cb.dataset.key;
                        if (cb.checked) selectedKeys.add(key);
                        else selectedKeys.delete(key);
                        updateChart();
                    });
                });

                /* Column sorting */
                tableWrapper.querySelectorAll("th.sortable").forEach(th => {
                    th.addEventListener("click", () => sortColumn(th.dataset.col));
                });
            }

            function sortColumn(col) {
                if (sortState.col !== col) {
                    sortState = { col, dir: "asc" };
                } else {
                    sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
                }
                sortRows(tableView, col, sortState.dir);
                renderTable(columns, tableView);
                updateChart();
            }

            /* =========================================================================
                CHART — MULTILINE TIMESERIES WITH UNION X-AXIS
            ========================================================================= */
            function updateChart() {
                if (!canvas) return;
                if (chart) chart.destroy();

                const metric = currentMetric;

                // 1. Union of all dates
                const dateSet = new Set();
                tableData.forEach(row => {
                    if (selectedKeys.has(row.name) && Array.isArray(row.timeseries)) {
                        row.timeseries.forEach(ts => dateSet.add(ts.date));
                    }
                });
                const labels = [...dateSet].sort((a, b) => a.localeCompare(b));

                // 2. Build Datasets
                const datasets = [...selectedKeys].map(name => {
                    const row = tableData.find(r => r.name === name);
                    if (!row?.timeseries) return null;

                    const map = {};
                    row.timeseries.forEach(ts => map[ts.date] = ts[metric] ?? 0);

                    // Map to union X-axis, filling missing days with 0
                    const series = labels.map(date => map[date] ?? 0);

                    return {
                        label: `${name} - ${pretty(metric)}`,
                        data: series,
                        borderWidth: 2,
                        tension: 0.3,
                        fill: false
                    };
                }).filter(Boolean);

                // 3. Render
                chart = new Chart(canvas, {
                    type: "line",
                    data: { labels, datasets },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: "index", intersect: false }
                    }
                });

                // Force full size
                canvas.removeAttribute("width");
                canvas.removeAttribute("height");
                canvas.style.width = "100%";
                canvas.style.height = "100%";
            }
        }
    });

})();
