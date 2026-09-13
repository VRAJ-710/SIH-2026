# /ingestion

This directory contains Python ingestion tools and parsers for transforming raw external datasets into the unified standard schemas.

## Role
- Parses data from Copernicus Marine reanalysis, Argo floats, OMNI moored buoys, and glider datasets.
- Outputs standardized point-data (into SQLite, CSV, or backend ingestion endpoints) and grid-data (into CF-1.8-compliant NetCDF).
- Implements offline cached fallbacks under `sample_data/` to run fully without external internet dependencies.
