# Painel CO₂ Pantanal — Solo & Água (GitHub Pages)

Dashboard front-end (HTML/CSS/JS) com:
- Mapa Leaflet com pontos e tooltip no hover
- Filtros por meio (solo/água), compartimento, ponto e período
- KPIs (N, média, min, max) com onde/quando
- Comparação Solo vs Água
- Série temporal e histograma (Chart.js)
- Tabela pesquisável + download CSV do recorte filtrado

## Como usar
1. Abra `data.js` e cole seus registros no `window.CO2_DATA`.
2. Ajuste unidades em `window.CO2_UNITS` se necessário.
3. Abra `index.html` localmente ou publique no GitHub Pages.

## Publicar no GitHub Pages
- Settings → Pages → Source: `Deploy from a branch`
- Branch: `main` / folder: `/root`
- Salvar, e o link do site aparece em seguida.

## Modelo de registro
Campos mínimos:
- id, site, lat, lon, dt, medium ("soil"|"water"), compartment, co2_flux

Opcionais:
- temp_air, temp_water, temp_soil, rh, soil_moisture, water_depth, notes
