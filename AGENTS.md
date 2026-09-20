# AGENTS.md

## Project Context
- **Flagship Demo Scenario:** Super Cyclone Amphan, Bay of Bengal, May 2020
- **Bounding Box:** 8-23°N, 82-92°E
- **Time Window:** 2020-05-13 to 2020-05-25 (UTC)
- **Data Sources:**
  - *Copernicus Marine GLORYS12V1 reanalysis* (grid: temperature, salinity, currents)
  - *Argo floats via argopy* (point: includes BGC/chlorophyll)
  - *INCOIS OMNI moored buoy network* (point: in-situ collection)
  - *Glider sample dataset* (labeled illustrative example, not live-storm)
- **Stack:**
  - **Frontend:** React + Vite + TypeScript + Tailwind CSS (using CesiumJS, Three.js, Plotly.js)
  - **Backend:** FastAPI application
  - **Standards Server:** THREDDS Data Server (TDS) serving OPeNDAP, WMS, and WCS
  - **Ingestion:** xarray, pandas, netCDF4 (Python)
  - **Containerization:** Docker Compose linking TDS and FastAPI backend
- **Workflow & Tools:** This repository is split between two AI tools:
  - *OpenCode* (backend, ingestion, Docker, boilerplate)
  - *Antigravity* (frontend Cesium/Three.js visual iteration, Plotly)
  Maintain tool-agnosticism across all files.

## Critical Instructions for AI Agents
- **Strict Contract Adherence:** All ingestion outputs, API schemas, and WMS layer references must strictly match `/docs/CONTRACTS.md`. Do not renegotiate field/dimension names or paths.
- **Offline & Cached Fallback:** The application must work fully offline for live demos. All external data ingestion tools must support reading from cached local files under `/ingestion/sample_data` when live APIs (Copernicus, argopy) are unavailable or slow.
- **No Large Data Commits:** Never commit real, raw data files to the repository. Only store small, processed sample files in `/ingestion/sample_data` for integration testing.
- **TDS Configuration Harmony:** Grid datasets ingested into NetCDF must follow the CF-1.8 standard with dimensions `time`, `depth`, `lat`, `lon` and variables `temperature`, `salinity`, `current_u`, `current_v`, `chlorophyll`. Any divergence will break THREDDS WMS layer mapping.
## File Encoding
All generated text files (code, config, CSS, markdown) must be written as UTF-8 without
a byte-order mark. Never UTF-16.
## Tailwind CSS v4
This project uses Tailwind v4. The PostCSS plugin package is `@tailwindcss/postcss`,
NOT `tailwindcss` directly — using `tailwindcss: {}` in postcss.config.js is a v3-style
config and will fail.
## Real vs Synthetic Depth Levels
Stage 1's frontend depth buttons are hardcoded to the synthetic sample's 0/10/25/50m.
Real GLORYS12 data uses different, non-round depth levels (0.494m first level, up to
~5728m). Stage 5 must read actual available depth levels from the real dataset rather
than reusing Stage 1's hardcoded values.

## Known Live Dependencies (Demo-Day Offline Resilience)

### External Internet Calls (Only Active Online)
1. **Cesium Ion Imagery & Bathymetry**:
   - `api.cesium.com`: Ion asset token authorization and endpoint resolution (Asset 3 [Aerial with labels] and Asset 2426648 [Cesium World Bathymetry]).
   - `assets.ion.cesium.com`: World Bathymetry quantized-mesh terrain tiles.
   - `dev.virtualearth.net` & `*.tiles.virtualearth.net`: Bing Maps aerial imagery tiles requested through Cesium Ion.

### Automatic Offline Resilience & Fallback (Stage 10)
- **Zero-Hang Timeout**: All Cesium Ion network requests are wrapped in a 6-second timeout (`withTimeout`).
- **Cold-Start Offline**: If `navigator.onLine === false` or the Cesium Ion servers cannot be reached within 6 seconds, the viewer automatically initializes with:
  - **Basemap**: Bundled local `NaturalEarthII` tiles (`Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'))`).
  - **Terrain**: Synchronous, offline `Cesium.EllipsoidTerrainProvider()`.
  - **Badge**: HUD header updates to show `🌍 Offline Basemap (NaturalEarthII)`.
- **Runtime Disconnect Recovery**: If internet access drops during a live demo session, runtime tile error handlers and `window.addEventListener('offline')` automatically remove the failing Ion layers and swap in `NaturalEarthII` + `EllipsoidTerrainProvider` without requiring a page reload.

### Fully Local / Cached Components (Zero Internet Required)
- **TDS Server (Docker)**: Serving NetCDF WMS grid layers for `temperature`, `salinity`, `current_u`, `current_v` on `http://localhost:8080` from `/tds/data/amphan_bob_real.nc`.
- **Backend API (Docker / FastAPI)**: Serving `/api/instruments`, `/api/instrument/{id}/profile`, `/api/variables`, `/api/volume`, and `/health` on `http://localhost:8000` entirely from local parquet and NetCDF files.
- **In-Situ Point Datasets**: Argo (`points_argo.parquet`), Moored Buoy (`points_buoy.parquet`), Glider (`points_glider.parquet`), and ADCP (`points_adcp.parquet`) all stored locally under `/ingestion/output/`.
- **3D Volumetric Engine**: Three.js raymarching and Marching Cubes isosurface engines execute entirely in-browser WebGL against local `/api/volume` responses.
- **Assets & Libraries**: Fonts are local system sans-serif; Plotly, Three.js, Cesium web workers, textures (skybox, moon), and icons are 100% bundled locally in Vite `node_modules` / `dist`.