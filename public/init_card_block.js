document.addEventListener("DOMContentLoaded", function () {

  const cards = document.querySelectorAll(".card-block-wrap[data-api]");
  if (!cards.length) return;

  cards.forEach(initCardBlock);

  /* =========================================================================
      INIT ONE CARD
  ========================================================================= */
  function initCardBlock(card) {
    const apiUrl = card.dataset.api;
    const defaultMetric = card.dataset.defaultMetric || "adsCount";

    const tableWrapper   = card.querySelector(".table-render");
    const canvas         = card.querySelector("canvas");

    /* Webflow dropdown metric structure */
    const metricDropdown = card.querySelector(".chart-metric-dd-select");
    const metricToggle   = metricDropdown?.querySelector(".Filter Dropdown Toggle");
    const metricList     = metricDropdown?.querySelector(".Filter Dropdown List Inner");

    const platformSelect = card.querySelector(".platform-select");
    const dateSelect     = card.querySelector(".date-select");

    let tableData = [];
    let columns   = [];
    let chart     = null;
    let selectedKeys = new Set();
    let currentMetric = defaultMetric;

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
       FETCH DATA FROM API
    ========================================================================= */
    function loadData() {
      fetch(buildUrl())
        .then(r => r.json())
        .then(json => {
          columns   = json.columns || [];
          tableData = json.rows    || [];

          buildMetricDropdown(columns);
          renderTable(columns, tableData);
          updateChart();
        })
        .catch(console.error);
    }

    /* =========================================================================
       BUILD METRIC DROPDOWN (Webflow custom)
    ========================================================================= */
    function buildMetricDropdown(cols) {
      if (!metricList) return;

      metricList.innerHTML = ""; // reset items

      cols.forEach(col => {
        if (col === "name") return; // skip

        const item = document.createElement("div");
        item.className = "Filter Dropdown Item";

        const text = document.createElement("div");
        text.className = "dropdown-item-text";
        text.textContent = pretty(col);

        item.appendChild(text);
        metricList.appendChild(item);

        item.addEventListener("click", () => {
          currentMetric = col;
          if (metricToggle) metricToggle.textContent = pretty(col);
          updateChart();
        });
      });

      // Set default label
      if (metricToggle) metricToggle.textContent = pretty(currentMetric);
    }

    /* =========================================================================
       RENDER TABLE WITH CHECKBOX + SORT
    ========================================================================= */
    function renderTable(cols, rows) {
      let html = '<div class="adv-channel-table-wrapper">';
      html += '<table class="adv-channel-table">';
      html += '<thead><tr>';

      html += '<th></th>';

      cols.forEach(col => {
        html += `<th data-col="${col}">${pretty(col)}</th>`;
      });

      html += "</tr></thead><tbody>";

      rows.forEach(row => {
        html += `<tr data-key="${row.name}">`;
        html += `<td><input type="checkbox" class="row-check" data-key="${row.name}" checked></td>`;

        cols.forEach(col => {
          html += `<td>${format(row[col])}</td>`;
        });

        html += "</tr>";
      });

      html += "</tbody></table></div>";
      tableWrapper.innerHTML = html;

      selectedKeys = new Set(rows.map(r => r.name));

      tableWrapper.querySelectorAll(".row-check").forEach(cb => {
        cb.addEventListener("change", () => {
          const k = cb.dataset.key;
          if (cb.checked) selectedKeys.add(k);
          else selectedKeys.delete(k);
          updateChart();
        });
      });
    }

    /* =========================================================================
       CHART (MULTI-LINE TIMESERIES)
    ========================================================================= */
    function updateChart() {
      if (chart) chart.destroy();

      const datasets = [];
      const lines = [...selectedKeys];

      lines.forEach(line => {
        const row = tableData.find(r => r.name === line);
        if (!row || !row.timeseries) return;

        const sorted = row.timeseries.sort((a, b) => a.date.localeCompare(b.date));

        datasets.push({
          label: `${row.name} - ${pretty(currentMetric)}`,
          data: sorted.map(d => d[currentMetric] || 0),
          fill: false
        });
      });

      const labels = tableData[0]?.timeseries?.map(t => t.date) || [];

      chart = new Chart(canvas, {
        type: "line",
        data: { labels, datasets },
        options: {
          responsive: true,
          interaction: { mode: "index", intersect: false }
        }
      });
    }

    /* =========================================================================
       HELPERS
    ========================================================================= */
    function pretty(str) {
      return str
        .replace(/([A-Z])/g, " $1")
        .replace(/^\w/, c => c.toUpperCase());
    }

    function format(v) {
      if (typeof v === "number") return v.toLocaleString();
      return v ?? "";
    }
  }
});
