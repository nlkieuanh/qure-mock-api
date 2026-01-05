export default function handler(req, res) {
  const code = `
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
      { id: "f_angles",   label: "Angle" }
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
        let headerText = this.pretty(col);
        // If this is the first column ("name"), use the current tab label
        if (col === columns[0] && state.tabs.find(t => t.id === state.currentTabId)) {
          headerText = state.tabs.find(t => t.id === state.currentTabId).label;
        }
        
        html += \`<th data-col="\${col}">\${headerText}</th>\`;
      });
      html += '</tr></thead><tbody>';

      // 2. Build Rows
      rows.forEach(row => {
        const keyVal = row[columns[0]]; 
        html += \`<tr class="dd-row" data-value="\${keyVal}">\`;
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
        "adsCount": "Ads Count",
        "f_offers": "Offer",
        "platform": "Platform",
        "f_insights.cta_type": "CTA Type",
        "f_insights.hook_type": "Hook Type",
        "f_insights.visual_style": "Visual Style",
        "f_insights.trigger_type": "Trigger Type"
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
    const hits = new Map(); // Use Map to dedup by "value|type" key

    // Define fields to ignore (metrics, IDs, internal fields)
    const ignoredFields = new Set(["_id", "adsCount", "impressions", "spend", "ctr", "cpc", "roas", "date"]);

    ads.forEach(ad => {
       Object.keys(ad).forEach(key => {
          if (ignoredFields.has(key)) return;
          
          let values = [];
          if (Array.isArray(ad[key])) values = ad[key];
          else if (ad[key]) values = [ad[key]];
          
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
      // Reuse the pretty function from table if possible, or duplicate logic
      const label = table.pretty(item.type);
                    
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
    // 1. Find the Webflow dropdown component
    const dropdown = card.querySelector(".dd-add-field-select");
    if (!dropdown) return; // If user hasn't created it yet, do nothing (or we could fallback)

    const toggle = dropdown.querySelector(".dd-add-field-toggle");
    const listWrap = dropdown.querySelector(".dd-add-field-list");
    const listInner = dropdown.querySelector(".dd-add-field-list-inner") || listWrap;
    
    if (!toggle || !listWrap) return;

    // 2. Initial Render of Options
    renderFieldOptions(listInner);

    // 3. Toggle Event
    // Remove old listeners to avoid duplicates? Ideally this function runs once or we safeguard.
    // We can assume renderFieldSelector is called frequently? No, renderTabs calls it.
    // So we should prevent double-binding.
    if (dropdown.dataset.bound) return; 
    dropdown.dataset.bound = "true";

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      // Webflow interactions might handle display, but if we need manual control:
      const isHidden = getComputedStyle(listWrap).display === "none";
      if (isHidden) {
         listWrap.style.display = "block";
         // Auto expand width
         listWrap.style.minWidth = "100%";
         listWrap.style.width = "max-content";
         
         // Align Right
         listWrap.style.position = "absolute"; // Ensure absolute positioning
         listWrap.style.right = "0";
         listWrap.style.left = "auto";
         
         // Re-render to ensure checked state is fresh?
         renderFieldOptions(listInner); 
      } else {
         listWrap.style.display = "none";
      }
    });

    // Global Close (using the robust logic we built earlier)
    document.addEventListener("click", (e) => {
      if (!dropdown.contains(e.target)) {
        listWrap.style.display = "none";
      }
    });
  }

  function renderFieldOptions(container) {
    if (!container) return;

    // Master list of all possible fields
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

    // Attach Change Events
    container.querySelectorAll(".dd-field-item-checkbox").forEach(chk => {
       chk.addEventListener("change", (e) => {
          handleToggleTab(e.target.dataset.id, e.target.dataset.label, e.target.checked);
       });
    });
  }
  
  function handleToggleTab(id, label, isChecked) {
    if (isChecked) {
       // Add if not exists
       if (!state.tabs.find(t => t.id === id)) {
         state.tabs.push({ id, label });
       }
    } else {
       // Remove
       const idx = state.tabs.findIndex(t => t.id === id);
       if (idx !== -1) {
         state.tabs.splice(idx, 1);
         
         // If we removed the active tab, switch to the first one available
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
    
    // Note: We need a unique ID for dragging if labels are not unique, but here keys are unique.
    
    state.tabs.forEach((tab, index) => {
      const btn = document.createElement("a");
      btn.className = "drilldown-tab-button w-inline-block";
      if (tab.id === state.currentTabId) btn.classList.add("is-current");
      
      // Pointer events none on text to avoid dragging text selection issues
      btn.innerHTML = \`<div class="text-block-7" style="pointer-events: none;">\${tab.label}</div>\`;
      
      // Navigate on Click
      btn.addEventListener("click", () => {
        state.currentTabId = tab.id;
        renderTabs(); 
        loadLevel();
      });

      // DRAG & DROP EVENTS
      btn.setAttribute("draggable", "true");
      btn.dataset.index = index;

      btn.addEventListener("dragstart", (e) => {
        // We store the index of the item being dragged
        e.dataTransfer.setData("text/plain", index);
        e.dataTransfer.effectAllowed = "move";
        btn.style.opacity = "0.5";
      });

      btn.addEventListener("dragend", () => {
        btn.style.opacity = "1";
        // Cleanup visual cues
        document.querySelectorAll(".drilldown-tab-button").forEach(b => b.classList.remove("drag-over"));
      });

      btn.addEventListener("dragover", (e) => {
        e.preventDefault(); // allow dropping
        e.dataTransfer.dropEffect = "move";
        btn.classList.add("drag-over");
      });

      btn.addEventListener("dragleave", () => {
        btn.classList.remove("drag-over");
      });

      // Handle Drop
      btn.addEventListener("drop", (e) => {
        e.preventDefault();
        const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
        const toIndex = index;
        
        if (fromIndex !== toIndex) {
          // Reorder state.tabs
          const movedItem = state.tabs.splice(fromIndex, 1)[0];
          state.tabs.splice(toIndex, 0, movedItem);
          
          // Re-render tabs to reflect new order
          renderTabs();
          
          // We might need to reload data because column order (fields param) 
          // depends on tab order in our logic.
          loadLevel(); 
        }
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

  // Global listener to close field selector dropdown
  document.addEventListener("click", (e) => {
    document.querySelectorAll(".dd-field-selector").forEach(selector => {
      // If click is outside THIS selector, hide its dropdown
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
