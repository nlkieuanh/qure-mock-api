document.addEventListener("DOMContentLoaded", function () {

  const cards = document.querySelectorAll(".card-block-wrap[data-api]");
  if (!cards.length) return;

  cards.forEach(initCardBlock);

  /* =========================================================================
      INIT DYNAMIC UNIVERSAL MODULE FOR ANY CARD BLOCK
  ========================================================================= */
  function initCardBlock(card) {

    const apiUrl         = card.dataset.api;
    const defaultMetric  = card.dataset.defaultMetric || "adsCount";

    const tableWrapper   = card.querySelector(".table-render");
    const canvas         = card.querySelector("canvas");

    /* ---- Webflow Metric Dropdown ---- */
    const metricDropdown       = card.querySelector(".chart-metric-dd-select");
    const metricList           = metricDropdown?.querySelector(".filter-dropdown-list-inner");
    const metricSelectedLabel  = metricDropdown?.querySelector(".chart-metric-dd-selected");

    const platformSelect = card.querySelector(".platform-select");
    const dateSelect     = card.querySelector(".date-select");

    let columns      = [];
    let tableData    = [];   // raw API data
    let tableView    = [];   // used for sorting in UI
    let selectedKeys = new Set();
    let currentMetric = defaultMetric;

    let chart = null;

    /* Filters */
    if (platformSelect) platformSelect.addEventListener("change", loadData);
    if (dateSelect)     dateSelect.addEventListener("change", loadData);

    loadData();

    /* =========================================================================
        BUILD URL WITH FILTERS
    ========================================================================= */
    function buildUrl() {
      const params = [];

      if (platformSelect?.value)
        params.push("platform=" + encodeURIComponent(platformSelect.value));

      if (dateSelect?.value) {
        const end   = new Date();
        const start = new Date();
        start.setDate(end.getDate() - Number(dateSelect.value));
        params.push("start=" + start.toISOString());
        params.push("end=" + end.toISOString());
      }

      return apiUrl + (params.length ? "?" + params.join("&") : "");
    }

    /* =========================================================================
        FETCH DATA
    ========================================================================= */
    function loadData() {
      fetch(buildUrl())
        .then(r => r.json())
        .then(json => {

          columns    = json.columns || [];
          tableData  = json.rows || [];
          tableView  = [...tableData];  // independent view for sorting

          // Default: All rows selected
          selectedKeys = new Set(tableData.map(r => r.name));

          buildMetricDropdown(columns);
          renderTable(columns, tableView);
          updateChart();
        })
        .catch(console.error);
    }

    /* =========================================================================
        METRIC DROPDOWN (DYNAMIC HEADER → METRIC LIST)
    ========================================================================= */
    function buildMetricDropdown(cols) {
      if (!metricList) return;

      metricList.innerHTML = "";

      cols.forEach(col => {
        if (col === "name" || col === "date" || col === "timeseries") return;

        const item = document.createElement("div");
        item.className = "filter-dropdown-item";

        const text = document.createElement("div");
        text.className = "dropdown-item-text";
        text.textContent = pretty(col);

        item.appendChild(text);
        metricList.appendChild(item);

        item.addEventListener("click", () => {
          currentMetric = col;

          if (metricSelectedLabel) {
            metricSelectedLabel.textContent = pretty(col);
          }

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

      // sort independent view
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

      /* ------------------------------------------------------------
         UNION OF ALL DATES (CORRECT TIMESERIES WITH DIFFERENT AXES)
      ------------------------------------------------------------ */
      const dateSet = new Set();

      tableData.forEach(row => {
        if (selectedKeys.has(row.name) && Array.isArray(row.timeseries)) {
          row.timeseries.forEach(ts => dateSet.add(ts.date));
        }
      });

      const labels = [...dateSet].sort((a, b) => a.localeCompare(b));

      /* ------------------------------------------------------------
         BUILD DATASETS FOR EACH SELECTED ROW
      ------------------------------------------------------------ */
      const datasets = [...selectedKeys].map(name => {

        const row = tableData.find(r => r.name === name);
        if (!row?.timeseries) return null;

        const map = {};
        row.timeseries.forEach(ts => map[ts.date] = ts[metric] ?? 0);

        const series = labels.map(date => map[date] ?? 0);

        return {
          label: `${name} - ${pretty(metric)}`,
          data: series,
          borderWidth: 2,
          tension: 0.3,
          fill: false
        };
      }).filter(Boolean);

      /* ------------------------------------------------------------
         CHART INSTANCE
      ------------------------------------------------------------ */
      chart = new Chart(canvas, {
        type: "line",
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false }
        }
      });

      canvas.removeAttribute("width");
      canvas.removeAttribute("height");
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    }

    /* =========================================================================
        HELPERS
    ========================================================================= */
    function pretty(str) {
      return str
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, c => c.toUpperCase());
    }

    function format(v) {
      if (typeof v === "number") return v.toLocaleString();
      return v ?? "";
    }
  }
});
