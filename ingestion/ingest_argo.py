"""Stage 2 -- Ingest Argo float profiles for Super Cyclone Amphan.

Fetches core and BGC-Argo profiles from the Ifremer Argo GDAC ERDDAP
for the Bay of Bengal bounding box and Amphan time window.  Transforms
the data into the melted/long point-data schema defined in
CONTRACTS.md Section 1(a).

Uses erddapy instead of argopy to avoid dependency conflicts on this
system (argopy requires aiohttp<=3.12.15 and xarray<=2025.9.0, both
incompatible with what is installed).

Output: ingestion/output/points_argo.parquet

Usage:
    python ingestion/ingest_argo.py

Prerequisites:
    pip install erddapy pandas pyarrow xarray
"""

from __future__ import annotations

import os
import sys
import warnings

import pandas as pd
import numpy as np

try:
    from erddapy import ERDDAP
except ImportError as exc:
    raise SystemExit("erddapy is required.  pip install erddapy") from exc

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ERDDAP_URL = "https://erddap.ifremer.fr/erddap"

# Bounding box / time (AGENTS.md)
MIN_LAT, MAX_LAT = 8.0, 23.0
MIN_LON, MAX_LON = 82.0, 92.0
START_TIME = "2020-05-13T00:00:00Z"
END_TIME = "2020-05-25T23:59:59Z"

# Core Argo dataset
CORE_DATASET = "ArgoFloats"
CORE_VARS = [
    "latitude", "longitude", "time",
    "pres",       # pressure (dbar, ~depth in m)
    "temp",       # temperature (degC)
    "psal",       # practical salinity (PSU)
    "platform_number",
    "temp_qc", "psal_qc",
]

# BGC-Argo dataset (for chlorophyll)
BGC_DATASET = "ArgoFloats-synthetic-BGC"
BGC_VARS = [
    "latitude", "longitude", "time",
    "pres",
    "chla_adjusted",
    "platform_number",
    "chla_adjusted_qc",
]

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "output")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "points_argo.parquet")

# CONTRACTS.md allowed variable names
ALLOWED_VARS = {"temperature", "salinity", "chlorophyll", "current_u", "current_v"}


