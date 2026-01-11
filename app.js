
(function(){
  "use strict";

  const DATA = Array.isArray(window.CO2_DATA) ? window.CO2_DATA : [];
  const META = window.CO2_META || { units:{}, labels:{} };

  const statusMsg = q("#statusMsg");

  if(!DATA.length){
    setStatus("Nenhum dado encontrado em data.js (window.CO2_DATA vazio).", true);
    return;
  }

  // Normalize + parse
  const rowsAll = DATA.map((d, idx)=>({
    ...d,
    id: str(d.id || idx),
    medium: str(d.medium),
    autor: str(d.autor),
    local: str(d.local),
    ponto: str(d.ponto),
    tratamento: str(d.tratamento),
    estado_solo: str(d.estado_solo),
    periodo_sazonal: str(d.periodo_sazonal),
    compartimento: str(d.compartimento),
    lat: toNum(d.lat),
    lon: toNum(d.lon),
    _ts: toTime(d.dt),
  })).filter(r => isFinite(r.lat) && isFinite(r.lon) && isFinite(r._ts));

  if(!rowsAll.length){
    setStatus("Dados carregaram, mas nenhuma linha tem lat/lon/dt válidos. Confira data.js.", true);
    return;
  }

  // Elements
  const fMedium = q("#fMedium");
  const fLocal = q("#fLocal");
  const fPonto = q("#fPonto");
  const fCompartimento = q("#fCompartimento");
  const fTratamento = q("#fTratamento");
  const fEstadoSolo = q("#fEstadoSolo");
  const fPeriodoSazonal = q("#fPeriodoSazonal");
  const fVariable = q("#fVariable");
  const fDateStart = q("#fDateStart");
  const fDateEnd = q("#fDateEnd");

  const btnApply = q("#btnApply");
  const btnReset = q("#btnReset");
  const btnDownloadCSV = q("#btnDownloadCSV");

  const kpiN = q("#kpiN");
  const kpiMean = q("#kpiMean");
  const kpiMeanUnit = q("#kpiMeanUnit");
  const kpiMax = q("#kpiMax");
  const kpiMaxMeta = q("#kpiMaxMeta");
  const kpiMin = q("#kpiMin");
  const kpiMinMeta = q("#kpiMinMeta");
  const cmpSoil = q("#cmpSoil");
  const cmpWater = q("#cmpWater");

  const tblHead = q("#tblHead");
  const tblBody = q("#tblBody");
  const tblSearch = q("#tblSearch");
  const tblInfo = q("#tblInfo");

  // Map
  let map, markerLayer;

  // Charts
  let chartTS, chartHist;

  // Numeric variables (auto)
  const numericVars = detectNumericVars(rowsAll).filter(k => !["lat","lon","_ts"].includes(k));
  // Prefer CO2 first
  numericVars.sort((a,b)=>{
    if(a==="co2_flux") return -1;
    if(b==="co2_flux") return 1;
    return a.localeCompare(b);
  });

  // Init
  initFilters();
  initMap();
  initCharts();
  initTableHeader();

  // Set default variable
  fillVariableSelect();

  // Default date range
  const minTs = Math.min(...rowsAll.map(r=>r._ts));
  const maxTs = Math.max(...rowsAll.map(r=>r._ts));
  fDateStart.value = toDateInput(minTs);
  fDateEnd.value = toDateInput(maxTs);

  // Events
  btnApply.addEventListener("click", renderAll);
  btnReset.addEventListener("click", ()=>{
    fMedium.value="all";
    fLocal.value="all";
    fPonto.value="all";
    fCompartimento.value="all";
    fTratamento.value="all";
    fEstadoSolo.value="all";
    fPeriodoSazonal.value="all";
    fVariable.value="co2_flux";
    fDateStart.value = toDateInput(minTs);
    fDateEnd.value = toDateInput(maxTs);
    tblSearch.value="";
    renderAll();
  });

  btnDownloadCSV.addEventListener("click", ()=>{
    const rows = getFiltered();
    downloadCSV(rows, "co2_pantanal_recorte.csv");
  });

  [fMedium,fLocal,fPonto,fCompartimento,fTratamento,fEstadoSolo,fPeriodoSazonal,fVariable,fDateStart,fDateEnd].forEach(el=>{
    el.addEventListener("change", renderAll);
  });

  document.querySelectorAll(".chip").forEach(ch=>{
    ch.addEventListener("click", ()=>{
      applyRange(ch.dataset.range, maxTs, minTs);
      renderAll();
    });
  });

  tblSearch.addEventListener("input", ()=>renderTable(getFiltered()));

  // First render
  renderAll();

  function initFilters(){
    fillSelect(fLocal, uniq(rowsAll.map(r=>r.local)).sort());
    fillSelect(fPonto, uniq(rowsAll.map(r=>r.ponto)).sort());
    fillSelect(fCompartimento, uniq(rowsAll.map(r=>r.compartimento)).sort());
    fillSelect(fTratamento, uniq(rowsAll.map(r=>r.tratamento)).sort());
    fillSelect(fEstadoSolo, uniq(rowsAll.map(r=>r.estado_solo)).sort());
    fillSelect(fPeriodoSazonal, uniq(rowsAll.map(r=>r.periodo_sazonal)).sort());
  }

  function fillVariableSelect(){
    fVariable.innerHTML = "";
    const opts = numericVars.map(k=>{
      const label = META.labels?.[k] || niceLabel(k);
      const unit = META.units?.[k] ? ` (${META.units[k]})` : "";
      return `<option value="${escapeAttr(k)}">${escapeHtml(label)}${escapeHtml(unit)}</option>`;
    }).join("");
    fVariable.insertAdjacentHTML("beforeend", opts);

    if(numericVars.includes("co2_flux")) fVariable.value = "co2_flux";
    else fVariable.value = numericVars[0] || "";
  }

  function initMap(){
    map = L.map("map", { zoomControl:true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);

    const bounds = L.latLngBounds(rowsAll.map(r=>[r.lat,r.lon]));
    map.fitBounds(bounds.pad(0.2));
  }

  function initCharts(){
    const ctxTS = document.getElementById("chartTS");
    chartTS = new Chart(ctxTS, {
      type: "line",
      data: { datasets: [] },
      options:{
        responsive:true,
        parsing:false,
        interaction:{ mode:"nearest", intersect:false },
        plugins:{
          legend:{ labels:{ color:"#eaf0ff" } },
          tooltip:{
            callbacks:{
              title: (items)=>{
                const t = items?.[0]?.raw?.x;
                return t ? new Date(t).toLocaleString("pt-BR") : "";
              },
              label: (c)=>{
                const v = c.raw?.y;
                const unit = META.units?.[fVariable.value] ? ` ${META.units[fVariable.value]}` : "";
                return ` ${c.dataset.label}: ${fmt(v)}${unit}`;
              }
            }
          }
        },
        scales:{
          x:{ type:"time", ticks:{ color:"rgba(234,240,255,.75)" }, grid:{ color:"rgba(255,255,255,.08)" } },
          y:{ ticks:{ color:"rgba(234,240,255,.75)" }, grid:{ color:"rgba(255,255,255,.08)" } }
        }
      }
    });

    const ctxH = document.getElementById("chartHist");
    chartHist = new Chart(ctxH, {
      type:"bar",
      data:{ labels:[], datasets:[{ label:"Frequência", data:[] }] },
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

  function initTableHeader(){
    const cols = [
      "dt","medium","autor","local","ponto","tratamento","estado_solo","periodo_sazonal","compartimento",
      ...numericVars
    ].filter(uniqFilter);

    tblHead.innerHTML = `<tr>${cols.map(c=>`<th>${escapeHtml(META.labels?.[c] || niceLabel(c))}</th>`).join("")}</tr>`;
    tblHead.dataset.cols = JSON.stringify(cols);
  }

  function renderAll(){
    const rows = getFiltered();

    renderKPIs(rows);
    renderCompare(rows);
    renderMap(rows);
    renderCharts(rows);
    renderTable(rows);

    if(!rows.length){
      setStatus("Sem dados nesse recorte. Ajuste filtros/datas.", true);
    }else{
      setStatus(`OK: ${rows.length} registros no recorte.`, false);
    }
  }

  function getFiltered(){
    const medium = fMedium.value;
    const local = fLocal.value;
    const ponto = fPonto.value;
    const comp  = fCompartimento.value;
    const trat  = fTratamento.value;
    const est   = fEstadoSolo.value;
    const saz   = fPeriodoSazonal.value;

    const start = toTime(fDateStart.value ? `${fDateStart.value}T00:00:00` : null);
    const end   = toTime(fDateEnd.value ? `${fDateEnd.value}T23:59:59` : null);

    return rowsAll.filter(r=>{
      if(medium!=="all" && r.medium!==medium) return false;
      if(local!=="all" && r.local!==local) return false;
      if(ponto!=="all" && r.ponto!==ponto) return false;
      if(comp!=="all" && r.compartimento!==comp) return false;
      if(trat!=="all" && r.tratamento!==trat) return false;
      if(est!=="all" && r.estado_solo!==est) return false;
      if(saz!=="all" && r.periodo_sazonal!==saz) return false;
      if(isFinite(start) && r._ts < start) return false;
      if(isFinite(end) && r._ts > end) return false;
      return true;
    });
  }

  function renderKPIs(rows){
    kpiN.textContent = String(rows.length);

    const unit = META.units?.co2_flux ? `(${META.units.co2_flux})` : "";
    kpiMeanUnit.textContent = unit;

    const co2 = rows.map(r=>toNum(r.co2_flux)).filter(isFinite);
    if(!co2.length){
      kpiMean.textContent = "—";
      kpiMax.textContent = "—";
      kpiMin.textContent = "—";
      kpiMaxMeta.textContent = "—";
      kpiMinMeta.textContent = "—";
      return;
    }

    kpiMean.textContent = fmt(avg(co2));

    const rMax = rows.reduce((best,r)=>{
      const v = toNum(r.co2_flux);
      if(!isFinite(v)) return best;
      if(!best || v > best.v) return {r, v};
      return best;
    }, null);

    const rMin = rows.reduce((best,r)=>{
      const v = toNum(r.co2_flux);
      if(!isFinite(v)) return best;
      if(!best || v < best.v) return {r, v};
      return best;
    }, null);

    if(rMax){
      kpiMax.textContent = fmt(rMax.v);
      kpiMaxMeta.textContent = `${prettyDT(rMax.r.dt)} • ${rMax.r.local} • ponto ${rMax.r.ponto} • ${labelMedium(rMax.r.medium)}`;
    }
    if(rMin){
      kpiMin.textContent = fmt(rMin.v);
      kpiMinMeta.textContent = `${prettyDT(rMin.r.dt)} • ${rMin.r.local} • ponto ${rMin.r.ponto} • ${labelMedium(rMin.r.medium)}`;
    }
  }

  function renderCompare(rows){
    const unit = META.units?.co2_flux ? ` ${META.units.co2_flux}` : "";
    const soil = rows.filter(r=>r.medium==="soil").map(r=>toNum(r.co2_flux)).filter(isFinite);
    const water= rows.filter(r=>r.medium==="water").map(r=>toNum(r.co2_flux)).filter(isFinite);

    cmpSoil.textContent = soil.length ? `${fmt(avg(soil))}${unit}` : "—";
    cmpWater.textContent = water.length ? `${fmt(avg(water))}${unit}` : "—";
  }

  function renderMap(rows){
    markerLayer.clearLayers();

    if(!rows.length){
      return;
    }

    // Aggregate by (local+ponto+medium) to avoid clutter
    const groups = groupBy(rows, r=>`${r.local}__${r.ponto}__${r.medium}`);

    Object.keys(groups).forEach(k=>{
      const g = groups[k];
      const any = g[0];

      const co2 = g.map(r=>toNum(r.co2_flux)).filter(isFinite);
      const mean = co2.length ? avg(co2) : NaN;
      const min = co2.length ? Math.min(...co2) : NaN;
      const max = co2.length ? Math.max(...co2) : NaN;

      const last = g.slice().sort((a,b)=>b._ts-a._ts)[0];
      const popupRows = g.slice().sort((a,b)=>b._ts-a._ts).slice(0,6);

      const tip = `
        <div style="min-width:260px">
          <div style="font-weight:900; font-size:14px; margin-bottom:6px;">
            ${escapeHtml(any.local)} • ponto ${escapeHtml(any.ponto)} • ${escapeHtml(labelMedium(any.medium))}
          </div>
          <div style="opacity:.92; font-size:12px; line-height:1.35">
            <b>N:</b> ${g.length}<br/>
            <b>CO₂ flux:</b> ${fmt(mean)} (${fmt(min)}–${fmt(max)}) ${escapeHtml(META.units?.co2_flux || "")}<br/>
            ${any.medium==="water" ? `<b>Compartimento:</b> ${escapeHtml(any.compartimento||"—")}<br/>` : ``}
            ${any.medium==="soil" ? `<b>Estado do solo:</b> ${escapeHtml(any.estado_solo||"—")}<br/>` : ``}
            <b>Tratamento:</b> ${escapeHtml(any.tratamento||"—")}<br/>
            <b>Última data:</b> ${escapeHtml(prettyDT(last?.dt))}
          </div>
        </div>
      `;

      const popup = `
        <div style="min-width:280px">
          <div style="font-weight:900; margin-bottom:6px;">
            ${escapeHtml(any.local)} • ponto ${escapeHtml(any.ponto)} • ${escapeHtml(labelMedium(any.medium))}
          </div>
          <div style="font-size:12px; opacity:.9; margin-bottom:8px;">
            Clique em “Baixar CSV (recorte)” para exportar tudo filtrado.
          </div>
          <div style="font-size:12px;">
            ${popupRows.map(r=>{
              return `• ${escapeHtml(prettyDT(r.dt))} — CO₂: <b>${fmt(toNum(r.co2_flux))}</b> ${escapeHtml(META.units?.co2_flux||"")}`;
            }).join("<br/>")}
          </div>
        </div>
      `;

      const marker = L.circleMarker([any.lat, any.lon], {
        radius: 7,
        weight: 2,
        opacity: 0.95,
        fillOpacity: 0.65
      });

      marker.bindTooltip(tip, { sticky:true, direction:"top", opacity:0.98 });
      marker.bindPopup(popup, { maxWidth: 360 });
      marker.addTo(markerLayer);
    });

    const bounds = L.latLngBounds(rows.map(r=>[r.lat,r.lon]));
    map.fitBounds(bounds.pad(0.18));
  }

  function renderCharts(rows){
    const varKey = fVariable.value;
    const label = META.labels?.[varKey] || niceLabel(varKey);
    const unit = META.units?.[varKey] ? ` (${META.units[varKey]})` : "";

    const soil = rows.filter(r=>r.medium==="soil" && isFinite(toNum(r[varKey])))
      .sort((a,b)=>a._ts-b._ts)
      .map(r=>({ x:r._ts, y:toNum(r[varKey]) }));

    const water = rows.filter(r=>r.medium==="water" && isFinite(toNum(r[varKey])))
      .sort((a,b)=>a._ts-b._ts)
      .map(r=>({ x:r._ts, y:toNum(r[varKey]) }));

    chartTS.data.datasets = [
      { label:`Solo — ${label}${unit}`, data: soil, tension:0.15, pointRadius:2, borderWidth:2 },
      { label:`Água — ${label}${unit}`, data: water, tension:0.15, pointRadius:2, borderWidth:2 }
    ];
    chartTS.update();

    const vals = rows.map(r=>toNum(r[varKey])).filter(isFinite);
    const hist = histogram(vals, 12);
    chartHist.data.labels = hist.labels;
    chartHist.data.datasets[0].label = `Frequência — ${label}${unit}`;
    chartHist.data.datasets[0].data = hist.counts;
    chartHist.update();
  }

  function renderTable(rows){
    const qtxt = (tblSearch.value || "").trim().toLowerCase();
    const cols = JSON.parse(tblHead.dataset.cols || "[]");

    const filtered = !qtxt ? rows : rows.filter(r=>{
      const s = cols.map(c=>String(r[c] ?? "")).join(" ").toLowerCase();
      return s.includes(qtxt);
    });

    tblBody.innerHTML = filtered
      .slice()
      .sort((a,b)=>a._ts-b._ts)
      .map(r=>{
        return `<tr>${cols.map(c=>{
          const v = r[c];
          if(c==="dt") return `<td>${escapeHtml(prettyDT(v))}</td>`;
          if(typeof v === "number" && isFinite(v)) return `<td>${fmt(v)}</td>`;
          return `<td>${escapeHtml(String(v ?? ""))}</td>`;
        }).join("")}</tr>`;
      }).join("");

    tblInfo.textContent = `Mostrando ${filtered.length} de ${rows.length} (recorte atual)`;
  }

  function downloadCSV(rows, filename){
    const cols = JSON.parse(tblHead.dataset.cols || "[]");
    const headers = cols;

    const lines = [headers.join(",")];
    rows.forEach(r=>{
      const vals = headers.map(h=>{
        const v = r[h];
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

  // ---- helpers ----
  function q(sel){ return document.querySelector(sel); }
  function str(x){ return (x===null || x===undefined) ? "" : String(x).trim(); }
  function toNum(x){
    if(x===null || x===undefined || x==="") return NaN;
    const v = Number(String(x).replace(",", "."));
    return Number.isFinite(v) ? v : NaN;
  }
  function toTime(dt){
    if(!dt) return NaN;
    const t = Date.parse(dt);
    return Number.isFinite(t) ? t : NaN;
  }
  function avg(a){ return a.reduce((s,v)=>s+v,0)/a.length; }

  function fmt(v){
    if(!isFinite(v)) return "—";
    const abs = Math.abs(v);
    if(abs >= 1000) return v.toFixed(0);
    if(abs >= 100) return v.toFixed(1);
    if(abs >= 10) return v.toFixed(2);
    return v.toFixed(3);
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
    return d.toLocaleString("pt-BR");
  }

  function uniq(arr){
    return Array.from(new Set(arr.filter(v => v && String(v).trim() !== "")));
  }
  function uniqFilter(v, i, a){ return a.indexOf(v)===i; }

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

  function detectNumericVars(rows){
    const keys = new Set();
    rows.forEach(r=>{
      Object.keys(r).forEach(k=>{
        if(["id","medium","autor","local","ponto","tratamento","estado_solo","periodo_sazonal","compartimento","dt"].includes(k)) return;
        const v = r[k];
        if(typeof v === "number" && isFinite(v)) keys.add(k);
        else if(typeof v === "string" && isFinite(toNum(v))) keys.add(k);
      });
    });
    // Always include co2_flux if exists in any row
    if(rows.some(r=>isFinite(toNum(r.co2_flux)))) keys.add("co2_flux");
    return Array.from(keys);
  }

  function labelMedium(m){
    return m==="soil" ? "Solo" : (m==="water" ? "Água" : m);
  }

  function niceLabel(k){
    const t = k.replaceAll("_"," ");
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function histogram(values, bins=12){
    if(!values.length) return { labels:[], counts:[] };
    const vmin = Math.min(...values);
    const vmax = Math.max(...values);
    if(vmin === vmax) return { labels:[fmt(vmin)], counts:[values.length] };

    const width = (vmax - vmin) / bins;
    const counts = Array.from({length:bins}, ()=>0);

    values.forEach(v=>{
      let idx = Math.floor((v - vmin) / width);
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

  function applyRange(r, maxTs, minTs){
    if(r==="all"){
      fDateStart.value = toDateInput(minTs);
      fDateEnd.value = toDateInput(maxTs);
      return;
    }
    const days = Number(r);
    const start = maxTs - days*24*60*60*1000;
    fDateStart.value = toDateInput(start);
    fDateEnd.value = toDateInput(maxTs);
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

  function setStatus(msg, warn){
    if(!statusMsg) return;
    statusMsg.textContent = msg;
    statusMsg.style.opacity = "1";
    statusMsg.style.color = warn ? "rgba(255,200,120,.95)" : "rgba(234,240,255,.72)";
  }
})();
