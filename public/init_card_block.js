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

    const tableWrapper = card.querySelector(".table-render");
    const canvas = card.querySelector("canvas");

    const metricSelect = card.querySelector(".metric-select");
    const platformSelect = card.querySelector(".platform-select");
    const dateSelect = card.querySelector(".date-select");

    let tableData = [];
    let chart = null;
    let selectedKeys = new Set();
    let columns = [];

    if (platformSelect) platformSelect.addEventListener("change", loadData);
    if (dateSelect) dateSelect.addEventListener("change", loadData);
    if (metricSelect) metricSelect.addEventListener("change", updateChart);

    loadData();

    /* =========================================================================
       BUILD API QUERY URL (platform / date range)
    ========================================================================= */
    function buildUrl() {
      const params = [];

      if (platformSelect && platformSelect.value) {
        params.push("platform=" + encodeURIComponent(platformSelect.value));
      }

      if (dateSelect && dateSelect.value) {
        const end = new Date();
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
          tableData = json.rows || [];
          columns = json.columns || [];

          buildMetricDropdown(columns);
          renderTable(columns, tableData);
          updateChart();
        })
        .catch(err => console.error("LOAD DATA ERROR:", err));
    }

    /* =========================================================================
       AUTOGENERATE METRIC DROPDOWN
    ========================================================================= */
    function buildMetricDropdown(cols) {
      if (!metricSelect) return;

      metricSelect.innerHTML = "";

      cols.forEach(col => {
        if (col === "name") return; // skip name

        const opt = document.createElement("option");
        opt.value = col;
        opt.textContent = pretty(col);

        metricSelect.appendChild(opt);
      });

      // default metric
      metricSelect.value = defaultMetric;
    }

    /* =========================================================================
        RENDER TABLE (Styled by .adv-channel-table)
    ========================================================================= */
    function renderTable(cols, rows) {
      let html = '<div class="adv-channel-table-wrapper">';
      html += '<table class="adv-channel-table">';
      html += '<thead><tr>';

      html += '<th></th>'; // checkbox col

      cols.forEach(col => {
        html += '<th data-col="' + col + '">' + pretty(col) + "</th>";
      });

      html += "</tr></thead><tbody>";

      rows.forEach(row => {
        const key = row.name;

        html += '<tr data-key="' + key + '">';
        html += '<td><input type="checkbox" class="row-check" data-key="' + key + '"></td>';

        cols.forEach(col => {
          html += "<td>" + format(row[col]) + "</td>";
        });

        html += "</tr>";
      });

      html += "</tbody></table></div>";
      tableWrapper.innerHTML = html;

      // checkbox events
      tableWrapper.querySelectorAll(".row-check").forEach(cb => {
        cb.addEventListener("change", () => {
          const key = cb.dataset.key;

          if (cb.checked) selectedKeys.add(key);
          else selectedKeys.delete(key);

          updateChart();
        });
      });

      // sorting events
      tableWrapper.querySelectorAll("th[data-col]").forEach(th => {
        th.addEventListener("click", () => onSort(th.dataset.col));
      });
    }

    /* =========================================================================
       SORT
    ========================================================================= */
    let sortState = { col: null, dir: null };

    function onSort(col) {
      if (sortState.col !== col) {
        sortState = { col, dir: "asc" };
      } else {
        sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
      }

      tableData.sort((a, b) => {
        const A = a[col] || 0;
        const B = b[col] || 0;
        return sortState.dir === "asc" ? A - B : B - A;
      });

      renderTable(columns, tableData);
    }

    /* =========================================================================
       CHART (TIMESERIES MULTI-LINE)
    ========================================================================= */
    function updateChart() {
      const metric = metricSelect ? metricSelect.value : defaultMetric;

      if (chart) chart.destroy();

      const selected = selectedKeys.size > 0
        ? [...selectedKeys]
        : tableData.map(r => r.name);

      const datasets = [];

      selected.forEach(name => {
        const row = tableData.find(r => r.name === name);
        if (!row || !row.timeseries) return;

        const ts = row.timeseries.sort((a, b) => a.date.localeCompare(b.date));

        datasets.push({
          label: name + " - " + pretty(metric),
          data: ts.map(d => d[metric] || 0),
          fill: false
        });
      });

      const firstSeries = tableData[0]?.timeseries || [];
      const labels = firstSeries.map(d => d.date);

      chart = new Chart(canvas, {
        type: "line",
        data: {
          labels,
          datasets
        },
        options: {
          responsive: true,
          interaction: { mode: "index", intersect: false },
          stacked: false
        }
      });
    }

    /* =========================================================================
       HELPERS
    ========================================================================= */
    function pretty(str) {
      return str.replace(/([A-Z])/g, " $1").replace(/^\w/, c => c.toUpperCase());
    }

    function format(v) {
      if (typeof v === "number") return v.toLocaleString();
      return v ?? "";
    }
  }
});
