
/* ============================================================
   UNIVERSAL DRILLDOWN MODULE FOR WEBFLOW
   Refactored for Dynamic Tabs & Universal API
   ============================================================ */

document.addEventListener("DOMContentLoaded", function () {

  const card = document.querySelector(".card-block-wrap.product-combination-card");
  if (!card) return;

  const wrapper = card.querySelector(".adv-channel-table-wrapper");
  const chipContainer = card.querySelector(".dd-chips-container");
  const searchInput = card.querySelector(".dd-search-input");
  const searchDropdown = card.querySelector(".dd-search-dropdown");
  const tabContainer = card.querySelector(".drilldown-tab-filter-wrap");

  // API Configuration
  const API_BASE = "https://qure-mock-api.vercel.app/api";

  // State
  const state = {
    // Current active tab ID (matches API field key)
    currentTabId: "f_products",

    // Dynamic Tabs Configuration
    tabs: [
      { id: "f_products", label: "Product" },
      { id: "f_use_case", label: "Use Case" },
      { id: "f_angles", label: "Angle" }
    ],

    // Active filters
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
        html += `<th data-col="${col}">${this.pretty(col)}</th>`;
      });
      html += '</tr></thead><tbody>';

      // 2. Build Rows
      rows.forEach(row => {
        const keyVal = row[columns[0]];
        html += `<tr class="dd-row" data-value="${keyVal}">`;
        columns.forEach(col => {
          html += `<td>${this.format(row[col])}</td>`;
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
        if (typeof A === 'string') return dir === "asc" ? A.localeCompare(B) : B.localeCompare(A);
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
      const map = {
        "f_products": "Product",
        "f_use_case": "Use Case",
        "f_angles": "Angle",
        "adsCount": "Ads Count"
      };
      if (map[key]) return map[key];

      // Clean up f_insights.trigger_type -> Trigger Type
      const clean = key.split('.').pop();
      return clean.replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .replace(/^\w/, c => c.toUpperCase());
    }

    format(v) {
      if (typeof v === "number") return v.toLocaleString();
      return v ?? "";
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
      // Mock Search using raw ads
      const res2 = await fetch("https://qure-mock-api.vercel.app/api/ads");
      const ads = await res2.json();
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
      if (String(ad.f_products || "").toLowerCase().includes(term)) products.add(ad.f_products);
      const ucs = Array.isArray(ad.f_use_case) ? ad.f_use_case : [ad.f_use_case];
      ucs.forEach(u => { if (String(u || "").toLowerCase().includes(term)) usecases.add(u); });
      const ang = Array.isArray(ad.f_angles) ? ad.f_angles : [ad.f_angles];
      ang.forEach(a => { if (String(a || "").toLowerCase().includes(term)) angles.add(a); });
    });

    const list = [];
    products.forEach(v => list.push({ value: v, type: "f_products" }));
    usecases.forEach(v => list.push({ value: v, type: "f_use_case" }));
    angles.forEach(v => list.push({ value: v, type: "f_angles" }));

    return list.slice(0, 15);
  }

  function renderSearchDropdown(list) {
    if (!list.length) {
      searchDropdown.innerHTML = '<div class="dd-search-item">No results</div>';
      searchDropdown.classList.remove("is-hidden");
      return;
    }

    searchDropdown.innerHTML = list.map(item => {
      const label = item.type === "f_products" ? "Product" :
        item.type === "f_use_case" ? "Use Case" : "Angle";

      return `<div class="dd-search-item" data-value="${item.value}" data-type="${item.type}">
                <strong>${label}</strong>&nbsp;${item.value}
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
     FIELD SELECTOR (DYNAMIC ADD)
     ============================================================ */
  function renderFieldSelector() {
    if (!tabContainer) return;

    // Check if selector exists
    let selector = card.querySelector(".dd-field-selector");

    // If not exists, create it
    if (!selector) {
      selector = document.createElement("div");
      selector.className = "dd-field-selector";
      // Basic styling to make it look like a button
      selector.style.marginLeft = "10px";
      selector.style.display = "inline-block";
      selector.style.position = "relative";
      selector.style.verticalAlign = "middle";

      selector.innerHTML = `
         <div class="dd-add-btn" style="cursor:pointer; padding: 6px 14px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">+ View</div>
         <div class="dd-field-dropdown is-hidden" style="position: absolute; top: 120%; left: 0; background: white; border: 1px solid #ddd; z-index: 1000; min-width: 180px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-radius: 6px; overflow: hidden;">
         </div>
       `;

      // Append to tab container (or next to it, depending on layout)
      // TabContainer is flex, so appending works.
      tabContainer.appendChild(selector);

      const btn = selector.querySelector(".dd-add-btn");
      const dd = selector.querySelector(".dd-field-dropdown");

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        dd.classList.toggle("is-hidden");
        if (!dd.classList.contains("is-hidden")) {
          renderFieldOptions(dd);
        }
      });

      document.addEventListener("click", (e) => {
        if (!selector.contains(e.target)) dd.classList.add("is-hidden");
      });
    } else {
      // If it exists, ensure it is at the end of tabContainer
      tabContainer.appendChild(selector);
    }
  }

  function renderFieldOptions(container) {
    const availableFields = [
      { id: "f_insights.trigger_type", label: "Trigger Type" },
      { id: "f_insights.visual_style", label: "Visual Style" },
      { id: "f_insights.hook_type", label: "Hook Type" },
      { id: "platform", label: "Platform" },
      { id: "f_offers", label: "Offers" }
    ];

    // Filter out already active tabs
    const valid = availableFields.filter(f => !state.tabs.find(t => t.id === f.id));

    if (valid.length === 0) {
      container.innerHTML = "<div style='padding:12px; color:#999; font-size: 13px;'>No more fields available</div>";
      return;
    }

    container.innerHTML = valid.map(f => `
      <div class="dd-field-option text-block-7" data-id="${f.id}" data-label="${f.label}" style="padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background 0.2s;">
        ${f.label}
      </div>
    `).join("");

    container.querySelectorAll(".dd-field-option").forEach(opt => {
      opt.addEventListener("mouseover", () => opt.style.background = "#f9f9f9");
      opt.addEventListener("mouseout", () => opt.style.background = "transparent");

      opt.addEventListener("click", () => {
        handleAddTab(opt.dataset.id, opt.dataset.label);
      });
    });
  }

  function handleAddTab(id, label) {
    state.tabs.push({ id, label });
    state.currentTabId = id;

    renderTabs();
    loadLevel();

    const dd = card.querySelector(".dd-field-dropdown");
    if (dd) dd.classList.add("is-hidden");
  }

  /* ============================================================
     DYNAMIC TABS
     ============================================================ */
  function renderTabs() {
    if (!tabContainer) return;

    // Clear tabs but we need to preserve the selector if it was appended? 
    // Actually renderTabs rebuilds everything, including calling renderFieldSelector at the end.
    tabContainer.innerHTML = "";

    state.tabs.forEach((tab) => {
      const btn = document.createElement("a");
      btn.className = "drilldown-tab-button w-inline-block";
      if (tab.id === state.currentTabId) btn.classList.add("is-current");

      btn.innerHTML = `<div class="text-block-7">${tab.label}</div>`;

      btn.addEventListener("click", () => {
        state.currentTabId = tab.id;
        renderTabs();
        loadLevel();
      });

      tabContainer.appendChild(btn);
    });

    // Append the + button at the end
    renderFieldSelector();
  }


  /* ============================================================
     API & LOADING
     ============================================================ */
  function buildApiUrl() {
    const url = new URL("/api/data", API_BASE);

    // 1. Group By
    url.searchParams.set("groupby", state.currentTabId);

    // 2. Filters
    state.filters.forEach(f => {
      url.searchParams.append(f.type, f.value);
    });

    // 3. Dynamic Columns
    const relevantFields = state.tabs
      .map(t => t.id)
      .filter(id => id !== state.currentTabId);

    url.searchParams.set("fields", relevantFields.join(","));

    return url.toString();
  }

  async function loadLevel() {
    const url = buildApiUrl();
    try {
      const res = await fetch(url);
      const json = await res.json();
      table.setData(json);
      renderChips();
      renderTabs(); // Sync tab states

    } catch (err) {
      console.error("Load Error", err);
    }
  }


  /* ============================================================
     INIT
     ============================================================ */
  const table = new UniversalTable(wrapper, (value) => {
    // Row Click Handler -> Drill Down

    // Filter by current row
    state.filters.push({ type: state.currentTabId, value });

    // Switch to next tab
    const curIdx = state.tabs.findIndex(t => t.id === state.currentTabId);
    if (curIdx >= 0 && curIdx < state.tabs.length - 1) {
      state.currentTabId = state.tabs[curIdx + 1].id;
    }

    loadLevel();
  });

  // Start
  initSearch();
  renderTabs();
  loadLevel();

});
