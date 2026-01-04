export default function handler(req, res) {
  const initialAngle = req.query.angle || null;
  const initialPlatform = req.query.platform || null;

  const code = `
  document.addEventListener("DOMContentLoaded", () => {
    const card = document.querySelector(".card-block-wrap.product-combination-card");
    if (!card) return;

    // --- Elements (match your Webflow structure)
    const tabButtons = card.querySelectorAll(".drilldown-tab-button");
    const searchInput = card.querySelector(".dd-search-input");
    const dropdown = card.querySelector(".dd-search-dropdown");
    const dropdownItemTemplate = card.querySelector(".dd-search-item");
    const chipsContainer = card.querySelector(".dd-chips-container");
    const tableRender = card.querySelector(".table-render");

    if (!tableRender) return;

    // Hide template item if exists
    if (dropdownItemTemplate) dropdownItemTemplate.style.display = "none";

    const API_DRILLDOWN = "https://qure-mock-api.vercel.app/api/drilldown-data";

    const state = {
      level: "product",      // product | usecase | angle
      query: "",
      product: null,
      usecase: null,
      angle: ${JSON.stringify(initialAngle)}, // Initialize angle from query
      platform: ${JSON.stringify(initialPlatform)}, // Initialize platform from query
      lastRows: [],
      debounceTimer: null,
      suggestionTimer: null,
    };

    // -------------------------------
    // Utils
    // -------------------------------
    const escapeHtml = (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const setDropdownOpen = (open) => {
      if (!dropdown) return;
      dropdown.style.display = open ? "block" : "none";
    };

    const prettyDate = (iso) => {
      const s = String(iso ?? "");
      return s.length >= 10 ? s.slice(0, 10) : s;
    };

    function buildUrl(overrides = {}) {
      const params = new URLSearchParams();
      const lvl = overrides.level ?? state.level;
      const q = overrides.query ?? state.query;

      params.set("level", lvl);
      if (q) params.set("query", q);

      const product = overrides.product ?? state.product;
      const usecase = overrides.usecase ?? state.usecase;
      const angle = overrides.angle ?? state.angle; // Add angle to URL params

      if (product) params.set("product", product);
      if (usecase) params.set("usecase", usecase);
      if (angle) params.set("angle", angle); // Add angle to URL params

      return \`\${API_DRILLDOWN}?\${params.toString()}\`;
    }

    async function fetchJson(url) {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      return res.json().catch(() => null);
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

          // NEW LOGIC: do NOT reset search, keep global filter
          state.level = lvl;

          // If user goes to product tab, keep deeper filters but view at product level
          // (optional behavior: you can clear deeper filters when switching up, but requirement says keep filtered universe)
          updateTabs();
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
            state.usecase = null; // clear deeper
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

      // Minimal table HTML
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
          if (c === "start_date") v = prettyDate(v);
          html += "<td>" + escapeHtml(v ?? "") + "</td>";
        });
        html += "</tr>";
      });

      html += "</tbody></table></div>";
      tableRender.innerHTML = html;

      // Row click = drill down (product -> usecase -> angle)
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
            // angle level: keep as filter? (optional)
            // You can store angle if later want ads list
            state.angle = name;
          }

          updateTabs();
          renderChips();
          loadTable();
        });
      });
    }

    // -------------------------------
    // Suggestions (dropdown)
    // Suggestions show group names for CURRENT level under current global filter.
    // This matches your new logic: typing angle text in product tab shows products that match.
    // -------------------------------
    async function loadSuggestions() {
      if (!dropdown || !searchInput) return;

      const q = String(searchInput.value ?? "").trim();
      if (!q) {
        setDropdownOpen(false);
        dropdown.innerHTML = "";
        if (dropdownItemTemplate) dropdown.appendChild(dropdownItemTemplate);
        return;
      }

      const url = buildUrl({ query: q, level: state.level });
      const json = await fetchJson(url);
      const rows = Array.isArray(json?.rows) ? json.rows : [];

      // Build dropdown items from row.name
      dropdown.innerHTML = "";
      if (dropdownItemTemplate) dropdown.appendChild(dropdownItemTemplate);

      rows.slice(0, 10).forEach((r) => {
        const item = dropdownItemTemplate
          ? dropdownItemTemplate.cloneNode(true)
          : document.createElement("div");

        item.style.display = "block";
        item.classList.add("is-suggestion");
        const levelLabel = state.level.charAt(0).toUpperCase() + state.level.slice(1);
        item.textContent = "[" + levelLabel + "] " + (r?.name ?? "");
        item.dataset.value = r?.name ?? "";

        item.addEventListener("click", () => {
          // Keep query as typed; selecting suggestion can set query = suggestion (optional)
          // Here: set search to clicked value for convenience
          state.query = String(item.dataset.value ?? "");
          if (searchInput) searchInput.value = state.query;

          setDropdownOpen(false);
          renderChips();
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

        // suggestions faster
        state.suggestionTimer = setTimeout(loadSuggestions, 250);

        // load table after user stops typing
        state.debounceTimer = setTimeout(() => {
          state.query = String(searchInput.value ?? "").trim();
          renderChips();
          loadTable();
        }, 450);
      });

      searchInput.addEventListener("focus", () => {
        if (searchInput.value) loadSuggestions();
      });

      document.addEventListener("click", (e) => {
        if (!dropdown) return;
        const inside = card.contains(e.target);
        if (!inside) setDropdownOpen(false);
      });
    }

    // -------------------------------
    // Load table from backend drilldown endpoint
    // -------------------------------
    async function loadTable() {
      renderChips();

      const url = buildUrl();
      const json = await fetchJson(url);

      const columns = Array.isArray(json?.columns) ? json.columns : ["name", "adsCount"];
      const rows = Array.isArray(json?.rows) ? json.rows : [];

      state.lastRows = rows;
      renderTable(columns, rows);
    }

    // -------------------------------
    // Init
    // -------------------------------
    // Detect initial tab
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
