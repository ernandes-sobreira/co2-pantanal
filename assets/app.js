/* CO2-Pantanal – static dashboard (your exact CSV headers)
   - Reads data/data.csv (semicolon delimiter ; with BOM)
   - Leaflet map hover + click popup
   - Filters: SOLO/ÁGUA, TRATAMENTO, CARACTERÍSTICA LOCAL, NOME DO LOCAL, STATUS AMBIENTAL, PONTO, date range
   - Stats: min/max/mean/median/IQR
   - Charts: group comparison + timeline
*/

const DATA_URL = "data/data.csv";

const el = (id) => document.getElementById(id);

let RAW = [];
let FILTERED = [];

let MAP = null;
let LAYER = null;

let chartCompare = null;
let chartTime = null;

// ======== Your EXACT headers ========
const H = {
  author: "AUTOR",
  date: "DATA",
  site: "NOME DO LOCAL",
  compartment: "SOLO/ÁGUA",
  characteristic: "CARACTERÍSTICA LOCAL",
  status: "STATUS AMBIENTAL",
  lat: "Latitude 1",
  lon: "Longitude 2",
  point: "PONTO",
  treatment: "TRATAMENTO",
  soilState: "ESTADO DO SOLO",
  ph: "pH",
  temp: "TEMPERATURA",
  organic: "MATÉRIA ÔRGANICA",
  do_mgL: "OD (mg/L)",
  cond: "COND (µc/cm)",
  do_pct: "OD (%)",
  replica: "RÉPLICA",
  chamber: "CÂMARA",
  co2: "CO2 flux (mg/m2/day)"
};

function normVal(v){
  if (v === null || v === undefined) return "";
  return v.toString().trim();
}
function toNum(v){
  const s = normVal(v);
  if (!s) return null;
  const x = parseFloat(s.replace(",", "."));
  return Number.isFinite(x) ? x : null;
}
function toDateISO(dateStr){
  const s = normVal(dateStr);
  if (!s) return null;
  // your file uses DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)){
    const [dd,mm,yyyy] = s.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
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
  return [...new Set(list.filter(x => x !== "" && x !== null && x !== undefined))]
    .sort((a,b)=>String(a).localeCompare(String(b)));
}
function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, (m)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;", "\"":"&quot;","'":"&#039;"
  }[m]));
}

// ===== CO2 bubbles (front, subtle) =====
function initCO2Float(){
  const layer = el("co2-float-layer");
  const N = 22;

  for (let i=0;i<N;i++){
    const b = document.createElement("div");
    b.className = "co2-bubble";

    const sp = document.createElement("span");
    sp.textContent = "CO₂";
    b.appendChild(sp);

    const size = 56 + Math.random()*70;      // variable bubble size
    const left = Math.random() * 100;
    const dur = 16 + Math.random()*26;
    const delay = Math.random()*-22;

    b.style.width = `${size}px`;
    b.style.height = `${size}px`;
    b.style.left = `${left}vw`;
    b.style.animationDuration = `${dur}s`;
    b.style.animationDelay = `${delay}s`;

    // randomize opacity slightly (still subtle)
    b.style.opacity = (0.10 + Math.random()*0.14).toFixed(2);

    layer.appendChild(b);
  }
}

// ===== Map =====
function initMap(){
  MAP = L.map("map", { preferCanvas: true }).setView([-16.3, -56.0], 6);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(MAP);

  LAYER = L.layerGroup().addTo(MAP);
}

function markerColor(compartment){
  const c = normVal(compartment).toLowerCase();
  if (c.includes("água") || c.includes("agua") || c.includes("water")) return "#2563eb";
  if (c.includes("solo") || c.includes("soil")) return "#0f172a";
  return "#6b7280";
}

