document.addEventListener("DOMContentLoaded", function () {

  const cards = document.querySelectorAll(".card-block-wrap[data-api]");
  if (!cards.length) return;

  cards.forEach(card => initCardBlock(card));

  /* ============================================================
     INIT ONE CARD BLOCK
     ============================================================ */
  function initCardBlock(card) {

    const apiUrl       = card.dataset.api;
    const defaultMetric = card.dataset.defaultMetric || "adsCount";

    const tableWrapper = card.querySelector(".table-render");
    const canvas       = card.querySelector("canvas");
    const metricSelect = card.querySelector(".metric-select");
    const platformSelect = card.querySelector(".platform-select");
    const dateSelect     = card.querySelector(".date-select");

    let tableData = [];
    let chart = null;
    let selectedKeys = new Set();

    metricSelect?.addEventListener("change", updateChart);
    platformSelect?.addEventListener("change", loadData);
    dateSelect?.addEventListener("change", loadData);

    loadData();

    /* ------------------------------------------------------------
       API URL Builder (platform + date range)
       ------------------------------------------------------------ */
    function buildUrl() {
      const params = [];
      const platform = platformSelect?.value;
      const range = dateSelect?.value;

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
        .then(r => r.json())
        .then(json => {
          tableData = json.rows || [];
          renderTable(json);
          updateChart();
        });
    }

    /* ------------------------------------------------------------
       UNIVERSAL TABLE RENDER
       ------------------------------------------------------------ */
    function renderTable(data) {
      const { columns, rows } = data;

      let html = '<table><thead><tr>';
      html += "<th></th>"; // checkbox
      columns.forEach(c => html += \`<th data-col="\${c}">\${pretty(c)}</th>\`);
      html += "</tr></thead><tbody>";

      rows.forEach(r => {
        const key = r[columns[0]];

        html += \`
          <tr data-key="\${key}">
            <td><input type="checkbox" class="row-check" data-key="\${key}"></td>
        \`;

        columns.forEach(c => {
          html += \`<td>\${format(r[c])}</td>\`;
        });

        html += "</tr>";
      });

      html += "</tbody></table>";
      tableWrapper.innerHTML = html;

      // Checkbox events
      tableWrapper.querySelectorAll(".row-check").forEach(cb => {
        cb.addEventListener("change", () => {
          const key = cb.dataset.key;
          if (cb.checked) selectedKeys.add(key);
          else selectedKeys.delete(key);
          updateChart();
        });
      });

      // Sorting events
      tableWrapper.querySelectorAll("th[data-col]").forEach(th => {
        th.addEventListener("click", () => onSort(th.dataset.col));
      });
    }

    /* ------------------------------------------------------------
       SORT LOGIC
       ------------------------------------------------------------ */
    let sortState = { col: null, dir: null };

    function onSort(col) {
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

      renderTable({ columns: Object.keys(tableData[0] || {}), rows: tableData });
    }

    /* ------------------------------------------------------------
       CHART LOGIC (Universal)
       ------------------------------------------------------------ */
    function updateChart() {
      const metric = metricSelect?.value || defaultMetric;

      if (chart) chart.destroy();

      const labels = selectedKeys.size
        ? [...selectedKeys]
        : tableData.map(r => r.name);

      const data = labels.map(l => {
        const row = tableData.find(r => r.name === l);
        return row?.[metric] ?? 0;
      });

      chart = new Chart(canvas, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: pretty(metric),
              data,
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
      return str.replace(/([A-Z])/g, " $1").replace(/^\w/, c => c.toUpperCase());
    }
    function format(v) {
      if (typeof v === "number") return v.toLocaleString();
      return v ?? "";
    }
  }
});
