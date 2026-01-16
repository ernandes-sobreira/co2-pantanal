# CO2-pantanal (internal)

Static dashboard (GitHub Pages friendly) for Pantanal sampling data focused on CO₂ flux.

## Features
- Leaflet map with hover preview + click popup
- Filters:
  - SOLO/ÁGUA
  - TRATAMENTO
  - CARACTERÍSTICA LOCAL
  - NOME DO LOCAL
  - STATUS AMBIENTAL
  - PONTO
  - Date range
- Quick stats: N, min, max, mean, median, IQR
- Charts: group comparison + timeline

## Data
Place your file at: `data/data.csv`

Important:
- Delimiter is semicolon `;`
- Dates in `DATA` are DD/MM/YYYY

Expected coordinate columns:
- `Latitude 1`
- `Longitude 2`

CO₂ default column:
- `CO2 flux (mg/m2/day)`

## Run locally
Use a local server:

python -m http.server 8000
Open: http://localhost:8000

## GitHub Pages
1) Create repo `co2-pantanal`
2) Upload all files
3) Settings → Pages → Deploy from branch → main / root
