
(function(){
  "use strict";

  const META = window.CO2_META || {units:{}, labels:{}};
  const RAW = Array.isArray(window.CO2_DATA) ? window.CO2_DATA : [];

  // --- normalize rows ---
  const rowsAll = RAW.map((r, idx) => {
    const rr = {...r};
    rr._ts = toTime(rr.dt);
    rr.lat = toNum(rr.lat);
    rr.lon = toNum(rr.lon);

    // normalize strings
    ["medium","autor","local","ponto","tratamento","estado_do_solo","periodo_sazonal","compartimento","replica","camara"].forEach(k=>{
      if(rr[k] === undefined || rr[k] === null) return;
      rr[k] = String(rr[k]).trim();
    });

    // normalize numeric-like fields
    Object.keys(rr).forEach(k=>{
      if(["id","dt","_ts","medium","autor","local","ponto","tratamento","estado_do_solo","periodo_sazonal","compartimento","replica","camara","notes","lat","lon"].includes(k)) return;
      // attempt to parse numbers if it's a string
      if(typeof rr[k] === "string"){
        const v = rr[k].replace(",", ".");
        const n = Number(v);
        if(Number.isFinite(n)) rr[k] = n;
      }
    });

    return rr;
  }).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon) && Number.isFinite(r._ts));

  // --- elements ---
  const fMedium = $("#fMedium");
  const fLocal = $("#fLocal");
  const fPonto = $("#fPonto");
  const fCompartimento = $("#fCompartimento");
  const fTratamento = $("#fTratamento");
  const fEstadoSolo = $("#fEstadoSolo");
  const fPeriodo = $("#fPeriodo");
  const fVariable = $("#fVariable");
  const fDateStart = $("#fDateStart");
  const fDateEnd = $("#fDateEnd");

  const btnReset = $("#btnReset");
  const btnDownloadCSV = $("#btnDownloadCSV");

  const kpiN = $("#kpiN");
  const kpiCo2Mean = $("#kpiCo2Mean");
  const kpiCo2Unit = $("#kpiCo2Unit");
  const kpiCo2Max = $("#kpiCo2Max");
  const kpiCo2MaxMeta = $("#kpiCo2MaxMeta");
  const kpiCo2Min = $("#kpiCo2Min");
  const kpiCo2MinMeta = $("#kpiCo2MinMeta");

  const cmpSoil = $("#cmpSoil");
  const cmpWater = $("#cmpWater");
  const metaHint = $("#metaHint");

  const tblHead = $("#tblHead");
  const tblBody = $("#tblBody");
  const tblSearch = $("#tblSearch");
  const tblInfo = $("#tblInfo");

  let map, markerLayer;
  let chartTS, chartHist;

  init();

  function init(){
    if(!rowsAll.length){
      alert("Não encontrei registros válidos (lat/lon/data). Confira o data.js.");
      return;
    }

    metaHint.textContent = `Fonte: ${META.source || "planilha"} • Registros: ${rowsAll.length}`;

    // default date range
    const minTs = Math.min(...rowsAll.map(r=>r._ts));
    const maxTs = Math.max(...rowsAll.map(r=>r._ts));
    fDateStart.value = toDateInput(minTs);
    fDateEnd.value = toDateInput(maxTs);

    // populate filters
    fillSelect(fLocal, uniq(rowsAll.map(r=>r.local)).sort());
    fillSelect(fPonto, uniq(rowsAll.map(r=>r.ponto)).sort());
    fillSelect(fCompartimento, uniq(rowsAll.map(r=>r.compartimento)).sort());
    fillSelect(fTratamento, uniq(rowsAll.map(r=>r.tratamento)).sort());
    fillSelect(fEstadoSolo, uniq(rowsAll.map(r=>r.estado_do_solo)).sort());
    fillSelect(fPeriodo, uniq(rowsAll.map(r=>r.periodo_sazonal)).sort());

    // variables
    const numericKeys = detectNumericKeys(rowsAll);
    // ensure co2_flux first
    const vars = ["co2_flux", ...numericKeys.filter(k=>k!=="co2_flux")];
    fVariable.innerHTML = vars.map(k=>{
      const label = labelOf(k);
      const unit = unitOf(k);
      return `<option value="${escAttr(k)}">${escHtml(label)}${unit ? " ("+unit+")" : ""}</option>`;
    }).join("");

    // map + charts
    initMap();
    initCharts();

    // events
    [fMedium,fLocal,fPonto,fCompartimento,fTratamento,fEstadoSolo,fPeriodo,fVariable,fDateStart,fDateEnd].forEach(x=>{
      x.addEventListener("change", renderAll);
    });
    document.querySelectorAll(".chip").forEach(ch=>{
      ch.addEventListener("click", ()=>{
        applyRange(ch.dataset.range);
        renderAll();
      });
    });
    btnReset.addEventListener("click", ()=>{
      fMedium.value="all";
      fLocal.value="all";
      fPonto.value="all";
      fCompartimento.value="all";
      fTratamento.value="all";
      fEstadoSolo.value="all";
      fPeriodo.value="all";
      fVariable.value="co2_flux";
      fDateStart.value = toDateInput(minTs);
      fDateEnd.value = toDateInput(maxTs);
      tblSearch.value = "";
      renderAll();
    });
    btnDownloadCSV.addEventListener("click", ()=>{
      downloadCSV(getFiltered(), "co2_pantanal_recorte.csv");
    });
    tblSearch.addEventListener("input", ()=>renderTable(getFiltered()));

    // initial
    renderAll();
  }

  function initMap(){
    map = L.map("map", { zoomControl:true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
    const bounds = L.latLngBounds(rowsAll.map(r=>[r.lat,r.lon]));
    map.fitBounds(bounds.pad(0.2));
  }

  function initCharts(){
    chartTS = new Chart(document.getElementById("chartTS"), {
      type:"line",
      data:{ datasets:[] },
      options:{
        responsive:true,
        parsing:false,
        interaction:{ mode:"nearest", intersect:false },
        plugins:{
          legend:{ labels:{ color:"#eaf0ff" } },
          tooltip:{
            callbacks:{
              label: (c)=>{
                const v = c.raw?.y;
                const k = fVariable.value;
                const u = unitOf(k);
                return ` ${c.dataset.label}: ${fmt(v)}${u ? " "+u : ""}`;
              }
            }
          }
        },
        scales:{
          x:{ type:"time", time:{ tooltipFormat:"dd/MM/yyyy" },
              ticks:{ color:"rgba(234,240,255,.75)" }, grid:{ color:"rgba(255,255,255,.08)" } },
          y:{ ticks:{ color:"rgba(234,240,255,.75)" }, grid:{ color:"rgba(255,255,255,.08)" } }
        }
      }
    });

    chartHist = new Chart(document.getElementById("chartHist"), {
      type:"bar",
      data:{ labels:[], datasets:[{ label:"Frequência", data:[] }]},
      options:{
        responsive:true,
        plugins:{ legend:{ labels:{ color:"#eaf0ff" } } },
        scales:{
          x:{ ticks:{ color:"rgba(234,240,255,.75)" }, grid:{ color:"rgba(255,255,255,.08)" } },
          y:{ ticks:{ color:"rgba(234,240,255,.75)" }, grid:{ color:"rgba(255,255,255,.08)" } }
        }
      }
    });
  }

  function renderAll(){
    const rows = getFiltered();
    renderKPIs(rows);
    renderCompare(rows);
    renderMap(rows);
    renderCharts(rows);
    renderTable(rows);
  }

  function getFiltered(){
    const medium = fMedium.value;
    const local = fLocal.value;
    const ponto = fPonto.value;
    const compart = fCompartimento.value;
    const trat = fTratamento.value;
    const estado = fEstadoSolo.value;
    const periodo = fPeriodo.value;

    const start = toTime(fDateStart.value ? `${fDateStart.value}T00:00:00` : null);
    const end = toTime(fDateEnd.value ? `${fDateEnd.value}T23:59:59` : null);

    return rowsAll.filter(r=>{
      if(medium !== "all" && r.medium !== medium) return false;
      if(local !== "all" && r.local !== local) return false;
      if(ponto !== "all" && r.ponto !== ponto) return false;
      if(compart !== "all" && (r.compartimento || "") !== compart) return false;
      if(trat !== "all" && (r.tratamento || "") !== trat) return false;
      if(estado !== "all" && (r.estado_do_solo || "") !== estado) return false;
      if(periodo !== "all" && (r.periodo_sazonal || "") !== periodo) return false;
      if(Number.isFinite(start) && r._ts < start) return false;
      if(Number.isFinite(end) && r._ts > end) return false;
      return true;
    });
  }

  function renderKPIs(rows){
    kpiN.textContent = String(rows.length);

    const co2 = rows.map(r=>r.co2_flux).filter(Number.isFinite);
    const unit = unitOf("co2_flux");
    kpiCo2Unit.textContent = unit ? `(${unit})` : "";

    if(!co2.length){
      kpiCo2Mean.textContent = "—";
      kpiCo2Max.textContent = "—";
      kpiCo2Min.textContent = "—";
      kpiCo2MaxMeta.textContent = "—";
      kpiCo2MinMeta.textContent = "—";
      return;
    }

    kpiCo2Mean.textContent = fmt(avg(co2));

    const rMax = rows.reduce((best, r)=>{
      if(!Number.isFinite(r.co2_flux)) return best;
      if(!best || r.co2_flux > best.co2_flux) return r;
      return best;
    }, null);

    const rMin = rows.reduce((best, r)=>{
      if(!Number.isFinite(r.co2_flux)) return best;
      if(!best || r.co2_flux < best.co2_flux) return r;
      return best;
    }, null);

    if(rMax){
      kpiCo2Max.textContent = fmt(rMax.co2_flux);
      kpiCo2MaxMeta.textContent = `${prettyDT(rMax.dt)} • ${rMax.medium} • ${rMax.local || ""} • ${rMax.ponto || ""}`;
    }
    if(rMin){
      kpiCo2Min.textContent = fmt(rMin.co2_flux);
      kpiCo2MinMeta.textContent = `${prettyDT(rMin.dt)} • ${rMin.medium} • ${rMin.local || ""} • ${rMin.ponto || ""}`;
    }
  }

  function renderCompare(rows){
    const unit = unitOf("co2_flux");
    const soil = rows.filter(r=>r.medium==="soil" && Number.isFinite(r.co2_flux)).map(r=>r.co2_flux);
    const water= rows.filter(r=>r.medium==="water"&& Number.isFinite(r.co2_flux)).map(r=>r.co2_flux);

    cmpSoil.textContent = soil.length ? `${fmt(avg(soil))}${unit ? " "+unit : ""}` : "—";
    cmpWater.textContent = water.length ? `${fmt(avg(water))}${unit ? " "+unit : ""}` : "—";
  }

  function renderMap(rows){
    markerLayer.clearLayers();

    // group by medium+local+ponto (mantém solo/água separados se tiver mesma coord)
    const groups = groupBy(rows, r=>`${r.medium}||${r.local||""}||${r.ponto||""}`);

    Object.values(groups).forEach(g=>{
      const any = g[0];
      const stats = summarize(g);

      const tooltip = `
        <div style="min-width:260px">
          <div style="font-weight:900; font-size:14px; margin-bottom:6px;">
            ${escHtml(any.local || "—")} • ${escHtml(any.ponto || "—")} • ${escHtml(any.medium)}
          </div>
          <div style="opacity:.92; font-size:12px; line-height:1.25">
            <b>N:</b> ${g.length}<br/>
            <b>CO₂ flux (média):</b> ${fmt(stats.mean)} ${unitOf("co2_flux") || ""}<br/>
            <b>CO₂ flux (min–max):</b> ${fmt(stats.min)} – ${fmt(stats.max)} ${unitOf("co2_flux") || ""}<br/>
            <b>Última data:</b> ${escHtml(stats.lastDt || "—")}<br/>
            ${any.medium==="water" ? `<b>Compartimento:</b> ${escHtml(any.compartimento || "—")}<br/>` : ""}
            ${any.medium==="soil" ? `<b>Estado do solo:</b> ${escHtml(any.estado_do_solo || "—")}<br/>` : ""}
            <b>Tratamento:</b> ${escHtml(any.tratamento || "—")}
          </div>
        </div>
      `;

      const popup = buildPopup(g);

      const marker = L.circleMarker([any.lat, any.lon], {
        radius: 7,
        weight: 1.5,
        opacity: 0.95,
        fillOpacity: 0.65
      });

      marker.bindTooltip(tooltip, { sticky:true, direction:"top", opacity:0.98 });
      marker.bindPopup(popup, { maxWidth: 360 });
      marker.addTo(markerLayer);
    });

    if(rows.length){
      const bounds = L.latLngBounds(rows.map(r=>[r.lat,r.lon]));
      map.fitBounds(bounds.pad(0.2));
    }
  }

  function buildPopup(groupRows){
    const last = groupRows.slice().sort((a,b)=>b._ts-a._ts).slice(0,6);
    const k = fVariable.value;
    const u = unitOf(k);

    const lines = last.map(r=>{
      const co2 = Number.isFinite(r.co2_flux) ? fmt(r.co2_flux) : "—";
      const vv = Number.isFinite(r[k]) ? fmt(r[k]) : "—";
      return `<tr>
        <td style="padding:6px 8px; border-bottom:1px solid rgba(0,0,0,.08)">${escHtml(prettyDT(r.dt))}</td>
        <td style="padding:6px 8px; border-bottom:1px solid rgba(0,0,0,.08)">${co2}</td>
        <td style="padding:6px 8px; border-bottom:1px solid rgba(0,0,0,.08)">${vv}</td>
      </tr>`;
    }).join("");

    return `
      <div style="font-family: ui-sans-serif, system-ui; font-size:12px;">
        <div style="font-weight:900; margin-bottom:8px;">Últimas coletas (ponto selecionado)</div>
        <table style="border-collapse:collapse; width:100%;">
          <thead>
            <tr>
              <th style="text-align:left; padding:6px 8px; border-bottom:1px solid rgba(0,0,0,.12)">Data</th>
              <th style="text-align:left; padding:6px 8px; border-bottom:1px solid rgba(0,0,0,.12)">CO₂ flux</th>
              <th style="text-align:left; padding:6px 8px; border-bottom:1px solid rgba(0,0,0,.12)">${escHtml(labelOf(k))}${u ? " ("+u+")" : ""}</th>
            </tr>
          </thead>
          <tbody>${lines}</tbody>
        </table>
        <div style="opacity:.75; margin-top:6px;">Dica: use os filtros para recortes finos.</div>
      </div>
    `;
  }

  function renderCharts(rows){
    const k = fVariable.value;
    const label = labelOf(k);
    const u = unitOf(k);

    const soil = rows.filter(r=>r.medium==="soil" && Number.isFinite(r[k]))
      .sort((a,b)=>a._ts-b._ts).map(r=>({x:r._ts, y:r[k]}));
    const water = rows.filter(r=>r.medium==="water" && Number.isFinite(r[k]))
      .sort((a,b)=>a._ts-b._ts).map(r=>({x:r._ts, y:r[k]}));

    chartTS.data.datasets = [
      { label:`Solo — ${label}`, data:soil, tension:0.15, pointRadius:2, borderWidth:2 },
      { label:`Água — ${label}`, data:water, tension:0.15, pointRadius:2, borderWidth:2 }
    ];
    chartTS.update();

    const vals = rows.map(r=>r[k]).filter(Number.isFinite);
    const hist = histogram(vals, 12);

    chartHist.data.labels = hist.labels;
    chartHist.data.datasets[0].label = `${label}${u ? " ("+u+")" : ""}`;
    chartHist.data.datasets[0].data = hist.counts;
    chartHist.update();
  }

  function renderTable(rows){
    const q = (tblSearch.value || "").trim().toLowerCase();

    const cols = tableColumns(rowsAll);
    tblHead.innerHTML = `<tr>${cols.map(c=>`<th>${escHtml(labelOf(c))}</th>`).join("")}</tr>`;

    const filtered = !q ? rows : rows.filter(r=>{
      const s = cols.map(c=>String(r[c] ?? "")).join(" ").toLowerCase();
      return s.includes(q);
    });

    const out = filtered.slice().sort((a,b)=>a._ts-b._ts).map(r=>{
      return `<tr>${cols.map(c=>`<td>${formatCell(c, r[c])}</td>`).join("")}</tr>`;
    }).join("");

    tblBody.innerHTML = out;
    tblInfo.textContent = `Mostrando ${filtered.length} de ${rows.length} (recorte atual)`;
  }

  function tableColumns(allRows){
    // base order
    const base = [
      "dt","medium","local","ponto","compartimento","periodo_sazonal","tratamento","estado_do_solo",
      "replica","camara","co2_flux","ph","temperatura","agua_c","od_mg_l","cond_c_cm","od_pct","materia_organica","autor"
    ];
    const present = new Set(Object.keys(allRows[0] || {}));
    // add any other keys from meta/dataset, keeping stable order
    const extra = uniq(allRows.flatMap(r=>Object.keys(r)))
      .filter(k=>!base.includes(k) && !k.startsWith("_") && k!=="id" && k!=="lat" && k!=="lon")
      .sort();

    return base.filter(k=>present.has(k) || allRows.some(r=>r[k]!==undefined))
      .concat(extra);
  }

  // --- utilities ---
  function applyRange(r){
    const maxTs = Math.max(...rowsAll.map(x=>x._ts));
    if(r === "all"){
      fDateStart.value = toDateInput(Math.min(...rowsAll.map(x=>x._ts)));
      fDateEnd.value = toDateInput(maxTs);
      return;
    }
    const days = Number(r);
    const start = maxTs - days*24*60*60*1000;
    fDateStart.value = toDateInput(start);
    fDateEnd.value = toDateInput(maxTs);
  }

  function detectNumericKeys(rows){
    const keys = uniq(rows.flatMap(r=>Object.keys(r)));
    return keys.filter(k=>{
      if(k.startsWith("_")) return false;
      if(["lat","lon"].includes(k)) return false;
      if(["id","dt","medium","autor","local","ponto","tratamento","estado_do_solo","periodo_sazonal","compartimento","replica","camara"].includes(k)) return false;
      // numeric if any finite value exists
      return rows.some(r=>Number.isFinite(r[k]));
    }).sort();
  }

  function summarize(rows){
    const co2 = rows.map(r=>r.co2_flux).filter(Number.isFinite);
    const mean = co2.length ? avg(co2) : NaN;
    const min = co2.length ? Math.min(...co2) : NaN;
    const max = co2.length ? Math.max(...co2) : NaN;
    const last = rows.slice().sort((a,b)=>b._ts-a._ts)[0];
    return {mean,min,max,lastDt:last ? prettyDT(last.dt) : null};
  }

  function histogram(values, bins=10){
    if(!values.length) return {labels:[], counts:[]};
    const vmin = Math.min(...values);
    const vmax = Math.max(...values);
    if(vmin === vmax) return {labels:[fmt(vmin)], counts:[values.length]};
    const w = (vmax - vmin) / bins;
    const counts = Array.from({length:bins}, ()=>0);
    values.forEach(v=>{
      let i = Math.floor((v - vmin)/w);
      if(i>=bins) i=bins-1;
      if(i<0) i=0;
      counts[i]++;
    });
    const labels = counts.map((_,i)=>{
      const a = vmin + i*w;
      const b = vmin + (i+1)*w;
      return `${fmt(a)}–${fmt(b)}`;
    });
    return {labels, counts};
  }

  function downloadCSV(rows, filename){
    const cols = tableColumns(rowsAll).concat(["lat","lon"]).filter((v,i,a)=>a.indexOf(v)===i);
    const header = cols.join(",");
    const lines = [header];

    rows.forEach(r=>{
      const vals = cols.map(c=>{
        const v = r[c];
        if(v === null || v === undefined) return "";
        const s = String(v).replaceAll('"','""');
        return (s.includes(",") || s.includes("\n")) ? `"${s}"` : s;
      });
      lines.push(vals.join(","));
    });

    const blob = new Blob([lines.join("\n")], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function fillSelect(selectEl, items){
    const opts = items.map(v=>`<option value="${escAttr(v)}">${escHtml(v)}</option>`).join("");
    selectEl.insertAdjacentHTML("beforeend", opts);
  }

  function uniq(arr){
    return Array.from(new Set(arr.filter(v=>v!==null && v!==undefined && String(v).trim()!=="")));
  }

  function groupBy(arr, keyFn){
    return arr.reduce((acc, x)=>{
      const k = keyFn(x);
      (acc[k] ||= []).push(x);
      return acc;
    }, {});
  }

  function labelOf(k){
    if(META.labels && META.labels[k]) return META.labels[k];
    // fallback: pretty
    return k.replaceAll("_"," ").replace(/\b\w/g, m=>m.toUpperCase());
  }
  function unitOf(k){
    return (META.units && META.units[k]) ? META.units[k] : "";
  }

  function formatCell(col, val){
    if(val === null || val === undefined) return "";
    if(col === "dt") return escHtml(prettyDT(val));
    if(Number.isFinite(val)) return escHtml(fmt(val));
    return escHtml(String(val));
  }

  function $(sel){ return document.querySelector(sel); }
  function toNum(x){
    if(x === null || x === undefined || x === "") return NaN;
    const s = String(x).replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  function avg(a){ return a.reduce((s,v)=>s+v,0)/a.length; }
  function fmt(v){
    if(!Number.isFinite(v)) return "—";
    const abs = Math.abs(v);
    if(abs >= 100) return v.toFixed(1);
    if(abs >= 10) return v.toFixed(2);
    return v.toFixed(3);
  }

  function toTime(dt){
    if(!dt) return NaN;
    const t = Date.parse(dt);
    return Number.isFinite(t) ? t : NaN;
  }
  function toDateInput(ts){
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const da = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${da}`;
  }
  function prettyDT(dt){
    const t = Date.parse(dt);
    if(!Number.isFinite(t)) return String(dt);
    const d = new Date(t);
    const dd = String(d.getDate()).padStart(2,"0");
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2,"0");
    const mi = String(d.getMinutes()).padStart(2,"0");
    return `${dd}/${mm}/${yy} ${hh}:${mi}`;
  }

  function escHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
  function escAttr(s){ return String(s ?? "").replaceAll('"',"&quot;"); }
})();
