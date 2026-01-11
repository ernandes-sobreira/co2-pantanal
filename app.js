// app.js
(function(){
  "use strict";

  const dataRaw = (window.CO2_DATA || []).map(d => ({
    ...d,
    _ts: toTime(d.dt),
    lat: +d.lat,
    lon: +d.lon,
    co2_flux: num(d.co2_flux),
    temp_air: num(d.temp_air),
    temp_water: num(d.temp_water),
    temp_soil: num(d.temp_soil),
    rh: num(d.rh),
    soil_moisture: num(d.soil_moisture),
    water_depth: num(d.water_depth),
    site: (d.site ?? "").toString(),
    medium: (d.medium ?? "").toString(),
    compartment: (d.compartment ?? "").toString(),
    notes: (d.notes ?? "").toString(),
  })).filter(d => isFinite(d.lat) && isFinite(d.lon) && isFinite(d._ts));

  const UNITS = window.CO2_UNITS || {};

  // Elements
  const fMedium = el("#fMedium");
  const fCompartment = el("#fCompartment");
  const fSite = el("#fSite");
  const fVariable = el("#fVariable");
  const fDateStart = el("#fDateStart");
  const fDateEnd = el("#fDateEnd");
  const btnReset = el("#btnReset");
  const btnDownloadCSV = el("#btnDownloadCSV");

  const kpiN = el("#kpiN");
  const kpiMean = el("#kpiMean");
  const kpiMeanUnit = el("#kpiMeanUnit");
  const kpiMax = el("#kpiMax");
  const kpiMaxMeta = el("#kpiMaxMeta");
  const kpiMin = el("#kpiMin");
  const kpiMinMeta = el("#kpiMinMeta");

  const cmpSoil = el("#cmpSoil");
  const cmpWater = el("#cmpWater");

  const tblBody = el("#tblBody");
  const tblSearch = el("#tblSearch");
  const tblInfo = el("#tblInfo");

  // Map
  let map, markerLayer;

  // Charts
  let chartTS, chartHist;

  init();

  function init(){
    if(!dataRaw.length){
      alert("CO2_DATA vazio. Cole seus dados no arquivo data.js");
      return;
    }

    initFilterOptions();
    initMap();
    initCharts();

    // Default date range from data
    const minTs = Math.min(...dataRaw.map(d=>d._ts));
    const maxTs = Math.max(...dataRaw.map(d=>d._ts));
    fDateStart.value = toDateInput(minTs);
    fDateEnd.value = toDateInput(maxTs);

    // Events
    [fMedium,fCompartment,fSite,fVariable,fDateStart,fDateEnd].forEach(x=>{
      x.addEventListener("change", renderAll);
    });

    document.querySelectorAll(".chip").forEach(ch=>{
      ch.addEventListener("click", ()=>{
        const r = ch.dataset.range;
        applyRange(r);
        renderAll();
      });
    });

    btnReset.addEventListener("click", ()=>{
      fMedium.value="all";
      fCompartment.value="all";
      fSite.value="all";
      fVariable.value="co2_flux";
      fDateStart.value = toDateInput(minTs);
      fDateEnd.value = toDateInput(maxTs);
      tblSearch.value = "";
      renderAll();
    });

    btnDownloadCSV.addEventListener("click", ()=>{
      const rows = getFiltered();
      downloadCSV(rows, "co2_pantanal_recorte.csv");
    });

    tblSearch.addEventListener("input", ()=> renderTable(getFiltered()));

    renderAll();
  }

  function initFilterOptions(){
    fillSelect(fCompartment, uniq(dataRaw.map(d=>d.compartment)).sort());
    fillSelect(fSite, uniq(dataRaw.map(d=>d.site)).sort());
  }

  function initMap(){
    map = L.map("map", { zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);

    // Fit to points
    const bounds = L.latLngBounds(dataRaw.map(d=>[d.lat,d.lon]));
    map.fitBounds(bounds.pad(0.2));
  }

  function initCharts(){
    const ctxTS = document.getElementById("chartTS");
    chartTS = new Chart(ctxTS, {
      type: "line",
      data: { datasets: [] },
      options: {
        responsive:true,
        parsing:false,
        interaction:{ mode:"nearest", intersect:false },
        plugins:{
          legend:{ labels:{ color:"#eaf0ff" } },
          tooltip:{
            callbacks:{
              label: (c)=>{
                const v = c.raw?.y;
                const varKey = fVariable.value;
                const unit = UNITS[varKey] ? ` ${UNITS[varKey]}` : "";
                return ` ${c.dataset.label}: ${fmt(v)}${unit}`;
              }
            }
          }
        },
        scales:{
          x: {
            type:"time",
            time: { tooltipFormat: "dd/MM/yyyy HH:mm" },
            ticks:{ color:"rgba(234,240,255,.75)" },
            grid:{ color:"rgba(255,255,255,.08)" }
          },
          y: {
            ticks:{ color:"rgba(234,240,255,.75)" },
            grid:{ color:"rgba(255,255,255,.08)" }
          }
        }
      }
    });

    const ctxH = document.getElementById("chartHist");
    chartHist = new Chart(ctxH, {
      type: "bar",
      data: { labels: [], datasets: [{ label:"Frequência", data: [] }] },
      options:{
        responsive:true,
        plugins:{
          legend:{ labels:{ color:"#eaf0ff" } }
        },
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
    const comp = fCompartment.value;
    const site = fSite.value;

    const start = toTime(fDateStart.value ? `${fDateStart.value}T00:00:00` : null);
    const end   = toTime(fDateEnd.value ? `${fDateEnd.value}T23:59:59` : null);

    return dataRaw.filter(d=>{
      if(medium !== "all" && d.medium !== medium) return false;
      if(comp !== "all" && d.compartment !== comp) return false;
      if(site !== "all" && d.site !== site) return false;
      if(isFinite(start) && d._ts < start) return false;
      if(isFinite(end) && d._ts > end) return false;
      return true;
    });
  }

  function renderKPIs(rows){
    kpiN.textContent = rows.length.toString();

    const unit = UNITS.co2_flux ? `(${UNITS.co2_flux})` : "";
    kpiMeanUnit.textContent = unit;

    const co2 = rows.map(r=>r.co2_flux).filter(isFinite);
    if(!co2.length){
      kpiMean.textContent = "—";
      kpiMax.textContent = "—";
      kpiMin.textContent = "—";
      kpiMaxMeta.textContent = "—";
      kpiMinMeta.textContent = "—";
      return;
    }

    const mean = co2.reduce((a,b)=>a+b,0)/co2.length;
    kpiMean.textContent = fmt(mean);

    const rMax = rows.reduce((best, r)=>{
      if(!isFinite(r.co2_flux)) return best;
      if(!best || r.co2_flux > best.co2_flux) return r;
      return best;
    }, null);

    const rMin = rows.reduce((best, r)=>{
      if(!isFinite(r.co2_flux)) return best;
      if(!best || r.co2_flux < best.co2_flux) return r;
      return best;
    }, null);

    if(rMax){
      kpiMax.textContent = fmt(rMax.co2_flux);
      kpiMaxMeta.textContent = `${prettyDT(rMax.dt)} • ${rMax.site} • ${rMax.medium} • ${rMax.compartment}`;
    }
    if(rMin){
      kpiMin.textContent = fmt(rMin.co2_flux);
      kpiMinMeta.textContent = `${prettyDT(rMin.dt)} • ${rMin.site} • ${rMin.medium} • ${rMin.compartment}`;
    }
  }

  function renderCompare(rows){
    const soil = rows.filter(r=>r.medium==="soil" && isFinite(r.co2_flux)).map(r=>r.co2_flux);
    const water= rows.filter(r=>r.medium==="water"&& isFinite(r.co2_flux)).map(r=>r.co2_flux);

    const unit = UNITS.co2_flux ? ` ${UNITS.co2_flux}` : "";
    cmpSoil.textContent = soil.length ? `${fmt(avg(soil))}${unit}` : "—";
    cmpWater.textContent = water.length ? `${fmt(avg(water))}${unit}` : "—";
  }

  function renderMap(rows){
    markerLayer.clearLayers();

    // Agrega por site (para não ficar 2000 marcadores)
    const bySite = groupBy(rows, r=>r.site || "—");

    Object.keys(bySite).forEach(site=>{
      const g = bySite[site];
      const any = g[0];
      const lat = any.lat, lon = any.lon;

      const stats = summarize(g);

      const html = `
        <div style="min-width:240px">
          <div style="font-weight:800; font-size:14px; margin-bottom:6px;">${escapeHtml(site)}</div>
          <div style="opacity:.9; font-size:12px; margin-bottom:6px;">
            <b>Compartimento:</b> ${escapeHtml(any.compartment || "—")}<br/>
            <b>Coletas (N):</b> ${g.length}<br/>
            <b>CO₂ flux (média):</b> ${fmt(stats.mean)} ${UNITS.co2_flux || ""}<br/>
            <b>CO₂ flux (min–max):</b> ${fmt(stats.min)} – ${fmt(stats.max)} ${UNITS.co2_flux || ""}
          </div>
          <div style="opacity:.8; font-size:12px;">
            <b>Última data:</b> ${escapeHtml(stats.lastDt || "—")}<br/>
            <b>Meios:</b> ${escapeHtml(stats.media.join(", ") || "—")}
          </div>
        </div>
      `;

      const marker = L.circleMarker([lat, lon], {
        radius: 7,
        weight: 1.5,
        opacity: 0.9,
        fillOpacity: 0.65
      });

      marker.bindTooltip(html, { sticky:true, direction:"top", opacity:0.98 });
      marker.addTo(markerLayer);
    });

    // Refit
    if(rows.length){
      const bounds = L.latLngBounds(rows.map(d=>[d.lat,d.lon]));
      map.fitBounds(bounds.pad(0.2));
    }
  }

  function renderCharts(rows){
    const varKey = fVariable.value;
    const unit = UNITS[varKey] ? ` (${UNITS[varKey]})` : "";

    // Série temporal por meio (soil vs water)
    const soil = rows
      .filter(r=>r.medium==="soil" && isFinite(r[varKey]))
      .sort((a,b)=>a._ts-b._ts)
      .map(r=>({ x:r._ts, y:r[varKey], meta:r }));

    const water = rows
      .filter(r=>r.medium==="water" && isFinite(r[varKey]))
      .sort((a,b)=>a._ts-b._ts)
      .map(r=>({ x:r._ts, y:r[varKey], meta:r }));

    chartTS.data.datasets = [
      { label: `Solo — ${labelOf(varKey)}${unit}`, data: soil, tension:0.15, pointRadius:2, borderWidth:2 },
      { label: `Água — ${labelOf(varKey)}${unit}`, data: water, tension:0.15, pointRadius:2, borderWidth:2 }
    ];
    chartTS.update();

    // Histograma simples (todos os valores da variável)
    const vals = rows.map(r=>r[varKey]).filter(isFinite);
    const hist = histogram(vals, 12);
    chartHist.data.labels = hist.labels;
    chartHist.data.datasets[0].label = `Frequência — ${labelOf(varKey)}${unit}`;
    chartHist.data.datasets[0].data = hist.counts;
    chartHist.update();
  }

  function renderTable(rows){
    const q = (tblSearch.value || "").trim().toLowerCase();

    const filtered = !q ? rows : rows.filter(r=>{
      const s = [
        r.dt, r.site, r.medium, r.compartment, r.notes
      ].join(" ").toLowerCase();
      return s.includes(q);
    });

    tblBody.innerHTML = filtered
      .sort((a,b)=>a._ts-b._ts)
      .map(r=>{
        return `
          <tr>
            <td>${escapeHtml(prettyDT(r.dt))}</td>
            <td>${escapeHtml(r.site)}</td>
            <td>${escapeHtml(r.medium)}</td>
            <td>${escapeHtml(r.compartment)}</td>
            <td>${fmtCell(r.co2_flux)}</td>
            <td>${fmtCell(r.temp_air)}</td>
            <td>${fmtCell(r.rh)}</td>
            <td>${fmtCell(r.temp_water)}</td>
            <td>${fmtCell(r.temp_soil)}</td>
            <td>${escapeHtml(r.notes || "")}</td>
          </tr>
        `;
      }).join("");

    tblInfo.textContent = `Mostrando ${filtered.length} de ${rows.length} (no recorte atual)`;
  }

  // ---------- helpers ----------
  function applyRange(r){
    const maxTs = Math.max(...dataRaw.map(d=>d._ts));
    if(r === "all"){
      fDateStart.value = toDateInput(Math.min(...dataRaw.map(d=>d._ts)));
      fDateEnd.value = toDateInput(maxTs);
      return;
    }
    const days = +r;
    const start = maxTs - days*24*60*60*1000;
    fDateStart.value = toDateInput(start);
    fDateEnd.value = toDateInput(maxTs);
  }

  function summarize(rows){
    const co2 = rows.map(r=>r.co2_flux).filter(isFinite);
    const mean = co2.length ? avg(co2) : NaN;
    const min = co2.length ? Math.min(...co2) : NaN;
    const max = co2.length ? Math.max(...co2) : NaN;

    const last = rows.slice().sort((a,b)=>b._ts-a._ts)[0];
    const media = uniq(rows.map(r=>r.medium)).sort();

    return { mean, min, max, lastDt: last ? prettyDT(last.dt) : null, media };
  }

  function histogram(values, bins=10){
    if(!values.length) return { labels:[], counts:[] };
    const vmin = Math.min(...values);
    const vmax = Math.max(...values);
    if(vmin === vmax){
      return { labels:[`${fmt(vmin)}`], counts:[values.length] };
    }
    const width = (vmax - vmin) / bins;
    const counts = Array.from({length:bins}, ()=>0);
    values.forEach(v=>{
      let idx = Math.floor((v - vmin)/width);
      if(idx >= bins) idx = bins-1;
      if(idx < 0) idx = 0;
      counts[idx]++;
    });
    const labels = counts.map((_,i)=>{
      const a = vmin + i*width;
      const b = vmin + (i+1)*width;
      return `${fmt(a)}–${fmt(b)}`;
    });
    return { labels, counts };
  }

  function downloadCSV(rows, filename){
    const headers = ["id","dt","site","lat","lon","medium","compartment","co2_flux","temp_air","rh","temp_water","temp_soil","soil_moisture","water_depth","notes"];
    const lines = [headers.join(",")];

    rows.forEach(r=>{
      const vals = headers.map(h=>{
        const v = r[h];
        if(v === null || v === undefined) return "";
        const s = String(v).replaceAll('"','""');
        // força aspas se tiver vírgula ou quebra de linha
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
    const opts = items.map(v=>`<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join("");
    selectEl.insertAdjacentHTML("beforeend", opts);
  }

  function groupBy(arr, keyFn){
    return arr.reduce((acc, x)=>{
      const k = keyFn(x);
      (acc[k] ||= []).push(x);
      return acc;
    }, {});
  }

  function uniq(arr){
    return Array.from(new Set(arr.filter(v=>v!==null && v!==undefined && String(v).trim()!=="")));
  }

  function labelOf(k){
    const map = {
      co2_flux: "CO₂ flux",
      temp_air: "Temperatura do ar",
      temp_water: "Temperatura da água",
      temp_soil: "Temperatura do solo",
      rh: "Umidade relativa",
      soil_moisture: "Umidade do solo",
      water_depth: "Profundidade água"
    };
    return map[k] || k;
  }

  function el(sel){ return document.querySelector(sel); }
  function num(x){
    if(x === null || x === undefined || x === "") return NaN;
    const v = Number(String(x).replace(",", "."));
    return Number.isFinite(v) ? v : NaN;
  }
  function avg(a){ return a.reduce((s,v)=>s+v,0)/a.length; }
  function fmt(v){
    if(!isFinite(v)) return "—";
    const abs = Math.abs(v);
    if(abs >= 100) return v.toFixed(1);
    if(abs >= 10) return v.toFixed(2);
    return v.toFixed(3);
  }
  function fmtCell(v){ return isFinite(v) ? fmt(v) : ""; }

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
    if(!Number.isFinite(t)) return dt || "";
    const d = new Date(t);
    const dd = String(d.getDate()).padStart(2,"0");
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2,"0");
    const mi = String(d.getMinutes()).padStart(2,"0");
    return `${dd}/${mm}/${yy} ${hh}:${mi}`;
  }

  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
  function escapeAttr(s){
    return String(s ?? "").replaceAll('"',"&quot;");
  }
})();
