/* CO2-Pantanal – static dashboard
   - Reads data/data.csv
   - Leaflet map with hover preview + click full popup
   - Filters: compartment, habitat, site, date range, CO2 column selector
   - Stats + comparison chart + timeline chart + small “gaps” checker
*/

const DATA_URL = "data/data.csv";

const el = (id) => document.getElementById(id);

let RAW = [];
let FILTERED = [];
let MAP = null;
let LAYER = null;

let chartCompare = null;
let chartTime = null;

const REQUIRED = ["lat", "lon"]; // minimal for map

function normKey(k){
  return (k || "").toString().trim();
}
function normVal(v){
  if (v === null || v === undefined) return "";
  return v.toString().trim();
}
function toNum(v){
  const x = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : null;
}
function toDateISO(dateStr){
  // Accept: YYYY-MM-DD (ideal) or DD/MM/YYYY
  const s = normVal(dateStr);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)){
    const [dd,mm,yyyy] = s.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}
function format(n){
  if (n === null || n === undefined) return "–";
  if (!Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toFixed(0);
  if (abs >= 100) return n.toFixed(1);
  if (abs >= 10) return n.toFixed(2);
  return n.toFixed(3);
}

function unique(list){
  return [...new Set(list.filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}

function pickFirstExisting(columns, candidates){
  const set = new Set(columns);
  for (const c of candidates) if (set.has(c)) return c;
  return null;
}

/* ===== CO2 floating bubbles ===== */
function initCO2Float(){
  const layer = el("co2-float-layer");
  const N = 18;
  for (let i=0;i<N;i++){
    const d = document.createElement("div");
    d.className = "co2-bubble";
    d.textContent = "CO₂";
    const left = Math.random() * 100;
    const size = 16 + Math.random()*22;
    const dur = 14 + Math.random()*22;
    const delay = Math.random()*-20;
    d.style.left = `${left}vw`;
    d.style.fontSize = `${size}px`;
    d.style.animationDuration = `${dur}s`;
    d.style.animationDelay = `${delay}s`;
    layer.appendChild(d);
  }
}

/* ===== Map ===== */
function initMap(){
  MAP = L.map("map", { preferCanvas: true }).setView([-16.3, -56.0], 6);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(MAP);

  LAYER = L.layerGroup().addTo(MAP);
}

function markerColor(compartment){
  const c = (compartment || "").toLowerCase();
  if (c.includes("water") || c.includes("água") || c.includes("agua")) return "#2563eb"; // blue
  if (c.includes("soil") || c.includes("solo")) return "#0f172a"; // dark
  return "#6b7280"; // gray
}

function makeCircleMarker(row){
  const lat = toNum(row.lat);
  const lon = toNum(row.lon);
  if (lat === null || lon === null) return null;

  const comp = row.compartment || row.compartimento || "";
  const color = markerColor(comp);

  const m = L.circleMarker([lat, lon], {
    radius: 7,
    weight: 2,
    color: color,
    fillColor: color,
    fillOpacity: 0.25
  });

  return m;
}

function buildPopupHTML(row, co2col){
  const site = row.site_name || row.site || row.local || row.location || "Site";
  const date = row.date || row.data || "";
  const time = row.time || row.hora || "";
  const comp = row.compartment || row.compartimento || "";
  const habitat = row.habitat || row.surface || row.microhabitat || row.subtrato || "";

  const co2 = toNum(row[co2col]);
  const units = row.co2_units || row.units || row.unidades || "";

  // Show a curated set first, then show “others”
  const curated = [
    ["CO₂", co2, units],
    ["Date", date, time],
    ["Compartment", comp, ""],
    ["Habitat", habitat, ""],
    ["Temp (°C)", toNum(row.temp_c ?? row.temperature ?? row.temperatura), ""],
    ["RH (%)", toNum(row.rh ?? row.humidity ?? row.umidade), ""],
    ["Cond (µS/cm)", toNum(row.cond_uScm ?? row.condutividade), ""],
    ["DO (mg/L)", toNum(row.do_mgL ?? row.oxigenio_mgL ?? row["oxigenio_mg_l"]), ""],
    ["DO (%)", toNum(row.do_pct ?? row.oxigenio_pct ?? row["oxigenio_%"]), ""],
    ["pH", toNum(row.ph), ""],
  ];

  const rowsHTML = curated
    .filter(([k,v]) => v !== null && v !== "" && v !== undefined)
    .map(([k,v,u]) => {
      const val = (typeof v === "number") ? format(v) : String(v);
      const uu = u ? ` <span style="color:#64748b">(${u})</span>` : "";
      return `<div class="p-row"><b>${k}:</b> ${val}${uu}</div>`;
    }).join("");

  // Any extra variables (lightly)
  const skip = new Set([
    "lat","lon","site","site_name","local","location","date","data","time","hora",
    "compartment","compartimento","habitat","surface","microhabitat","subtrato",
    "co2_units","units","unidades"
  ]);
  const extras = Object.keys(row)
    .filter(k => !skip.has(k) && k !== co2col && normVal(row[k]) !== "")
    .slice(0, 14)
    .map(k => `<div class="p-row"><span style="color:#64748b">${k}:</span> ${row[k]}</div>`)
    .join("");

  return `
    <div style="min-width:240px;max-width:330px">
      <div style="font-weight:900;margin-bottom:6px">${site}</div>
      ${rowsHTML}
      ${extras ? `<hr style="border:none;border-top:1px solid #e5e7eb;margin:8px 0">${extras}` : ""}
    </div>
  `;
}

function refreshMap(rows, co2col){
  LAYER.clearLayers();
  const latlngs = [];

  rows.forEach((r) => {
    const m = makeCircleMarker(r);
    if (!m) return;

    const popup = buildPopupHTML(r, co2col);
    m.bindPopup(popup, { closeButton: true });

    m.on("mouseover", () => m.openPopup());
    m.on("mouseout", () => m.closePopup());

    m.addTo(LAYER);

    const lat = toNum(r.lat), lon = toNum(r.lon);
    if (lat !== null && lon !== null) latlngs.push([lat, lon]);
  });

  if (latlngs.length){
    const bounds = L.latLngBounds(latlngs);
    MAP.fitBounds(bounds.pad(0.2));
  }
}

/* ===== Filters + stats ===== */
function inferColumns(columns){
  const col = {};
  col.site = pickFirstExisting(columns, ["site_name","site","local","location","ponto","ponto_nome"]);
  col.compartment = pickFirstExisting(columns, ["compartment","compartimento"]);
  col.habitat = pickFirstExisting(columns, ["habitat","surface","microhabitat","subtrato","ambiente"]);
  col.date = pickFirstExisting(columns, ["date","data"]);
  col.time = pickFirstExisting(columns, ["time","hora"]);

  // CO2 candidate columns (you can add more names here)
  col.co2Candidates = columns.filter(c =>
    /co2|flux|eflux|emission|resp/i.test(c)
  );
  if (!col.co2Candidates.length) col.co2Candidates = ["co2_flux"];

  return col;
}

function populateSelect(selectEl, values){
  const current = selectEl.value;
  selectEl.innerHTML = `<option value="">All</option>` + values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  // restore if still exists
  if (values.includes(current)) selectEl.value = current;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (m)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[m]));
}

function applyFilters(){
  const fComp = el("f-compartment").value;
  const fHab = el("f-habitat").value;
  const fSite = el("f-site").value;
  const start = el("f-date-start").value || null;
  const end = el("f-date-end").value || null;
  const co2col = el("f-co2col").value;

  FILTERED = RAW.filter(r => {
    if (fComp && normVal(r.compartment ?? r.compartimento) !== fComp) return false;
    const hab = normVal(r.habitat ?? r.surface ?? r.microhabitat ?? r.subtrato ?? r.ambiente);
    if (fHab && hab !== fHab) return false;

    const site = normVal(r.site_name ?? r.site ?? r.local ?? r.location ?? r.ponto ?? r.ponto_nome);
    if (fSite && site !== fSite) return false;

    if (start || end){
      const d = toDateISO(r.date ?? r.data);
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
    }
    return true;
  });

  refreshMap(FILTERED, co2col);
  refreshStats(FILTERED, co2col);
  refreshCharts(FILTERED, co2col);
  refreshTable(FILTERED, co2col);
  refreshGaps(FILTERED);
}

function refreshStats(rows, co2col){
  const values = rows.map(r => toNum(r[co2col])).filter(v => v !== null);
  const units = guessUnits(rows);

  el("units-note").textContent = units ? `Units (from file): ${units}` : "";

  el("s-n").textContent = values.length ? `${values.length}` : "0";
  if (!values.length){
    el("s-min").textContent = "–";
    el("s-max").textContent = "–";
    el("s-mean").textContent = "–";
    el("s-med").textContent = "–";
    return;
  }
  values.sort((a,b)=>a-b);
  const min = values[0];
  const max = values[values.length-1];
  const mean = values.reduce((a,b)=>a+b,0)/values.length;
  const med = values.length % 2 ? values[(values.length-1)/2] : (values[values.length/2 -1] + values[values.length/2])/2;

  el("s-min").textContent = format(min);
  el("s-max").textContent = format(max);
  el("s-mean").textContent = format(mean);
  el("s-med").textContent = format(med);
}

function guessUnits(rows){
  // if your CSV has co2_units/units/unidades, show the most frequent
  const u = rows.map(r => normVal(r.co2_units ?? r.units ?? r.unidades)).filter(Boolean);
  if (!u.length) return "";
  const freq = {};
  u.forEach(x => freq[x] = (freq[x]||0)+1);
  return Object.entries(freq).sort((a,b)=>b[1]-a[1])[0][0];
}

/* ===== Charts ===== */
function destroyChart(c){
  if (c) c.destroy();
}

function groupMean(rows, keyFn, valFn){
  const m = new Map();
  for (const r of rows){
    const k = keyFn(r);
    const v = valFn(r);
    if (!k || v === null) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(v);
  }
  const out = [];
  for (const [k, arr] of m.entries()){
    arr.sort((a,b)=>a-b);
    const mean = arr.reduce((a,b)=>a+b,0)/arr.length;
    const min = arr[0], max = arr[arr.length-1];
    out.push({k, mean, min, max, n: arr.length});
  }
  out.sort((a,b)=>b.mean-a.mean);
  return out;
}

function refreshCharts(rows, co2col){
  const co2 = (r)=>toNum(r[co2col]);

  // Compare: group by compartment + habitat
  const cmp = groupMean(
    rows,
    (r)=>{
      const c = normVal(r.compartment ?? r.compartimento) || "NA";
      const h = normVal(r.habitat ?? r.surface ?? r.microhabitat ?? r.subtrato ?? r.ambiente) || "NA";
      return `${c} • ${h}`;
    },
    co2
  ).slice(0, 12);

  const ctx1 = document.getElementById("chart-compare");
  destroyChart(chartCompare);
  chartCompare = new Chart(ctx1, {
    type: "bar",
    data: {
      labels: cmp.map(x=>x.k),
      datasets: [{
        label: "Mean CO₂",
        data: cmp.map(x=>x.mean)
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }},
      scales: {
        x: { ticks: { maxRotation: 60, minRotation: 40 } },
        y: { beginAtZero: false }
      }
    }
  });

  // Timeline: CO2 by date (mean per day)
  const byDay = groupMean(
    rows,
    (r)=>toDateISO(r.date ?? r.data) || null,
    co2
  ).sort((a,b)=>a.k.localeCompare(b.k));

  const ctx2 = document.getElementById("chart-time");
  destroyChart(chartTime);
  chartTime = new Chart(ctx2, {
    type: "line",
    data: {
      labels: byDay.map(x=>x.k),
      datasets: [{
        label: "Daily mean CO₂",
        data: byDay.map(x=>x.mean),
        tension: 0.25,
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }},
      scales: {
        x: { ticks: { maxTicksLimit: 10 }},
        y: { beginAtZero: false }
      }
    }
  });
}

/* ===== Table ===== */
function refreshTable(rows, co2col){
  const t = el("table");
  const shown = rows.slice(0, 200);

  if (!shown.length){
    t.innerHTML = "<tr><th>No data for current filters.</th></tr>";
    return;
  }

  const cols = Object.keys(shown[0]);
  // keep important first
  const first = ["site_name","site","local","location","date","data","time","hora","compartment","compartimento","habitat","surface","microhabitat","subtrato","lat","lon", co2col];
  const ordered = [...new Set([...first, ...cols])].filter(c => cols.includes(c) || c === co2col);

  const thead = `<tr>${ordered.map(c=>`<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
  const tbody = shown.map(r => {
    return `<tr>${ordered.map(c=>`<td>${escapeHtml(r[c] ?? "")}</td>`).join("")}</tr>`;
  }).join("");

  t.innerHTML = thead + tbody;
}

/* ===== Gaps ===== */
function refreshGaps(rows){
  const box = el("gaps");
  box.innerHTML = "";

  const comps = unique(rows.map(r => normVal(r.compartment ?? r.compartimento) || "NA"));
  const habs = unique(rows.map(r => normVal(r.habitat ?? r.surface ?? r.microhabitat ?? r.subtrato ?? r.ambiente) || "NA"));

  if (!comps.length || !habs.length){
    box.innerHTML = `<div class="gap-item">Not enough metadata to compute gaps (need compartment + habitat columns).</div>`;
    return;
  }

  const seen = new Set();
  rows.forEach(r => {
    const c = normVal(r.compartment ?? r.compartimento) || "NA";
    const h = normVal(r.habitat ?? r.surface ?? r.microhabitat ?? r.subtrato ?? r.ambiente) || "NA";
    seen.add(`${c}||${h}`);
  });

  const missing = [];
  for (const c of comps){
    for (const h of habs){
      const key = `${c}||${h}`;
      if (!seen.has(key)) missing.push({c,h});
    }
  }

  if (!missing.length){
    box.innerHTML = `<div class="gap-item">No missing combinations found (compartment × habitat) in current filters.</div>`;
    return;
  }

  missing.slice(0, 20).forEach(x => {
    const d = document.createElement("div");
    d.className = "gap-item";
    d.textContent = `Missing: ${x.c} × ${x.h}`;
    box.appendChild(d);
  });

  if (missing.length > 20){
    const d = document.createElement("div");
    d.className = "gap-item";
    d.textContent = `(+${missing.length - 20} more…)`;
    box.appendChild(d);
  }
}

/* ===== Boot ===== */
async function loadCSV(){
  return new Promise((resolve, reject) => {
    Papa.parse(DATA_URL, {
      download: true,
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data),
      error: (err) => reject(err)
    });
  });
}

