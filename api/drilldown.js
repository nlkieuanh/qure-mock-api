export default function handler(req, res) {
  const code = `
/* ============================================================
   UNIVERSAL DRILLDOWN MODULE FOR WEBFLOW
   Cleanest version — no legacy render code
   Supports: dynamic table, sorting, drilldown levels, global search
   ============================================================ */

document.addEventListener("DOMContentLoaded", function () {

  const card = document.querySelector(".card-block-wrap.product-combination-card");
  if (!card) return;

  const wrapper = card.querySelector(".adv-channel-table-wrapper");
  const chipContainer = card.querySelector(".dd-chips-container");
  const searchInput = card.querySelector(".dd-search-input");
  const searchDropdown = card.querySelector(".dd-search-dropdown");


  const API_BASE = "https://qure-mock-api.vercel.app/api";

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

      let html = '<table class="adv-channel-table"><thead><tr>';
      columns.forEach(col => {
        html += \`<th data-col="\${col}">\${this.pretty(col)}</th>\`;
      });
      html += '</tr></thead><tbody>';

      rows.forEach(row => {
        html += \`<tr class="dd-row" data-value="\${row[columns[0]]}">\`;
        columns.forEach(col => {
          html += \`<td>\${this.format(row[col])}</td>\`;
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

      this.data.rows.sort((a, b) => {
        const A = a[key] ?? 0;
        const B = b[key] ?? 0;
        return dir === "asc" ? A - B : B - A;
      });
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

    pretty(key) {
      return key.replace(/([A-Z])/g, " $1").replace(/^\w/, c => c.toUpperCase());
    }

    format(v) {
      if (typeof v === "number") return v.toLocaleString();
      return v ?? "";
    }
  }

  /* ============================================================
     DRILLDOWN STATE
     ============================================================ */
  const state = {
    level: "product",
    product: null,
    usecase: null,
    filters: []
  };
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
      
      // Debounce to avoid flooding API
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
    // Ideally we have a dedicated search endpoint, but we can reuse /api/ads
    // or fetch a lightweight list. For now, fetch raw ads to find matches.
    try {
      const res = await fetch(API_BASE + "/ads");
      const ads = await res.json();
      
      const suggestions = buildGlobalSuggestions(ads, term);
      renderSearchDropdown(suggestions);
    } catch (err) {
      console.error("Search error", err);
    }
  }

  function buildGlobalSuggestions(ads, term) {
    const products = new Set();
    const usecases = new Set();
    const angles = new Set();

    ads.forEach(ad => {
      // Products
      if (String(ad.f_products || "").toLowerCase().includes(term)) {
        products.add(ad.f_products);
      }
      // Use Cases
      const ucs = Array.isArray(ad.f_use_case) ? ad.f_use_case : [ad.f_use_case];
      ucs.forEach(u => {
        if (String(u || "").toLowerCase().includes(term)) usecases.add(u);
      });
      // Angles
      const ang = Array.isArray(ad.f_angles) ? ad.f_angles : [ad.f_angles];
      ang.forEach(a => {
        if (String(a || "").toLowerCase().includes(term)) angles.add(a);
      });
    });

    const list = [];
    products.forEach(v => list.push({ value: v, type: "product" }));
    usecases.forEach(v => list.push({ value: v, type: "usecase" }));
    angles.forEach(v => list.push({ value: v, type: "angle" }));

    return list.slice(0, 15); // limit results
  }

  function renderSearchDropdown(list) {
    if (!list.length) {
      searchDropdown.innerHTML = '<div class="dd-search-item">No results</div>';
      searchDropdown.classList.remove("is-hidden");
      return;
    }

    searchDropdown.innerHTML = list.map(function(item) {
      return '<div class="dd-search-item" data-value="' + item.value + '" data-type="' + item.type + '">' +
               '<strong>' + item.type + '</strong>&nbsp;' + item.value +
             '</div>';
    }).join("");

    searchDropdown.classList.remove("is-hidden");

    searchDropdown.querySelectorAll(".dd-search-item").forEach(function(el) {
      el.addEventListener("click", function() {
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
    // Clear input & dropdown
    searchInput.value = "";
    hideSearchDropdown();

    // Logic: Add filter regardless of current tab
    // Check if filter exists
    const exists = state.filters.some(f => f.type === type && f.value === value);
    if (!exists) {
      state.filters.push({ type, value });
    }

    syncStateFromChips(); // Update specific vars like state.product if needed
    loadLevel(); // Reload current table with new filters
  }

  /* ============================================================
     CHIP UI
     ============================================================ */
  function renderChips() {
    chipContainer.innerHTML = "";
    state.filters.forEach((f, idx) => {
      const chip = document.createElement("div");
      chip.className = "dd-chip";
      chip.innerHTML = \`
        <span class="dd-chip-label">\${f.type}: \${f.value}</span>
        <div class="dd-chip-remove">✕</div>
      \`;
      chip.querySelector(".dd-chip-remove").addEventListener("click", () => {
        state.filters.splice(idx, 1);
        syncStateFromChips();
        loadLevel();
      });
      chipContainer.appendChild(chip);
    });
  }

  function syncStateFromChips() {
    // We keep state.product / state.usecase primarily for row-click drilldown logic
    // But filters are the source of truth for API calls now.
    
    // Optional: if we want to "reset" level if product is removed? 
    // For now, keep it simple.
  }

  /* ============================================================
     UNIVERSAL FETCHER
     ============================================================ */
  function buildApiUrl() {
    let endpoint = "";
    if (state.level === "product") endpoint = "/products";
    else if (state.level === "usecase") endpoint = "/usecases";
    else if (state.level === "angle") endpoint = "/angles";

    const params = [];
    state.filters.forEach(f => {
      params.push(f.type + "=" + encodeURIComponent(f.value));
    });

    return API_BASE + endpoint + (params.length ? "?" + params.join("&") : "");
  }

  async function loadLevel() {
    const url = buildApiUrl();
    const res = await fetch(url);
    const json = await res.json();
    table.setData(json);
    updateTabs();
    renderChips();
  }

  /* ============================================================
     TAB HANDLERS
     ============================================================ */
  function updateTabs() {
    const tabs = card.querySelectorAll(".drilldown-tab-button");
    tabs.forEach(btn => {
      btn.classList.toggle("is-current", btn.dataset.tab === state.level);
    });
  }

  function attachTabEvents() {
    const tabs = card.querySelectorAll(".drilldown-tab-button");
    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        state.level = btn.dataset.tab;
        // Don't clear filters on tab switch per user request/implicit logic of "cross-filtering"
        // But maybe clear specific drilldown state variables if needed
        loadLevel();
      });
    });
  }

  /* ============================================================
     INIT UNIVERSAL TABLE
     ============================================================ */
  const table = new UniversalTable(wrapper, (value) => {
    // When clicking a row, we treat it as adding a filter and going deeper
    if (state.level === "product") {
      state.filters.push({ type: "product", value });
      state.level = "usecase";
    } else if (state.level === "usecase") {
      state.filters.push({ type: "usecase", value });
      state.level = "angle";
    }
    loadLevel();
  });

  /* ============================================================
     INIT
     ============================================================ */
  attachTabEvents();
  initSearch();
  loadLevel();
  renderChips();

});
  `;

  res.setHeader("Content-Type", "text/javascript");
  res.status(200).send(code);
}
