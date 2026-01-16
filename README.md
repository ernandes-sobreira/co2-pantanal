# CO2-pantanal (internal)

Static dashboard for Pantanal sampling data (CO₂ focused) with:
- Leaflet map + hover preview
- Filters (compartment, habitat, site, date range)
- CO₂ comparisons and timeline charts
- Simple “research gaps” checker (compartment × habitat)

## How to run locally
Open `index.html` with a local server (recommended):

### Option A (VS Code)
Use “Live Server”.

### Option B (Python)
python -m http.server 8000
Then open http://localhost:8000

## Deploy on GitHub Pages
1. Create repo `co2-pantanal`
2. Upload these files
3. Settings → Pages → Deploy from branch → main / root

## Data format
Put your CSV at: `data/data.csv`

Minimum required:
- lat, lon (or latitude/longitude)
- date (YYYY-MM-DD recommended; DD/MM/YYYY accepted)

Recommended columns:
- compartment (Water/Soil)
- habitat (Vegetated/Exposed/Macrophytes/Open bed)
- one CO₂ column (e.g. co2_flux)
- temp_c, rh, cond_uScm, do_mgL, do_pct, ph
