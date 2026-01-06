export default function handler(req, res) {
  const code = `
/* ============================================================
   UNIVERSAL DRILLDOWN MODULE FOR WEBFLOW
   Refactored for Client-Side Aggregation (Using shared utils.js)
   ============================================================ */
import { resolveValue, processAds, pretty, format } from "../utils.js";

document.addEventListener("DOMContentLoaded", function () {

  const card = document.querySelector(".card-block-wrap.product-combination-card");
  if (!card) return;

  const wrapper = card.querySelector(".adv-channel-table-wrapper");
  const chipContainer = card.querySelector(".dd-chips-container");
  const searchInput = card.querySelector(".dd-search-input");
  const searchDropdown = card.querySelector(".dd-search-dropdown");
  const tabContainer = card.querySelector(".drilldown-tab-filter-wrap");

  // API Configuration
  const API_ADS = "https://qure-mock-api.vercel.app/api/ads";
  
  // State
  const state = {
    // Current active tab ID (matches API field key)
    currentTabId: "f_products", 
    
    // Dynamic Tabs Configuration
    tabs: [
      { id: "f_products", label: "Product" },
      { id: "f_use_case", label: "Use Case" },
      { id: "f_angles",   label: "Angle" }
    ],

    // Active filters
    filters: []
  };

  // Cache for raw ads to avoid repeated fetches
  let _rawAdsCache = null;

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
        // If this is the "name" column, use the current tab label
        if (col === "name" && state.tabs.find(t => t.id === state.currentTabId)) {
          headerText = state.tabs.find(t => t.id === state.currentTabId).label;
        }
        
        html += \`<th data-col="\${col}">\${headerText}</th>\`;
      });
      html += '</tr></thead><tbody>';

      // 2. Build Rows
      rows.forEach(row => {
        const keyVal = row["name"]; 
        html += \`<tr class="dd-row" data-value="\${keyVal}">\`;
        columns.forEach(col => {
          html += \`<td>\${format(row[col])}</td>\`;
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
      // Use cached ads if available, else fetch
      if (!_rawAdsCache) {
           const res = await fetch(API_ADS);
           _rawAdsCache = await res.json();
      }
      const suggestions = buildGlobalSuggestions(_rawAdsCache, term);
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
                // Use the key as type (so it maps back to the column label)
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
      return \`<div class="dd-search-item" data-value="\${item.value}" data-type="\${item.type}">
                <strong>\${label}</strong>: \${item.value}
              </div>\`;
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
      
      chip.innerHTML = \`
        <span class="dd-chip-label">\${niceType}: \${f.value}</span>
        <div class="dd-chip-remove">✕</div>
      \`;
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
      { id: "f_products",              label: "Product" },
      { id: "f_use_case",              label: "Use Case" },
      { id: "f_angles",                label: "Angle" },
      { id: "f_insights.trigger_type", label: "Trigger Type" },
      { id: "f_insights.visual_style", label: "Visual Style" },
      { id: "f_insights.hook_type",    label: "Hook Type" },
      { id: "platform",                label: "Platform" },
      { id: "f_offers",                label: "Offer" },
      { id: "f_insights.cta_type",     label: "CTA Type" }
    ];

    container.innerHTML = allFields.map(f => {
      const isChecked = state.tabs.some(t => t.id === f.id);
      return \`
        <div class="dd-add-field-item">
           <label class="dd-field-item-div" style="display: flex; align-items: center; cursor: pointer; margin:0; white-space: nowrap;">
              <input type="checkbox" class="dd-field-item-checkbox" data-id="\${f.id}" data-label="\${f.label}" \${isChecked ? "checked" : ""} style="margin-right: 8px;">
              <div class="dd-field-item-text" style="font-size: 14px;">\${f.label}</div>
           </label>
        </div>
      \`;
    }).join("");

    container.querySelectorAll(".dd-field-item-checkbox").forEach(chk => {
       chk.addEventListener("change", (e) => {
          handleToggleTab(e.target.dataset.id, e.target.dataset.label, e.target.checked);
       });
    });
  }
  
  /* ============================================================
     TOAST NOTIFICATION (Webflow Integration)
     ============================================================ */
  function showToast(message) {
      const toast = card.querySelector(".dd-warning-toast");
      if (toast) {
          // Use Webflow styled toast
          toast.textContent = message;
          toast.style.display = "flex"; // Or 'flex', depending on Webflow setup
          
          // Auto-hide after 3 seconds
          setTimeout(() => {
              toast.style.display = "none";
          }, 3000);
      } else {
          // Fallback to Native Alert
          alert(message);
      }
  }

  function handleToggleTab(id, label, isChecked) {
    if (isChecked) {
       // Guard: Max 5
       if (state.tabs.length >= 5) {
         showToast("Limit reached: Maximum 5 fields.");
         renderTabs(); // Sync UI back
         return;
       }
       
       if (!state.tabs.find(t => t.id === id)) {
         state.tabs.push({ id, label });
       }
    } else {
       // Guard: Min 1
       if (state.tabs.length <= 1) {
         showToast("Limit reached: Minimum 1 field.");
         renderTabs(); // Sync UI back
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

 
  /* ============================================================
     DYNAMIC TABS (DRAG & DROP)
     ============================================================ */
  function renderTabs() {
    if (!tabContainer) return;

    tabContainer.innerHTML = "";
    
    state.tabs.forEach((tab, index) => {
      const btn = document.createElement("a");
      btn.className = "drilldown-tab-button w-inline-block";
      if (tab.id === state.currentTabId) btn.classList.add("is-current");
      
      btn.innerHTML = \`<div class="text-block-7" style="pointer-events: none;">\${tab.label}</div>\`;
      
      btn.addEventListener("click", () => {
        state.currentTabId = tab.id;
        renderTabs(); 
        loadLevel();
      });

      // DRAG & DROP EVENTS
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


  /* ============================================================
     CLIENT SIDE LOADING & AGGREGATION
     ============================================================ */
  async function loadLevel() {
    if (!state.currentTabId) return;

    try {
      // 1. Fetch Raw Ads (if not cached)
      if (!_rawAdsCache) {
          console.log("[Drilldown] Fetching raw ads...");
          const res = await fetch(API_ADS);
          _rawAdsCache = await res.json();
      }

      // 3. Process Ads Locally (No extra columns needed)
      const rows = processAds(_rawAdsCache, {
          groupBy: state.currentTabId,
          filters: state.filters
          // columns: dynamicCols // REMOVED: No longer computing distributions
      });
      
      // 4. Determine Columns Dynamically based on Data
      // Goal: Name -> AdsCount -> Upstream Metrics
      let columns = ["name", "adsCount"];

      if (rows.length > 0) {
          const firstRow = rows[0];
          // Get Upstream Numeric Metrics (Now including calculated ratios like roas, ctr, cpc)
          const metricKeys = Object.keys(firstRow).filter(k => 
              typeof firstRow[k] === 'number' && 
              !["adsCount"].includes(k) 
          );
          
          columns.push(...metricKeys);
      } else {
          // Fallback if no data
          columns.push("spend", "revenue"); 
      }

      // REMOVED: columns.push(...dynamicCols);

      console.log(\`[Drilldown] Aggregated \${state.currentTabId}: \`, rows.length, "rows");
      
      // 5. Update Table
      table.setData({ columns, rows });

      renderChips();
      renderTabs(); // Sync UI
      
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

  // Global listener to close field selector dropdown
  document.addEventListener("click", (e) => {
    document.querySelectorAll(".dd-field-selector").forEach(selector => {
      if (!selector.contains(e.target)) {
         const dd = selector.querySelector(".dd-field-dropdown");
         if (dd) dd.style.display = "none";
      }
    });
  });

});
`;

  res.setHeader("Content-Type", "text/javascript");
  res.status(200).send(code);
}
