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