function normalizeRows(rows){
  // normalize key names to lower_snake when possible (light-touch)
  // IMPORTANT: keep original columns too, but we ensure lat/lon/date fields exist.
  const out = rows.map(r => {
    const obj = {};
    for (const [k,v] of Object.entries(r)){
      const key = normKey(k);
      obj[key] = normVal(v);
    }

    // Alias common coordinate names into lat/lon
    if (!obj.lat){
      obj.lat = obj.latitude || obj.Latitude || obj.LAT || obj.LATITUDE || "";
    }
    if (!obj.lon){
      obj.lon = obj.longitude || obj.Longitude || obj.LON || obj.LONGITUDE || obj.lng || "";
    }
    return obj;
  });

  return out;
}

function validate(rows){
  const cols = Object.keys(rows[0] || {});
  const missing = REQUIRED.filter(k => !cols.includes(k));
  return { cols, missing };
}

function initUI(cols){
  const inferred = inferColumns(cols);

  // CO2 column selector
  const co2Sel = el("f-co2col");
  co2Sel.innerHTML = inferred.co2Candidates.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if (!inferred.co2Candidates.length){
    co2Sel.innerHTML = `<option value="co2_flux">co2_flux</option>`;
  }

  // Populate other filter options from data
  populateFilterOptions();
}