function buildPopupHTML(r, co2Col){
  const site = normVal(r[H.site]);
  const date = normVal(r[H.date]);
  const comp = normVal(r[H.compartment]);
  const treat = normVal(r[H.treatment]);
  const status = normVal(r[H.status]);
  const characteristic = normVal(r[H.characteristic]);
  const point = normVal(r[H.point]);

  const co2 = toNum(r[co2Col]);

  const items = [
    ["CO₂ flux", (co2 === null ? "–" : format(co2)), "mg/m²/day"],
    ["Date", date, ""],
    ["Site", site, ""],
    ["Compartment", comp, ""],
    ["Treatment", treat, ""],
    ["Characteristic", characteristic, ""],
    ["Status", status, ""],
    ["Point", point, ""],
    ["pH", toNum(r[H.ph]), ""],
    ["Temp", toNum(r[H.temp]), "°C"],
    ["Organic matter", toNum(r[H.organic]), ""],
    ["DO", toNum(r[H.do_mgL]), "mg/L"],
    ["DO", toNum(r[H.do_pct]), "%"],
    ["Cond", toNum(r[H.cond]), "µS/cm"],
    ["Replica", normVal(r[H.replica]), ""],
    ["Chamber", normVal(r[H.chamber]), ""],
    ["Author", normVal(r[H.author]), ""],
  ];

  const rowsHTML = items
    .filter(([k,v]) => v !== null && v !== "" && v !== undefined && v !== "–")
    .map(([k,v,u]) => {
      const val = (typeof v === "number") ? format(v) : String(v);
      const uu = u ? ` <span style="color:#64748b">(${u})</span>` : "";
      return `<div style="margin:2px 0"><b>${escapeHtml(k)}:</b> ${escapeHtml(val)}${uu}</div>`;
    }).join("");

  return `
    <div style="min-width:240px;max-width:340px">
      <div style="font-weight:900;margin-bottom:6px">${escapeHtml(site || "Site")}</div>
      ${rowsHTML}
    </div>
  `;
}

function refreshMap(rows, co2Col){
  LAYER.clearLayers();
  const latlngs = [];

  rows.forEach(r => {
    const lat = toNum(r[H.lat]);
    const lon = toNum(r[H.lon]);
    if (lat === null || lon === null) return;

    const comp = r[H.compartment];
    const color = markerColor(comp);

    const m = L.circleMarker([lat, lon], {
      radius: 7,
      weight: 2,
      color: color,
      fillColor: color,
      fillOpacity: 0.25
    });

    const popup = buildPopupHTML(r, co2Col);
    m.bindPopup(popup, { closeButton: true });

    m.on("mouseover", () => m.openPopup());
    m.on("mouseout", () => m.closePopup());

    m.addTo(LAYER);
    latlngs.push([lat, lon]);
  });

  if (latlngs.length){
    MAP.fitBounds(L.latLngBounds(latlngs).pad(0.2));
  }
}

// ===== Filters + stats =====
function populateSelect(selectEl, values){
  const current = selectEl.value;
  selectEl.innerHTML = `<option value="">All</option>` + values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  if (values.includes(current)) selectEl.value = current;
}

function applyFilters(){
  const fComp = el("f-compartment").value;
  const fTreat = el("f-treatment").value;
  const fChar = el("f-characteristic").value;
  const fSite = el("f-site").value;
  const fStatus = el("f-status").value;
  const fPoint = el("f-point").value;
  const start = el("f-date-start").value || null;
  const end = el("f-date-end").value || null;

  const co2Col = el("f-co2col").value || H.co2;

  FILTERED = RAW.filter(r => {
    if (fComp && normVal(r[H.compartment]) !== fComp) return false;
    if (fTreat && normVal(r[H.treatment]) !== fTreat) return false;
    if (fChar && normVal(r[H.characteristic]) !== fChar) return false;
    if (fSite && normVal(r[H.site]) !== fSite) return false;
    if (fStatus && normVal(r[H.status]) !== fStatus) return false;
    if (fPoint && normVal(r[H.point]) !== fPoint) return false;

    if (start || end){
      const d = toDateISO(r[H.date]);
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
    }
    return true;
  });

  refreshMap(FILTERED, co2Col);
  refreshStats(FILTERED, co2Col);
  refreshCharts(FILTERED, co2Col);
  refreshTable(FILTERED, co2Col);
  refreshGaps(FILTERED);
}

