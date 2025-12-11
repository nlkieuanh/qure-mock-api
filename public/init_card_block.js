document.addEventListener("DOMContentLoaded", function () {
  const cards = document.querySelectorAll(".card-block-wrap[data-api]");
  if (!cards.length) return;

  cards.forEach(function (card) {
    initCardBlock(card);
  });

  /* ============================================================
     INIT ONE CARD BLOCK
     ============================================================ */
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

    if (metricSelect) metricSelect.addEventListener("change", updateChart);
    if (platformSelect) platformSelect.addEventListener("change", loadData);
    if (dateSelect) dateSelect.addEventListener("change", loadData);

    loadData();

    /* ------------------------------------------------------------
       API URL Builder
       ------------------------------------------------------------ */
    function buildUrl() {
      const params = [];
      const platform = platformSelect ? platformSelect.value : "";
      const range = dateSelect ? dateSelect.value : "";

      if (platform) params.push("platform=" + encodeURIComponent(platform));

      if (range) {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - Number(range));

        params.push("start=" + start.toISOString());
        params.push("end=" + end.toISOString());
      }

      return apiUrl + (params.length ? "?" + params.join("&") : "");
    }

    /* ------------------------------------------------------------
       FETCH + RENDER
       ------------------------------------------------------------ */
    function loadData() {
      fetch(buildUrl())
        .then(function (r) {
          return r.json();
        })
        .then(function (json) {
          tableData = json.rows || [];
          renderTable(json);
          updateChart();
        })
        .catch(function (err) {
          console.error("Error loading data:", err);
        });
    }

    /* ------------------------------------------------------------
       UNIVERSAL TABLE RENDER
       ------------------------------------------------------------ */
    function renderTable(data) {
      const columns = data.columns || [];
      const rows = data.rows || [];

      let html = '<table><thead><tr>';
      html += '<th></th>';

      columns.forEach(function (col) {
        html += '<th data-col="' + col + '">' + pretty(col) + "</th>";
      });

      html += "</tr></thead><tbody>";

      rows.forEach(function (row) {
        const key = row[columns[0]];

        html += '<tr data-key="' + key + '">';
        html += '<td><input type="checkbox" class="row-check" data-key="' + key + '"></td>';

        columns.forEach(function (col) {
          html += "<td>" + format(row[col]) + "</td>";
        });

        html += "</tr>";
      });

      html += "</tbody></table>";
      tableWrapper.innerHTML = html;

      tableWrapper.querySelectorAll(".row-check").forEach(function (cb) {
        cb.addEventListener("change", function () {
          const key = cb.dataset.key;
          if (cb.checked) selectedKeys.add(key);
          else selectedKeys.delete(key);
          updateChart();
        });
      });

      tableWrapper.querySelectorAll("th[data-col]").forEach(function (th) {
        th.addEventListener("click", function () {
          onSort(th.dataset.col);
        });
      });
    }

    /* ------------------------------------------------------------
       SORT LOGIC
       ------------------------------------------------------------ */
    let sortState = { col: null, dir: null };

    function onSort(col) {
      if (sortState.col !== col) {
        sortState = { col: col, dir: "asc" };
      } else {
        sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
      }

      tableData.sort(function (a, b) {
        const A = a[col] || 0;
        const B = b[col] || 0;
        return sortState.dir === "asc" ? A - B : B - A;
      });

      renderTable({
        columns: Object.keys(tableData[0] || {}),
        rows: tableData
      });
    }

    /* ------------------------------------------------------------
       CHART LOGIC
       ------------------------------------------------------------ */
    function updateChart() {
      const metric = metricSelect ? metricSelect.value : defaultMetric;

      if (chart) chart.destroy();

      const labels = selectedKeys.size
        ? Array.from(selectedKeys)
        : tableData.map(function (r) {
            return r.name;
          });

      const data = labels.map(function (label) {
        const row = tableData.find(function (r) {
          return r.name === label;
        });
        return row && row[metric] ? row[metric] : 0;
      });

      chart = new Chart(canvas, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            {
              label: pretty(metric),
              data: data,
              fill: true
            }
          ]
        }
      });
    }

    /* ------------------------------------------------------------
       HELPERS
       ------------------------------------------------------------ */
    function pretty(str) {
      return str.replace(/([A-Z])/g, " $1").replace(/^\w/, function (c) {
        return c.toUpperCase();
      });
    }

    function format(v) {
      if (typeof v === "number") return v.toLocaleString();
      return v || "";
    }
  }
});
