document.addEventListener("DOMContentLoaded", function () {

  const cards = document.querySelectorAll(".card-block-wrap[data-api]");
  if (!cards.length) return;

  cards.forEach(initCardBlock);

  /* =========================================================================
      INIT ONE CARD BLOCK
  ========================================================================= */
  function initCardBlock(card) {

    const apiUrl         = card.dataset.api;
    const defaultMetric  = card.dataset.defaultMetric || "adsCount";

    const tableWrapper   = card.querySelector(".table-render");
    const canvas         = card.querySelector("canvas");

    /* ---- Webflow Metric Dropdown ---- */
    const metricDropdown = card.querySelector(".chart-metric-dd-select");
    const metricToggle   = metricDropdown?.querySelector(".Filter Dropdown Toggle");
    const metricList     = metricDropdown?.querySelector(".Filter Dropdown List Inner");

    const platformSelect = card.querySelector(".platform-select");
    const dateSelect     = card.querySelector(".date-select");

    let columns      = [];
    let tableData    = [];
    let selectedKeys = new Set();
    let currentMetric = defaultMetric;

    let chart = null;

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
          columns   = json.columns || [];
          tableData = json.rows || [];

          buildMetricDropdown(columns);
          renderTable(columns, tableData);
          updateChart();
        })
        .catch(console.error);
    }

    /* =========================================================================
        BUILD METRIC DROPDOWN (WEBFLOW CUSTOM)
    ========================================================================= */
    function buildMetricDropdown(cols) {
      if (!metricList) return;

      metricList.innerHTML = "";

      cols.forEach(col => {
        if (col === "name" || col === "date") return;

        const item = document.createElement("div");
        item.className = "Filter Dropdown Item";

        const text = document.createElement("div");
        text.className = "dropdown-item-text";
        text.textContent = pretty(col);

        item.appendChild(text);
        metricList.appendChild(item);

        item.addEventListener("click", () => {
          currentMetric = col;
          metricToggle.textContent = pretty(col);
          updateChart();
        });
      });

      metricToggle.textContent = pretty(currentMetric);
    }

    /* =========================================================================
        TABLE RENDER + SORT + CHECKBOX
    ========================================================================= */

    let sortState = { col: null, dir: null };

    function renderTable(cols, rows) {
      let html = '<div class="adv-channel-table-wrapper">';
      html += '<table class="adv-channel-table">';
      html += '<thead><tr>';
      html += '<th></th>';

      cols.forEach(col => {
        html += `<th data-col="${col}" class="sortable">${pretty(col)}</th>`;
      });

      html += '</tr></thead><tbody>';

      rows.forEach(row => {
        html += `<tr data-key="${row.name}">`;
        html += `<td><input type="checkbox" class="row-check" data-key="${row.name}" checked></td>`;

        cols.forEach(col => {
          html += `<td>${format(row[col])}</td>`;
        });

        html += `</tr>`;
      });

      html += '</tbody></table></div>';

      tableWrapper.innerHTML = html;

      /* Pre-select all rows */
      selectedKeys = new Set(rows.map(r => r.name));

      /* Checkbox toggle */
      tableWrapper.querySelectorAll(".row-check").forEach(cb => {
        cb.addEventListener("change", () => {
          const key = cb.dataset.key;
          if (cb.checked) selectedKeys.add(key);
          else selectedKeys.delete(key);
          updateChart();
        });
      });

      /* Sorting */
      tableWrapper.querySelectorAll("th.sortable").forEach(th => {
        th.addEventListener("click", () => sortColumn(th.dataset.col));
      });
    }

    /* ---- Sorting handler ---- */
    function sortColumn(col) {
      if (sortState.col !== col) {
        sortState = { col, dir: "asc" };
      } else {
        sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
      }

      tableData.sort((a, b) => {
        const A = a[col] ?? 0;
        const B = b[col] ?? 0;
        return sortState.dir === "asc" ? A - B : B - A;
      });

      renderTable(columns, tableData);
      updateChart();
    }

    /* =========================================================================
        CHART RENDER (FIXED CANVAS)
    ========================================================================= */
    function updateChart() {
      if (!canvas) return;
      if (chart) chart.destroy();

      const metric = currentMetric;

      const labels = tableData[0]?.timeseries?.map(ts => ts.date) || [];

      const datasets = [];

      [...selectedKeys].forEach(name => {
        const row = tableData.find(r => r.name === name);
        if (!row?.timeseries) return;

        const sorted = row.timeseries.sort((a, b) => a.date.localeCompare(b.date));

        datasets.push({
          label: `${row.name} - ${pretty(metric)}`,
          data: sorted.map(t => t[metric] || 0),
          borderWidth: 2,
          tension: 0.3,
          fill: false
        });
      });

      chart = new Chart(canvas, {
        type: "line",
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,     // ⭐ IMPORTANT FIX
          interaction: { mode: "index", intersect: false },
          scales: {
            x: { ticks: { maxRotation: 45, minRotation: 45 } }
          }
        }
      });

      /* ⭐ FIX Chart.js overriding <canvas> inline size */
      canvas.removeAttribute("width");
      canvas.removeAttribute("height");
      canvas.style.width  = "100%";
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