function refreshStats(rows, co2Col){
  const vals = rows.map(r => toNum(r[co2Col])).filter(v => v !== null);

  el("units-note").textContent = co2Col ? `${co2Col} • units: mg/m²/day` : "";

  el("s-n").textContent = vals.length ? `${vals.length}` : "0";
  if (!vals.length){
    el("s-min").textContent = "–";
    el("s-max").textContent = "–";
    el("s-mean").textContent = "–";
    el("s-med").textContent = "–";
    el("s-iqr").textContent = "–";
    return;
  }

  vals.sort((a,b)=>a-b);
  const min = vals[0];
  const max = vals[vals.length-1];
  const mean = vals.reduce((a,b)=>a+b,0)/vals.length;

  const median = (vals.length % 2)
    ? vals[(vals.length-1)/2]
    : (vals[vals.length/2 -1] + vals[vals.length/2]) / 2;

  const q1 = quantile(vals, 0.25);
  const q3 = quantile(vals, 0.75);
  const iqr = (q1 !== null && q3 !== null) ? (q3 - q1) : null;

  el("s-min").textContent = format(min);
  el("s-max").textContent = format(max);
  el("s-mean").textContent = format(mean);
  el("s-med").textContent = format(median);
  el("s-iqr").textContent = (iqr === null ? "–" : format(iqr));
}

function quantile(sorted, p){
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo]*(1-w) + sorted[hi]*w;
}

// ===== Charts =====
function destroyChart(c){ if (c) c.destroy(); }

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
    out.push({k, mean, n: arr.length});
  }
  out.sort((a,b)=>b.mean-a.mean);
  return out;
}

function refreshCharts(rows, co2Col){
  const co2 = (r)=>toNum(r[co2Col]);

  // Compare: SOLO/ÁGUA × TRATAMENTO
  const cmp = groupMean(
    rows,
    (r)=>{
      const c = normVal(r[H.compartment]) || "NA";
      const t = normVal(r[H.treatment]) || "NA";
      return `${c} • ${t}`;
    },
    co2
  ).slice(0, 14);

  const ctx1 = document.getElementById("chart-compare");
  destroyChart(chartCompare);
  chartCompare = new Chart(ctx1, {
    type: "bar",
    data: {
      labels: cmp.map(x=>x.k),
      datasets: [{ label: "Mean CO₂", data: cmp.map(x=>x.mean) }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }},
      scales: { x: { ticks: { maxRotation: 60, minRotation: 35 } } }
    }
  });

  // Timeline: daily mean CO2
  const byDay = groupMean(
    rows,
    (r)=>toDateISO(r[H.date]) || null,
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
      scales: { x: { ticks: { maxTicksLimit: 10 } } }
    }
  });
}

// ===== Table =====
function refreshTable(rows, co2Col){
  const t = el("table");
  const shown = rows.slice(0, 200);

  if (!shown.length){
    t.innerHTML = "<tr><th>No data for current filters.</th></tr>";
    return;
  }

  const cols = Object.keys(shown[0]);
  const first = [
    H.site, H.date, H.compartment, H.treatment, H.characteristic, H.status, H.point,
    H.lat, H.lon, co2Col, H.temp, H.ph, H.do_mgL, H.do_pct, H.cond, H.replica, H.chamber, H.author
  ].filter(Boolean);

  const ordered = [...new Set([...first, ...cols])].filter(c => cols.includes(c) || c === co2Col);

  const thead = `<tr>${ordered.map(c=>`<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
  const tbody = shown.map(r => `<tr>${ordered.map(c=>`<td>${escapeHtml(r[c] ?? "")}</td>`).join("")}</tr>`).join("");

  t.innerHTML = thead + tbody;
}

