export default function handler(req, res) {
  const code = `
  document.addEventListener("DOMContentLoaded", () => {
    const card = document.querySelector(".card-block-wrap.product-combination-card");
    if (!card) return;

    // --- Elements
    const tabButtons = card.querySelectorAll(".drilldown-tab-button");
    const searchInput = card.querySelector(".dd-search-input");
    const dropdown = card.querySelector(".dd-search-dropdown");
    const dropdownItemTemplate = card.querySelector(".dd-search-item");
    const chipsContainer = card.querySelector(".dd-chips-container");
    const tableRender = card.querySelector(".table-render");

    if (!tableRender) return;

    // Hide template
    if (dropdownItemTemplate) dropdownItemTemplate.style.display = "none";

    // NEW: Pointing to the raw ads endpoint
    const API_ADS = "https://qure-mock-api.vercel.app/api/ads";

    const state = {
      level: "product",      // product | usecase | angle
      query: "",
      product: null,
      usecase: null,
      angle: null,
      
      // Cache raw ads here to avoid refetching heavily
      rawAds: [],
      
      debounceTimer: null,
      suggestionTimer: null,
    };

    // -------------------------------
    // Utils
    // -------------------------------
    const escapeHtml = (s) =>
      String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

    const setDropdownOpen = (open) => {
      if (!dropdown) return;
      dropdown.style.display = open ? "block" : "none";
    };

    const prettyDate = (iso) => {
      const s = String(iso ?? "");
      return s.length >= 10 ? s.slice(0, 10) : s;
    };

    async function fetchJson(url) {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      return res.json().catch(() => null);
    }
    
    // -------------------------------
    // LOGIC: Aggregation (Moved from server)
    // -------------------------------
    function bump(map, value) {
      const v = String(value ?? "Unknown").trim() || "Unknown";
      map.set(v, (map.get(v) || 0) + 1);
    }

    function formatTop(map, topN = 5) {
      const arr = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
      const top = arr.slice(0, topN).map(([k, c]) => \`\${k} (\${c})\`);
      const rest = arr.length > topN ? \` + \${arr.length - topN} more\` : "";
      return top.join(", ") + rest;
    }

    function processData(ads) {
      // 1. Filter
      const filtered = ads.filter(ad => {
        // Strict filters
        if (state.product && String(ad?.f_products ?? "") !== state.product) return false;
        if (state.usecase && String(ad?.f_use_case ?? "") !== state.usecase) return false;
        // Angle is not a strict filter for the table unless you want it to be. 
        // For standard drilldown: Product -> Usecase -> Angle, we stop at Angle view.
        return true;
      });

      // 2. Group
      const groupField = 
        state.level === "product" ? "f_products" :
        state.level === "usecase" ? "f_use_case" :
        "f_angles";

      const groups = new Map();

      for (const ad of filtered) {
        const name = String(ad?.[groupField] ?? "Unknown").trim() || "Unknown";
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

        bump(g.usecasesMap, ad?.f_use_case);
        bump(g.anglesMap, ad?.f_angles);
        bump(g.offersMap, ad?.f_offers);
        bump(g.promotionsMap, ad?.f_promotion);

        const date = String(ad?.start_date ?? "").slice(0, 10);
        if (date) g.tsMap.set(date, (g.tsMap.get(date) || 0) + 1);
      }

      // 3. Format Rows
      const rows = Array.from(groups.values()).map(g => ({
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
      
      // Sort rows by adsCount desc
      rows.sort((a, b) => b.adsCount - a.adsCount);

      return {
        columns: ["name", "adsCount", "usecases", "angles", "offers", "promotions"],
        rows
      };
    }

    // -------------------------------
    // Data Loading
    // -------------------------------
    async function fetchRawAds(query) {
      // Build URL to /api/ads
      // We pass the search query to the API so it filters broad matches vs DB
      const u = new URL(API_ADS);
      if (query) u.searchParams.set("query", query);
      // We do NOT pass product/usecase params to /api/ads because that endpoint returns a flat list 
      // matching the *search text*. We do the structural filtering in JS (processData).
      
      const json = await fetchJson(u.toString());
      return Array.isArray(json) ? json : [];
    }

    async function loadTable() {
      renderChips();

      // OPTIMIZATION: Only fetch if query changed or rawAds is empty? 
      // For now, simple approach: fetch fresh on every major action ensures consistency
      // But to avoid flickering on tab switch, we could check state. 
      // Let's fetch fresh to be safe.
      
      const ads = await fetchRawAds(state.query);
      state.rawAds = ads; // Store for other potential uses
      
      const { columns, rows } = processData(ads);
      renderTable(columns, rows);
    }

    // -------------------------------
    // UI: Tabs
    // -------------------------------
    function updateTabs() {
      tabButtons.forEach((btn) => {
        btn.classList.toggle("is-current", btn.dataset.tab === state.level);
      });
    }

    function attachTabHandlers() {
      tabButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const lvl = btn.dataset.tab;
          if (!lvl) return;
          state.level = lvl;
          updateTabs();
          
          // Re-process data without re-fetching if we want to be fast, 
          // but fetching ensures we don't have stale cached data if logic changes.
          // Let's re-run load so it feels standard.
          loadTable();
        });
      });
    }

    // -------------------------------
    // UI: Chips
    // -------------------------------
    function renderChips() {
      if (!chipsContainer) return;
      chipsContainer.innerHTML = "";

      const chips = [];
      if (state.query) chips.push({ type: "Search", value: state.query, key: "query" });
      if (state.product) chips.push({ type: "Product", value: state.product, key: "product" });
      if (state.usecase) chips.push({ type: "Usecase", value: state.usecase, key: "usecase" });

      chips.forEach((c) => {
        const chip = document.createElement("div");
        chip.className = "dd-chip";
        chip.innerHTML = \`
          <span class="dd-chip-label">\${escapeHtml(c.type)}: \${escapeHtml(c.value)}</span>
          <div class="dd-chip-remove" data-key="\${escapeHtml(c.key)}">✕</div>
        \`;
        chipsContainer.appendChild(chip);
      });

      chipsContainer.querySelectorAll(".dd-chip-remove").forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = btn.dataset.key;
          if (key === "query") {
            state.query = "";
            if (searchInput) searchInput.value = "";
          }
          if (key === "product") {
            state.product = null;
            state.usecase = null;
          }
          if (key === "usecase") {
            state.usecase = null;
          }
          loadTable();
        });
      });
    }

    // -------------------------------
    // Render table
    // -------------------------------
    function renderTable(columns, rows) {
      if (!tableRender) return;

      const cols = Array.isArray(columns) ? columns : [];
      const data = Array.isArray(rows) ? rows : [];

      let html = \`
        <div class="adv-channel-table-wrapper">
          <table class="adv-channel-table">
            <thead>
              <tr>\${cols.map(c => \`<th>\${escapeHtml(c)}</th>\`).join("")}</tr>
            </thead>
            <tbody>
      \`;

      data.forEach((r) => {
        html += "<tr data-name=\\"" + escapeHtml(r?.name ?? "") + "\\">";
        cols.forEach((c) => {
          let v = r?.[c];
          if (c === "timeseries") {
             // Basic sparkline placeholder or just length
             v = (Array.isArray(v) ? v.length : 0) + " days active"; 
          }
          html += "<td>" + escapeHtml(v ?? "") + "</td>";
        });
        html += "</tr>";
      });

      html += "</tbody></table></div>";
      tableRender.innerHTML = html;

      // Drilldown logic
      const trs = tableRender.querySelectorAll("tbody tr");
      trs.forEach((tr) => {
        tr.addEventListener("click", () => {
          const name = tr.getAttribute("data-name") || "";
          if (!name) return;

          if (state.level === "product") {
            state.product = name;
            state.usecase = null;
            state.level = "usecase";
          } else if (state.level === "usecase") {
            state.usecase = name;
            state.level = "angle";
          } else {
             // End of drilldown
             state.angle = name;
          }
          updateTabs();
          loadTable();
        });
      });
    }

    // -------------------------------
    // Suggestions
    // -------------------------------
    async function loadSuggestions() {
      if (!dropdown || !searchInput) return;
      const q = String(searchInput.value ?? "").trim();
      if (!q) {
        setDropdownOpen(false);
        return;
      }
      
      // For suggestions, we can fetch from API or just use local filtering if we already had data.
      // Simpler to just re-fetch light or use cached. 
      // Ideally, the API would have a suggestion endpoint, but we can reuse /api/ads with query.
      
      const ads = await fetchRawAds(q);
      // Unique names relevant to current level? Or just unique products?
      // User request implies "search" -> finds products.
      // Let's suggest unique 'names' based on current level (like existing logic).
      
      const groupField = 
        state.level === "product" ? "f_products" :
        state.level === "usecase" ? "f_use_case" :
        "f_angles";

      const uniqueNames = new Set();
      ads.forEach(ad => {
         const val = ad?.[groupField];
         if (val) uniqueNames.add(val);
      });
      
      const suggestions = Array.from(uniqueNames).slice(0, 10);

      dropdown.innerHTML = "";
      if (dropdownItemTemplate) dropdown.appendChild(dropdownItemTemplate);

      suggestions.forEach((name) => {
        const item = dropdownItemTemplate
          ? dropdownItemTemplate.cloneNode(true)
          : document.createElement("div");

        item.style.display = "block";
        item.classList.add("is-suggestion");
        item.textContent = name;
        item.dataset.value = name;

        item.addEventListener("click", () => {
          state.query = name; 
          if (searchInput) searchInput.value = state.query;
          setDropdownOpen(false);
          loadTable();
        });
        dropdown.appendChild(item);
      });

      setDropdownOpen(true);
    }

    function attachSearchHandlers() {
      if (!searchInput) return;

      searchInput.addEventListener("input", () => {
        clearTimeout(state.debounceTimer);
        clearTimeout(state.suggestionTimer);

        state.suggestionTimer = setTimeout(loadSuggestions, 250);
        state.debounceTimer = setTimeout(() => {
          state.query = String(searchInput.value ?? "").trim();
          loadTable();
        }, 450);
      });

      searchInput.addEventListener("focus", () => {
        if (searchInput.value) loadSuggestions();
      });

      document.addEventListener("click", (e) => {
        if (!dropdown) return;
        if (!card.contains(e.target)) setDropdownOpen(false);
      });
    }

    // -------------------------------
    // Init
    // -------------------------------
    const current = Array.from(tabButtons).find((b) => b.classList.contains("is-current"));
    if (current?.dataset?.tab) state.level = current.dataset.tab;

    updateTabs();
    attachTabHandlers();
    attachSearchHandlers();
    loadTable();
  });
  `;

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(code);
}
