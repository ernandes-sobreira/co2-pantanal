// data.js
// Cole seus dados aqui. Ideal: exporte sua planilha e gere esse array.
//
// Campos mínimos para funcionar bem:
// id, site, lat, lon, dt, medium (soil|water), compartment, co2_flux
//
// Campos opcionais (o painel já aproveita):
// temp_air, temp_water, temp_soil, rh, soil_moisture, water_depth, notes

window.CO2_DATA = [
  {
    id: "P01_0001",
    site: "P01",
    lat: -16.0751,
    lon: -57.6763,
    dt: "2024-08-10T09:30:00",
    medium: "soil",
    compartment: "Pantanal",
    co2_flux: 2.41,
    temp_air: 31.2,
    rh: 62,
    temp_soil: 29.1,
    soil_moisture: 0.22,
    notes: "solo exposto"
  },
  {
    id: "P01_0002",
    site: "P01",
    lat: -16.0751,
    lon: -57.6763,
    dt: "2024-08-10T10:10:00",
    medium: "water",
    compartment: "Pantanal",
    co2_flux: 1.12,
    temp_air: 32.0,
    rh: 58,
    temp_water: 28.4,
    water_depth: 0.9,
    notes: "margem"
  },
  {
    id: "P02_0001",
    site: "P02",
    lat: -16.2140,
    lon: -56.9920,
    dt: "2024-09-02T14:00:00",
    medium: "soil",
    compartment: "Cerrado",
    co2_flux: 3.88,
    temp_air: 34.1,
    rh: 44,
    temp_soil: 33.0,
    soil_moisture: 0.12,
    notes: ""
  }
];

// Unidades (ajuste para o seu padrão)
window.CO2_UNITS = {
  co2_flux: "µmol m⁻² s⁻¹",
  temp_air: "°C",
  temp_water: "°C",
  temp_soil: "°C",
  rh: "%",
  soil_moisture: "m³/m³",
  water_depth: "m"
};
