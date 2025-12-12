export default function handler(req, res) {
  const code = `
/* ============================================================
   UNIVERSAL DRILLDOWN MODULE FOR WEBFLOW
   Cleanest version — no legacy render code
   Supports: dynamic table, sorting, drilldown levels
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
   SEARCH BAR (LEVEL-BASED)
   ============================================================ */

function initSearch() {
  if (!searchInput || !searchDropdown) return;

  searchInput.addEventListener("input", (e) => {
    const term = e.target.value.trim().toLowerCase();
    if (!term) {
      hideSearchDropdown();
      return;
    }
    const suggestions = buildSuggestions(term);
    renderSearchDropdown(suggestions);
  });

  document.addEventListener("click", (evt) => {
    if (!card.contains(evt.target)) {
      hideSearchDropdown();
    }
  });
}

function buildSuggestions(term) {
  const data = table?.data ?? { columns: [], rows: [] };
  const cols = data.columns ?? [];
  const rows = data.rows ?? [];
  if (!cols.length || !rows.length) return [];

  const nameKey = cols[0]; 
  return rows
    .filter(row => String(row[nameKey] ?? "").toLowerCase().includes(term))
    .slice(0, 10)
    .map(row => ({
      value: row[nameKey],
      type: state.level
    }));
}

function renderSearchDropdown(list) {
  if (!list.length) {
    searchDropdown.innerHTML = '<div class="dd-search-item">No results</div>';
    searchDropdown.classList.remove("is-hidden");
    return;
  }

  searchDropdown.innerHTML = list.map(ifunction (item) {
  return '<div class="dd-search-item" data-value="' + item.value + '">' +
           '<strong>' + item.type + '</strong>&nbsp;' + item.value +
         '</div>';
}).join(""); }

  searchDropdown.classList.remove("is-hidden");

  searchDropdown.querySelectorAll(".dd-search-item").forEach(el => {
    el.addEventListener("click", () => {
      handleSearchSelect(el.dataset.value);
    });
  });
}

function hideSearchDropdown() {
  if (!searchDropdown) return;
  searchDropdown.classList.add("is-hidden");
  searchDropdown.innerHTML = "";
}

function handleSearchSelect(value) {
  // Clear input & dropdown
  searchInput.value = "";
  hideSearchDropdown();

  if (state.level === "product") {
    state.product = value;
    state.filters = [{ type: "product", value }];
    state.level = "usecase";
  } else if (state.level === "usecase") {
    state.usecase = value;
    const hasProductChip = state.filters.some(f => f.type === "product");
    if (!hasProductChip && state.product) {
      state.filters.unshift({ type: "product", value: state.product });
    }
    const hasUsecaseChip = state.filters.some(f => f.type === "usecase" && f.value === value);
    if (!hasUsecaseChip) {
      state.filters.push({ type: "usecase", value });
    }
    state.level = "angle";
  } else if (state.level === "angle") {
  
    const hasAngleChip = state.filters.some(f => f.type === "angle" && f.value === value);
    if (!hasAngleChip) {
      state.filters.push({ type: "angle", value });
    }

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
    state.product = null;
    state.usecase = null;
    state.filters.forEach(f => {
      if (f.type === "product") state.product = f.value;
      if (f.type === "usecase") state.usecase = f.value;
    });
  }

  /* ============================================================
     UNIVERSAL FETCHER
     ============================================================ */
  function buildApiUrl() {
    if (state.level === "product") return API_BASE + "/products";
    if (state.level === "usecase") {
      let url = API_BASE + "/usecases";
      if (state.product) url += "?product=" + encodeURIComponent(state.product);
      return url;
    }
    if (state.level === "angle") {
      const params = [];
      if (state.product) params.push("product=" + encodeURIComponent(state.product));
      if (state.usecase) params.push("usecase=" + encodeURIComponent(state.usecase));
      return API_BASE + "/angles" + (params.length ? "?" + params.join("&") : "");
    }
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
        state.product = null;
        state.usecase = null;
        state.filters = [];
        loadLevel();
      });
    });
  }

  /* ============================================================
     INIT UNIVERSAL TABLE
     ============================================================ */
  const table = new UniversalTable(wrapper, (value) => {
    if (state.level === "product") {
      state.product = value;
      state.filters = [{ type: "product", value }];
      state.level = "usecase";
    } else if (state.level === "usecase") {
      state.usecase = value;
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