function populateFilterOptions(){
  const comps = unique(RAW.map(r => normVal(r.compartment ?? r.compartimento)));
  const habs = unique(RAW.map(r => normVal(r.habitat ?? r.surface ?? r.microhabitat ?? r.subtrato ?? r.ambiente)));
  const sites = unique(RAW.map(r => normVal(r.site_name ?? r.site ?? r.local ?? r.location ?? r.ponto ?? r.ponto_nome)));

  populateSelect(el("f-compartment"), comps);
  populateSelect(el("f-habitat"), habs);
  populateSelect(el("f-site"), sites);
}

function wireEvents(){
  el("btn-apply").addEventListener("click", applyFilters);
  el("btn-reset").addEventListener("click", () => {
    el("f-compartment").value = "";
    el("f-habitat").value = "";
    el("f-site").value = "";
    el("f-date-start").value = "";
    el("f-date-end").value = "";
    applyFilters();
  });

  el("btn-fit").addEventListener("click", () => {
    // Fit current layer
    const latlngs = [];
    FILTERED.forEach(r => {
      const lat = toNum(r.lat), lon = toNum(r.lon);
      if (lat !== null && lon !== null) latlngs.push([lat, lon]);
    });
    if (latlngs.length){
      MAP.fitBounds(L.latLngBounds(latlngs).pad(0.2));
    }
  });
}

(async function boot(){
  initCO2Float();
  initMap();
  wireEvents();

  try{
    const rows = await loadCSV();
    RAW = normalizeRows(rows);

    if (!RAW.length){
      alert("data/data.csv loaded, but it has no rows.");
      return;
    }

    const { cols, missing } = validate(RAW);
    if (missing.length){
      alert(`Missing required columns: ${missing.join(", ")}. Please ensure your CSV has lat and lon columns (or latitude/longitude).`);
      return;
    }

    initUI(cols);
    // initial render
    FILTERED = RAW;
    applyFilters();

  }catch(e){
    console.error(e);
    alert("Failed to load data/data.csv. Check that the file exists and is a valid CSV with commas.");
  }
})();
