# /tds

This directory contains THREDDS Data Server (TDS) Docker and catalog configurations.

## Role
- Hosts `catalog.xml` and `threddsConfig.xml` to define the datasets served by TDS.
- Serves standardized grid NetCDF files produced by the ingestors via OPeNDAP, WMS, and WCS standards.
- Serves as the primary source for the frontend to fetch multi-dimensional layered ocean grid data (e.g., Temperature, Salinity, Currents).

## Local Data Generation

`tds/data/amphan_bob_real.nc` is **gitignored** and will not be present after a fresh
clone. To generate it, run:

```bash
python ingestion/ingest_glorys12.py
```

This requires valid Copernicus Marine credentials (`copernicusmarine login`). The
script downloads GLORYS12V1 data and writes the CF-compliant NetCDF to
`tds/data/amphan_bob_real.nc`. Once generated, `docker compose up` will serve the
real data through TDS alongside the committed synthetic sample.
