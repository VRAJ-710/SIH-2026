# /tds

This directory contains THREDDS Data Server (TDS) Docker and catalog configurations.

## Role
- Hosts `catalog.xml` and `threddsConfig.xml` to define the datasets served by TDS.
- Serves standardized grid NetCDF files produced by the ingestors via OPeNDAP, WMS, and WCS standards.
- Serves as the primary source for the frontend to fetch multi-dimensional layered ocean grid data (e.g., Temperature, Salinity, Currents).
