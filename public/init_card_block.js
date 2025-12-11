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
    const metricDropdown       = card.querySelector(".chart-metric-dd-select");
    const metricList           = metricDropdown?.querySelector(".filter-dropdown-list-inner");
    const metricSelectedLabel  = metricDropdown?.querySelector(".chart-metric-dd-selected");

    const platformSelect = card.querySelector(".platform-select");
    const dateSelect     = card.querySelector(".date-select");

    let columns      = [];
    let tableData    = [];   // dữ liệu API gốc
    let tableView    = [];   // dữ liệu để hiển thị bảng (sort trên bản copy)
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

          columns    = json.columns || [];
          tableData  = json.rows || [];
          tableView  = [...tableData];   // bản copy để hiển thị bảng

          selectedKeys = new Set(tableData.map(r => r.name)); 

          buildMetricDropdown(columns);
          renderTable(columns, tableView);
          updateChart();
        })
        .catch(console.error);
    }

    /* =========================================================================
        BUILD METRIC DROPDOWN (NO ARROW REMOVAL)
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
        TABLE RENDER + SORT + CHECKBOX
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

      /* Checkbox handler */
      tableWrapper.querySelectorAll(".row-check").forEach(cb => {
        cb.addEventListener("change", () => {
          const key = cb.dataset.key;
          if (cb.checked) selectedKeys.add(key);
          else selectedKeys.delete(key);
          updateChart();
        });
      });

      /* Sorting handler */
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

      // ❗ Sort CHỈ tác động vào tableView, không chạm tableData
      tableView.sort((a, b) => {
        const A = a[col] ?? 0;
        const B = b[col] ?? 0;
        return sortState.dir === "asc" ? A - B : B - A;
      });

      renderTable(columns, tableView);
      updateChart();   
    }

    /* =========================================================================
        CHART RENDER - MULTILINE TIMESERIES
    ========================================================================= */
    function updateChart() {
      if (!canvas) return;
      if (chart) chart.destroy();

      const metric = currentMetric;

      // Always get labels from first valid row in tableData (not affected by sorting)
      const firstRowWithTS = tableData.find(r => Array.isArray(r.timeseries));

      const labels = firstRowWithTS
        ? firstRowWithTS.timeseries.map(ts => ts.date)
        : [];

      const datasets = [...selectedKeys].map(name => {
        const row = tableData.find(r => r.name === name);
        if (!row?.timeseries) return null;

        const sortedTS = row.timeseries.slice().sort((a, b) => a.date.localeCompare(b.date));

        return {
          label: `${row.name} - ${pretty(metric)}`,
          data: sortedTS.map(v => v[metric] || 0),
          borderWidth: 2,
          tension: 0.3,
          fill: false
        };
      }).filter(Boolean);

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
