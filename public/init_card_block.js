
document.addEventListener("DOMContentLoaded", function () {

  /* Select by data-groupby ONLY */
  const cards = document.querySelectorAll(".card-block-wrap[data-groupby]");
  if (!cards.length) return;

  cards.forEach(initCardBlock);

  /* =========================================================================
      INIT DYNAMIC UNIVERSAL MODULE FOR ANY CARD BLOCK
  ========================================================================= */
  function initCardBlock(card) {
    const API_ADS = "https://qure-mock-api.vercel.app/api/ads";

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
    let _rawAdsCache = null;

    let chart = null;

    /* Filters */
    if (platformSelect) platformSelect.addEventListener("change", () => loadData());
    if (dateSelect) dateSelect.addEventListener("change", () => loadData());

    loadData();

    /* =========================================================================
        HELPER FUNCTIONS (Simulating core.js logic on client)
    ========================================================================= */
    function resolveValue(obj, path) {
      if (!path) return null;
      return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    }

    /*
      Aggregates raw ads into groups based on `groupby` field.
      Also generates timeseries data for each group.
    */
    function processAds(ads, { groupBy, filters = {} }) {
      let filtered = ads;

      // 1. Filter Platform
      if (filters.platform) {
        filtered = filtered.filter(ad => String(ad.platform).toLowerCase() === filters.platform.toLowerCase());
      }
      // 2. Filter Date Range
      if (filters.start && filters.end) {
        const s = new Date(filters.start);
        const e = new Date(filters.end);
        filtered = filtered.filter(ad => {
          const d = new Date(ad.start_date || ad.date || 0);
          return d >= s && d <= e;
        });
      }

      // 3. Grouping
      const groups = {};

      filtered.forEach(ad => {
        // Determine Group Key
        let groupKeys = ["Total"];
        if (groupBy) {
          const raw = resolveValue(ad, groupBy);
          if (Array.isArray(raw)) groupKeys = raw;
          else if (raw) groupKeys = [raw];
          else groupKeys = ["Unknown"];
        }

        groupKeys.forEach(key => {
          const k = typeof key === 'string' ? key.trim() : String(key);
          if (!k) return;

          if (!groups[k]) {
            groups[k] = {
              name: k,
              adsCount: 0,
              spend: 0,
              revenue: 0,
              impressions: 0,
              clicks: 0,
              timeseries: {}
            };
          }

          const g = groups[k];
          g.adsCount++;
          g.spend += Number(ad.spend) || 0;

          // Revenue logic
          if (ad.windsor && ad.windsor.action_values_omni_purchase) {
            g.revenue += Number(ad.windsor.action_values_omni_purchase);
          } else {
            g.revenue += Number(ad.revenue) || 0;
          }

          g.impressions += Number(ad.impressions) || 0;
          g.clicks += Number(ad.clicks) || 0;

          // Timeseries Accumulation
          const rawDate = ad.start_date || ad.date;
          if (rawDate) {
            const dateKey = rawDate.split("T")[0]; // YYYY-MM-DD
            if (!g.timeseries[dateKey]) {
              g.timeseries[dateKey] = {
                date: dateKey,
                adsCount: 0, spend: 0, revenue: 0, impressions: 0, clicks: 0
              };
            }
            const ts = g.timeseries[dateKey];
            ts.adsCount++;
            ts.spend += Number(ad.spend) || 0;
            if (ad.windsor && ad.windsor.action_values_omni_purchase) {
              ts.revenue += Number(ad.windsor.action_values_omni_purchase);
            } else {
              ts.revenue += Number(ad.revenue) || 0;
            }
            ts.impressions += Number(ad.impressions) || 0;
            ts.clicks += Number(ad.clicks) || 0;
          }
        });
      });

      // 4. Format Results
      return Object.values(groups).map(g => {
        const roas = g.spend > 0 ? g.revenue / g.spend : 0;
        const ctr = g.impressions > 0 ? g.clicks / g.impressions : 0;
        const cpc = g.clicks > 0 ? g.spend / g.clicks : 0;

        // Process Timeseries for this group
        const timeseriesArray = Object.values(g.timeseries).map(t => ({
          ...t,
          roas: t.spend > 0 ? t.revenue / t.spend : 0,
          ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
          cpc: t.clicks > 0 ? t.spend / t.clicks : 0
        })).sort((a, b) => a.date.localeCompare(b.date));

        return {
          name: g.name,
          adsCount: g.adsCount,
          spend: g.spend,
          revenue: g.revenue,
          roas,
          ctr,
          cpc,
          timeseries: timeseriesArray
        };
      });
    }

    /* =========================================================================
        LOAD & PROCESS DATA
    ========================================================================= */
    async function loadData() {
      console.log(`[CardBlock] Loading data for groupby=${groupby}...`);

      try {
        // 1. Fetch Raw Ads (Cache if possible)
        if (!_rawAdsCache) {
          const res = await fetch(API_ADS);
          _rawAdsCache = await res.json();
        }

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

        // 3. Process Locally
        const processedRows = processAds(_rawAdsCache, {
          groupBy: groupby,
          filters: filters
        });

        // 4. Determine Columns
        // If 'fields' data attr matches logical columns, use them, else defaults
        // Note: For init_card_block, we usually just show metric columns + name.
        let defaultCols = ["name", "adsCount", "spend", "revenue", "roas"];
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

      // Available metrics to toggle in chart
      const metrics = ["adsCount", "spend", "revenue", "roas", "ctr", "cpc"];

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

      tableView.sort((a, b) => {
        const A = a[col] ?? 0;
        const B = b[col] ?? 0;
        return sortState.dir === "asc" ? A - B : B - A;
      });

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

    /* =========================================================================
        HELPERS
    ========================================================================= */
    function pretty(str) {
      if (!str) return "";
      return str
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, c => c.toUpperCase());
    }

    function format(v) {
      if (typeof v === "number") {
        // If it's a float-like number, restrict decimals
        if (!Number.isInteger(v)) return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return v.toLocaleString();
      }
      return v ?? "";
    }
  }
});