def fetch_core_argo() -> pd.DataFrame:
    """Fetch core Argo temperature + salinity profiles from Ifremer ERDDAP."""
    print("[argo-core] Querying Ifremer ERDDAP ...")

    e = ERDDAP(server=ERDDAP_URL, protocol="tabledap")
    e.dataset_id = CORE_DATASET
    e.variables = CORE_VARS
    e.constraints = {
        "latitude>=": MIN_LAT,
        "latitude<=": MAX_LAT,
        "longitude>=": MIN_LON,
        "longitude<=": MAX_LON,
        "time>=": START_TIME,
        "time<=": END_TIME,
        "pres>=": 0,
        "pres<=": 2000,
    }

    try:
        df = e.to_pandas(
            parse_dates=True,
            response="csv",
        )
    except Exception as exc:
        print(f"[argo-core] ERDDAP query failed: {exc}")
        print("[argo-core] Returning empty DataFrame")
        return pd.DataFrame()

    if df.empty:
        print("[argo-core] No data returned")
        return df

    # erddapy adds units row as first data row or in column names
    # Clean column names that may have " (units)" appended
    col_map = {}
    for c in df.columns:
        clean = c.split(" (")[0].strip()
        col_map[c] = clean
    df = df.rename(columns=col_map)

    # erddapy CSV includes a units row as the first data row — drop it
    if "latitude" in df.columns:
        df = df[pd.to_numeric(df["latitude"], errors="coerce").notna()].copy()

    # Cast numeric columns
    for col in ["latitude", "longitude", "pres", "temp", "psal"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    if "temp_qc" in df.columns:
        df["temp_qc"] = df["temp_qc"].astype(str)
    if "psal_qc" in df.columns:
        df["psal_qc"] = df["psal_qc"].astype(str)

    print(f"[argo-core] Got {len(df)} rows, "
          f"{df['platform_number'].nunique()} floats")

    return df


def fetch_bgc_argo() -> pd.DataFrame:
    """Fetch BGC-Argo chlorophyll profiles from Ifremer ERDDAP."""
    print("[argo-bgc] Querying Ifremer ERDDAP for BGC chlorophyll ...")

    e = ERDDAP(server=ERDDAP_URL, protocol="tabledap")
    e.dataset_id = BGC_DATASET
    e.variables = BGC_VARS
    e.constraints = {
        "latitude>=": MIN_LAT,
        "latitude<=": MAX_LAT,
        "longitude>=": MIN_LON,
        "longitude<=": MAX_LON,
        "time>=": START_TIME,
        "time<=": END_TIME,
        "pres>=": 0,
        "pres<=": 2000,
    }

    try:
        df = e.to_pandas(
            parse_dates=True,
            response="csv",
        )
    except Exception as exc:
        print(f"[argo-bgc] ERDDAP query failed: {exc}")
        print("[argo-bgc] No BGC data available for this region/time (expected)")
        return pd.DataFrame()

    if df.empty:
        print("[argo-bgc] No BGC data returned for this region/time")
        return df

    # Clean column names
    col_map = {}
    for c in df.columns:
        clean = c.split(" (")[0].strip()
        col_map[c] = clean
    df = df.rename(columns=col_map)

    # erddapy CSV includes a units row as the first data row — drop it
    if "latitude" in df.columns:
        df = df[pd.to_numeric(df["latitude"], errors="coerce").notna()].copy()

    # Cast numeric columns
    for col in ["latitude", "longitude", "pres", "chla_adjusted"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    if "chla_adjusted_qc" in df.columns:
        df["chla_adjusted_qc"] = df["chla_adjusted_qc"].astype(str)

    print(f"[argo-bgc] Got {len(df)} BGC rows, "
          f"{df['platform_number'].nunique()} floats")

    return df


def _good_qc(series: pd.Series) -> pd.Series:
    """Return boolean mask for Argo QC flags considered good.

    Argo QC flags: 1=good, 2=probably good, 5=value changed, 8=interpolated.
    Values may be float (1.0), int (1), or string ('1').
    Flag 4=bad, 3=probably bad, 9=missing.
    """
    numeric = pd.to_numeric(series, errors="coerce")
    return numeric.isin([1, 2, 5, 8]) | numeric.isna()


def transform_to_point_schema(
    core_df: pd.DataFrame,
    bgc_df: pd.DataFrame,
) -> pd.DataFrame:
    """Melt core + BGC data into CONTRACTS.md Section 1(a) long format."""
    frames = []

    # --- Core: temperature and salinity (vectorized) --------------------------
    if not core_df.empty:
        # Cast numeric columns
        for col in ["latitude", "longitude", "pres", "temp", "psal"]:
            if col in core_df.columns:
                core_df[col] = pd.to_numeric(core_df[col], errors="coerce")

        # Temperature
        temp_mask = core_df["temp"].notna() & _good_qc(core_df["temp_qc"])
        if temp_mask.any():
            temp_df = core_df.loc[temp_mask, ["latitude", "longitude", "pres", "time", "platform_number"]].copy()
            temp_df = temp_df.rename(columns={"latitude": "lat", "longitude": "lon", "pres": "depth"})
            temp_df["variable"] = "temperature"
            temp_df["value"] = core_df.loc[temp_mask, "temp"].values
            temp_df["instrument_id"] = temp_df["platform_number"].astype(str).str.replace(r"\.0$", "", regex=True)
            temp_df["instrument_type"] = "argo"
            temp_df = temp_df.drop(columns=["platform_number"])
            frames.append(temp_df)
            print(f"[transform] temperature: {len(temp_df)} rows")

        # Salinity
        sal_mask = core_df["psal"].notna() & _good_qc(core_df["psal_qc"])
        if sal_mask.any():
            sal_df = core_df.loc[sal_mask, ["latitude", "longitude", "pres", "time", "platform_number"]].copy()
            sal_df = sal_df.rename(columns={"latitude": "lat", "longitude": "lon", "pres": "depth"})
            sal_df["variable"] = "salinity"
            sal_df["value"] = core_df.loc[sal_mask, "psal"].values
            sal_df["instrument_id"] = sal_df["platform_number"].astype(str).str.replace(r"\.0$", "", regex=True)
            sal_df["instrument_type"] = "argo"
            sal_df = sal_df.drop(columns=["platform_number"])
            frames.append(sal_df)
            print(f"[transform] salinity: {len(sal_df)} rows")

    # --- BGC: chlorophyll (vectorized) ----------------------------------------
    if not bgc_df.empty:
        for col in ["latitude", "longitude", "pres", "chla_adjusted"]:
            if col in bgc_df.columns:
                bgc_df[col] = pd.to_numeric(bgc_df[col], errors="coerce")

        chl_mask = bgc_df["chla_adjusted"].notna() & _good_qc(bgc_df["chla_adjusted_qc"])
        if chl_mask.any():
            chl_df = bgc_df.loc[chl_mask, ["latitude", "longitude", "pres", "time", "platform_number"]].copy()
            chl_df = chl_df.rename(columns={"latitude": "lat", "longitude": "lon", "pres": "depth"})
            chl_df["variable"] = "chlorophyll"
            chl_df["value"] = bgc_df.loc[chl_mask, "chla_adjusted"].values
            chl_df["instrument_id"] = chl_df["platform_number"].astype(str).str.replace(r"\.0$", "", regex=True)
            chl_df["instrument_type"] = "argo"
            chl_df = chl_df.drop(columns=["platform_number"])
            frames.append(chl_df)
            print(f"[transform] chlorophyll: {len(chl_df)} rows")

    if not frames:
        print("[transform] WARNING: No valid rows after QC filtering")
        return pd.DataFrame(columns=[
            "lat", "lon", "depth", "time", "variable", "value",
            "instrument_id", "instrument_type",
        ])

    result = pd.concat(frames, ignore_index=True)

    # Format time to CONTRACTS.md ISO8601: YYYY-MM-DDTHH:MM:SSZ
    result["time"] = pd.to_datetime(result["time"], errors="coerce").dt.strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )

    # Enforce column order and types per CONTRACTS.md
    result = result[[
        "lat", "lon", "depth", "time", "variable", "value",
        "instrument_id", "instrument_type",
    ]]
    result["lat"] = result["lat"].astype(float)
    result["lon"] = result["lon"].astype(float)
    result["depth"] = result["depth"].astype(float)
    result["value"] = result["value"].astype(float)
    result["time"] = result["time"].astype(str)
    result["variable"] = result["variable"].astype(str)
    result["instrument_id"] = result["instrument_id"].astype(str)
    result["instrument_type"] = result["instrument_type"].astype(str)

    return result


def _format_time(t) -> str:
    """Format a timestamp to CONTRACTS.md ISO8601 format: YYYY-MM-DDTHH:MM:SSZ."""
    if pd.isna(t):
        return ""
    if isinstance(t, str):
        # Already a string — try to normalise
        try:
            dt = pd.Timestamp(t)
            return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        except Exception:
            return t
    try:
        return pd.Timestamp(t).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return str(t)


def main():
    print("=" * 60)
    print("Stage 2 -- Argo Float Point Ingestion")
    print("=" * 60)

    core_df = fetch_core_argo()
    bgc_df = fetch_bgc_argo()

    result = transform_to_point_schema(core_df, bgc_df)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    result.to_parquet(OUTPUT_FILE, index=False)

    print(f"\nOutput: {OUTPUT_FILE}")
    print(f"Rows:   {len(result)}")
    print(f"Size:   {os.path.getsize(OUTPUT_FILE):,} bytes")

    if not result.empty:
        print(f"\nFloats: {result['instrument_id'].nunique()}")
        print(f"Variables: {sorted(result['variable'].unique())}")
        print("\nPer-variable stats:")
        for var in sorted(result["variable"].unique()):
            sub = result[result["variable"] == var]
            print(f"  {var}: n={len(sub)}, "
                  f"min={sub['value'].min():.3f}, "
                  f"max={sub['value'].max():.3f}, "
                  f"mean={sub['value'].mean():.3f}")
        print(f"\nLat range: {result['lat'].min():.2f} to {result['lat'].max():.2f}")
        print(f"Lon range: {result['lon'].min():.2f} to {result['lon'].max():.2f}")
        print(f"Depth range: {result['depth'].min():.1f} to {result['depth'].max():.1f}")

    return OUTPUT_FILE


if __name__ == "__main__":
    main()
