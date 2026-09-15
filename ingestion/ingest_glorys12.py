"""Stage 2 — Ingest GLORYS12V1 physical reanalysis grid for Super Cyclone Amphan.

Downloads Copernicus Marine GLOBAL_MULTIYEAR_PHY_001_030 data for the
Bay of Bengal bounding box and time window, transforms it into a
CF-1.8-compliant NetCDF matching CONTRACTS.md Section 1(b), and writes
it to tds/data/amphan_bob_real.nc.

Variables pulled: thetao -> temperature, so -> salinity,
                  uo -> current_u, vo -> current_v.

Chlorophyll is NOT included -- GLORYS12V1 is a physical-only product.
A separate BGC product ingestion would be needed for chlorophyll.

The raw Copernicus download is cached in ingestion/cache/ so that
re-runs skip the download step.  That cache directory is gitignored.

Usage:
    python ingestion/ingest_glorys12.py

Prerequisites:
    pip install copernicusmarine xarray netCDF4 numpy
    copernicusmarine login          # one-time credential setup
"""

from __future__ import annotations

import os
import sys

import numpy as np

try:
    import copernicusmarine
except ImportError as exc:
    raise SystemExit(
        "copernicusmarine is required.  pip install copernicusmarine"
    ) from exc

try:
    import xarray as xr
except ImportError as exc:
    raise SystemExit("xarray is required.  pip install xarray") from exc

# ---------------------------------------------------------------------------
# Configuration -- matches AGENTS.md / CONTRACTS.md exactly
# ---------------------------------------------------------------------------

DATASET_ID = "cmems_mod_glo_phy_my_0.083deg_P1D-m"

# Copernicus variable names -> CONTRACTS.md variable names
VAR_MAP = {
    "thetao": "temperature",
    "so": "salinity",
    "uo": "current_u",
    "vo": "current_v",
}

# Bounding box (AGENTS.md)
MIN_LAT, MAX_LAT = 8.0, 23.0
MIN_LON, MAX_LON = 82.0, 92.0

# Time window (AGENTS.md)
START_TIME = "2020-05-13T00:00:00"
END_TIME = "2020-05-25T23:59:59"

# Paths (relative to repository root)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
CACHE_DIR = os.path.join(SCRIPT_DIR, "cache")
CACHE_FILE = os.path.join(CACHE_DIR, "glorys12_raw.nc")
OUTPUT_FILE = os.path.join(REPO_ROOT, "tds", "data", "amphan_bob_real.nc")


def download_glorys(cache_path: str) -> str:
    """Download GLORYS12V1 subset, caching to *cache_path*."""
    if os.path.exists(cache_path):
        print(f"[cache hit] Raw download already exists: {cache_path}")
        return cache_path

    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    print(f"[download] Fetching GLORYS12V1 subset to {cache_path} ...")

    result = copernicusmarine.subset(
        dataset_id=DATASET_ID,
        variables=list(VAR_MAP.keys()),
        minimum_latitude=MIN_LAT,
        maximum_latitude=MAX_LAT,
        minimum_longitude=MIN_LON,
        maximum_longitude=MAX_LON,
        start_datetime=START_TIME,
        end_datetime=END_TIME,
        output_filename=os.path.basename(cache_path),
        output_directory=os.path.dirname(cache_path),
        overwrite=True,
    )
    print(f"[download] Complete: {cache_path}")
    return cache_path