// ===== Gaps =====
function refreshGaps(rows){
  const box = el("gaps");
  box.innerHTML = "";

  const comps = unique(rows.map(r => normVal(r[H.compartment]) || "NA"));
  const treats = unique(rows.map(r => normVal(r[H.treatment]) || "NA"));

  if (!comps.length || !treats.length){
    box.innerHTML = `<div class="gap-item">Not enough metadata to compute gaps.</div>`;
    return;
  }

  const seen = new Set();
  rows.forEach(r => {
    const c = normVal(r[H.compartment]) || "NA";
    const t = normVal(r[H.treatment]) || "NA";
    seen.add(`${c}||${t}`);
  });

  const missing = [];
  for (const c of comps){
    for (const t of treats){
      const key = `${c}||${t}`;
      if (!seen.has(key)) missing.push({c,t});
    }
  }

  if (!missing.length){
    box.innerHTML = `<div class="gap-item">No missing combinations found (SOLO/ÁGUA × TRATAMENTO) in current filters.</div>`;
    return;
  }

  missing.slice(0, 20).forEach(x => {
    const d = document.createElement("div");
    d.className = "gap-item";
    d.textContent = `Missing: ${x.c} × ${x.t}`;
    box.appendChild(d);
  });

  if (missing.length > 20){
    const d = document.createElement("div");
    d.className = "gap-item";
    d.textContent = `(+${missing.length - 20} more…)`;
    box.appendChild(d);
  }
}

// ===== Load CSV (semicolon + BOM safe) =====
async function loadCSV(){
  return new Promise((resolve, reject) => {
    Papa.parse(DATA_URL, {
      download: true,
      header: true,
      delimiter: ";",         // IMPORTANT for your data
      skipEmptyLines: true,
      transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(), // remove BOM
      complete: (res) => resolve(res.data),
      error: (err) => reject(err)
    });
  });
}

function initUI(){
  // CO2 selector: in your file, default is exactly H.co2
  const co2Sel = el("f-co2col");
  const candidates = [H.co2].filter(Boolean);
  co2Sel.innerHTML = candidates.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  co2Sel.value = H.co2;

  // Populate filter options from RAW
  populateSelect(el("f-compartment"), unique(RAW.map(r => normVal(r[H.compartment]))));
  populateSelect(el("f-treatment"), unique(RAW.map(r => normVal(r[H.treatment]))));
  populateSelect(el("f-characteristic"), unique(RAW.map(r => normVal(r[H.characteristic]))));
  populateSelect(el("f-site"), unique(RAW.map(r => normVal(r[H.site]))));
  populateSelect(el("f-status"), unique(RAW.map(r => normVal(r[H.status]))));
  populateSelect(el("f-point"), unique(RAW.map(r => normVal(r[H.point]))));
}

function wireEvents(){
  el("btn-apply").addEventListener("click", applyFilters);

  el("btn-reset").addEventListener("click", () => {
    el("f-compartment").value = "";
    el("f-treatment").value = "";
    el("f-characteristic").value = "";
    el("f-site").value = "";
    el("f-status").value = "";
    el("f-point").value = "";
    el("f-date-start").value = "";
    el("f-date-end").value = "";
    applyFilters();
  });

  el("btn-fit").addEventListener("click", () => {
    const latlngs = [];
    FILTERED.forEach(r => {
      const lat = toNum(r[H.lat]);
      const lon = toNum(r[H.lon]);
      if (lat !== null && lon !== null) latlngs.push([lat, lon]);
    });
    if (latlngs.length){
      MAP.fitBounds(L.latLngBounds(latlngs).pad(0.2));
    }
  });
}

// ===== Boot =====
(async function boot(){
  initCO2Float();
  initMap();
  wireEvents();

  try{
    RAW = await loadCSV();

    if (!RAW.length){
      alert("data/data.csv loaded, but it has no rows.");
      return;
    }

    // quick validation (coords)
    const hasLat = Object.prototype.hasOwnProperty.call(RAW[0], H.lat);
    const hasLon = Object.prototype.hasOwnProperty.call(RAW[0], H.lon);
    if (!hasLat || !hasLon){
      alert(`Missing coordinate columns. Expected "${H.lat}" and "${H.lon}".`);
      return;
    }

    initUI();
    FILTERED = RAW;
    applyFilters();

  }catch(e){
    console.error(e);
    alert("Failed to load data/data.csv. Check that the file exists and is a valid semicolon-separated CSV (;).");
  }
})();