def transform_to_contract(cache_path: str, output_path: str) -> str:
    """Read raw download, rename to CONTRACTS.md schema, write CF-1.8 NetCDF."""
    print(f"[transform] Reading {cache_path} ...")
    ds = xr.open_dataset(cache_path)

    # --- Rename coordinates ---------------------------------------------------
    coord_map = {}
    if "latitude" in ds.dims:
        coord_map["latitude"] = "lat"
    if "longitude" in ds.dims:
        coord_map["longitude"] = "lon"
    # depth and time should already match; rename only if needed
    if coord_map:
        ds = ds.rename(coord_map)

    # --- Rename variables -----------------------------------------------------
    rename_vars = {}
    for src, dst in VAR_MAP.items():
        if src in ds.data_vars:
            rename_vars[src] = dst
    if rename_vars:
        ds = ds.rename(rename_vars)

    # --- Ensure depth has positive="down" (CONTRACTS.md critical requirement) --
    if "depth" in ds.coords:
        ds["depth"].attrs["positive"] = "down"
        ds["depth"].attrs["standard_name"] = "depth"
        ds["depth"].attrs["long_name"] = "depth below sea surface"
        ds["depth"].attrs["units"] = "m"
        ds["depth"].attrs["axis"] = "Z"

    # --- Set CF standard attributes on coordinates ----------------------------
    if "lat" in ds.coords:
        ds["lat"].attrs.update(
            standard_name="latitude",
            long_name="Latitude",
            units="degrees_north",
            axis="Y",
        )
    if "lon" in ds.coords:
        ds["lon"].attrs.update(
            standard_name="longitude",
            long_name="Longitude",
            units="degrees_east",
            axis="X",
        )
    if "time" in ds.coords:
        ds["time"].attrs.update(
            standard_name="time",
            long_name="time",
            axis="T",
        )

    # --- Set CF standard attributes on data variables -------------------------
    var_attrs = {
        "temperature": {
            "standard_name": "sea_water_temperature",
            "long_name": "Sea Water Temperature",
            "units": "degree_C",
        },
        "salinity": {
            "standard_name": "sea_water_practical_salinity",
            "long_name": "Sea Water Practical Salinity",
            "units": "1e-3",
        },
        "current_u": {
            "standard_name": "eastward_sea_water_velocity",
            "long_name": "Eastward Sea Water Velocity",
            "units": "m s-1",
        },
        "current_v": {
            "standard_name": "northward_sea_water_velocity",
            "long_name": "Northward Sea Water Velocity",
            "units": "m s-1",
        },
    }
    for vname, attrs in var_attrs.items():
        if vname in ds.data_vars:
            ds[vname].attrs.update(attrs)
            ds[vname].attrs["coordinates"] = "time depth lat lon"

    # --- Global attributes ----------------------------------------------------
    ds.attrs["Conventions"] = "CF-1.8"
    ds.attrs["title"] = (
        "GLORYS12V1 Bay of Bengal reanalysis -- Super Cyclone Amphan "
        "(2020-05-13 to 2020-05-25)"
    )
    ds.attrs["institution"] = "Copernicus Marine / Mercator Ocean / INCOIS SIH-2026"
    ds.attrs["source"] = "GLOBAL_MULTIYEAR_PHY_001_030 (GLORYS12V1)"
    ds.attrs["history"] = "Generated by ingest_glorys12.py (Stage 2 real data)"
    ds.attrs["comment"] = (
        "Physical reanalysis only -- chlorophyll not included.  "
        "See CONTRACTS.md Section 1(b) for schema details."
    )

    # --- Force compute (materialise dask arrays) then write -------------------
    print("[transform] Loading data into memory ...")
    ds = ds.compute()

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    if os.path.exists(output_path):
        os.remove(output_path)

    print(f"[transform] Writing {output_path} ...")
    ds.to_netcdf(output_path, format="NETCDF4")
    print(f"[transform] Done -- {os.path.getsize(output_path):,} bytes")

    # --- Sanity checks --------------------------------------------------------
    print("\n=== Sanity checks ===")
    print(f"Dimensions: {dict(ds.sizes)}")
    print(f"Variables:  {list(ds.data_vars)}")
    for v in ds.data_vars:
        arr = ds[v].values
        valid = arr[~np.isnan(arr)]
        if len(valid) > 0:
            print(
                f"  {v}: min={valid.min():.4f}, max={valid.max():.4f}, "
                f"mean={valid.mean():.4f}, NaN%={100*np.isnan(arr).sum()/arr.size:.1f}"
            )
        else:
            print(f"  {v}: ALL NaN")

    depth_attr = ds["depth"].attrs.get("positive", "MISSING")
    print(f"depth positive attr: {depth_attr!r}")
    assert depth_attr == "down", "CRITICAL: depth positive='down' missing!"

    ds.close()
    return output_path


def main():
    print("=" * 60)
    print("Stage 2 -- GLORYS12V1 Grid Ingestion")
    print("=" * 60)

    cache_path = download_glorys(CACHE_FILE)
    output_path = transform_to_contract(cache_path, OUTPUT_FILE)

    print(f"\nOutput: {output_path}")
    print(f"Size:   {os.path.getsize(output_path):,} bytes")
    return output_path


if __name__ == "__main__":
    main()
