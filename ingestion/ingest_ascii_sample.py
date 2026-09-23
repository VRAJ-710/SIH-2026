"""Stage Gap Closure -- ASCII/Text Format Ingestion Sample.

Demonstrates ingesting a delimited text (CSV) file containing manually-logged
shipboard CTD readings and transforming it into the same unified point-data
schema (CONTRACTS.md Section 1(a)) as every other ingestion pipeline.

This proves the platform's ability to ingest ASCII/text format data — a
requirement explicitly named in the Problem Statement — alongside the existing
NetCDF and parquet pathways.

Input:  ingestion/sample_data/shipboard_ctd_sample.csv
Output: ingestion/output/points_ascii_sample.parquet

Conforms strictly to CONTRACTS.md Section 1(a).

Usage:
    python ingestion/ingest_ascii_sample.py
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
SAMPLE_DATA_DIR = SCRIPT_DIR / "sample_data"
INPUT_FILE = SAMPLE_DATA_DIR / "shipboard_ctd_sample.csv"
OUTPUT_DIR = SCRIPT_DIR / "output"
OUTPUT_FILE = OUTPUT_DIR / "points_ascii_sample.parquet"

# Expected CSV columns (flexible — we map them to CONTRACTS.md schema)
CSV_COLUMN_MAP = {
    "station_id": "instrument_id",
    "latitude": "lat",
    "longitude": "lon",
    "depth_m": "depth",
    "time_utc": "time",
    "temperature_degC": "temperature",
    "salinity_psu": "salinity",
}


def parse_ascii_csv(filepath: Path) -> pd.DataFrame:
    """Parse a delimited text/CSV file into CONTRACTS.md Section 1(a) schema.

    This function demonstrates the general approach for ASCII ingestion:
    1. Read the CSV with pandas (handles comma, tab, or other delimiters)
    2. Map source column names to the standard schema
    3. Melt measured variables into the normalized long format
    4. Enforce exact column order, types, and naming

    Parameters
    ----------
    filepath : Path
        Path to the input CSV/text file.

    Returns
    -------
    pd.DataFrame
        Melted DataFrame conforming to CONTRACTS.md Section 1(a).
    """
    print(f"[ascii] Reading delimited text file: {filepath}")

    # Read CSV — pandas auto-detects comma delimiter; for tab-delimited files,
    # callers could pass sep='\t' or we could sniff the delimiter
    raw = pd.read_csv(filepath, comment="#", skipinitialspace=True)

    print(f"[ascii] Raw rows: {len(raw)}, columns: {list(raw.columns)}")

    # Rename source columns to standard names
    renamed = raw.rename(columns={
        "station_id": "instrument_id",
        "latitude": "lat",
        "longitude": "lon",
        "depth_m": "depth",
        "time_utc": "time",
    })

    # Identify which measured variable columns are present
    variable_columns = {}
    if "temperature_degC" in raw.columns:
        variable_columns["temperature_degC"] = "temperature"
    if "salinity_psu" in raw.columns:
        variable_columns["salinity_psu"] = "salinity"
    if "chlorophyll_mg_m3" in raw.columns:
        variable_columns["chlorophyll_mg_m3"] = "chlorophyll"
    if "current_u_ms" in raw.columns:
        variable_columns["current_u_ms"] = "current_u"
    if "current_v_ms" in raw.columns:
        variable_columns["current_v_ms"] = "current_v"

    if not variable_columns:
        print("[ascii] WARNING: No recognized measured variable columns found")
        return pd.DataFrame(columns=[
            "lat", "lon", "depth", "time", "variable", "value",
            "instrument_id", "instrument_type",
        ])

    # Melt from wide format (one column per variable) to long format
    # (one row per variable measurement per depth)
    frames = []
    for src_col, var_name in variable_columns.items():
        sub = renamed[["lat", "lon", "depth", "time", "instrument_id"]].copy()
        sub["variable"] = var_name
        sub["value"] = pd.to_numeric(raw[src_col], errors="coerce")
        sub["instrument_type"] = "ctd"  # shipboard CTD readings → ctd type
        sub = sub.dropna(subset=["value"])
        frames.append(sub)
        print(f"[ascii]   {var_name}: {len(sub)} rows")

    result = pd.concat(frames, ignore_index=True)

    # Format time to CONTRACTS.md ISO8601: YYYY-MM-DDTHH:MM:SSZ
    result["time"] = pd.to_datetime(result["time"], errors="coerce").dt.strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )

    # Enforce CONTRACTS.md Section 1(a) column order and data types exactly
    columns = [
        "lat", "lon", "depth", "time", "variable", "value",
        "instrument_id", "instrument_type",
    ]
    result = result[columns]
    result["lat"] = result["lat"].astype(float)
    result["lon"] = result["lon"].astype(float)
    result["depth"] = result["depth"].astype(float)
    result["value"] = result["value"].astype(float)
    result["time"] = result["time"].astype(str)
    result["variable"] = result["variable"].astype(str)
    result["instrument_id"] = result["instrument_id"].astype(str)
    result["instrument_type"] = result["instrument_type"].astype(str)

    return result


def main() -> str:
    print("=" * 60)
    print("Stage Gap Closure -- ASCII/Text Format Ingestion Sample")
    print("=" * 60)
    print()
    print("Demonstrates parsing a delimited CSV text file into the")
    print("standard CONTRACTS.md Section 1(a) point-data schema.")
    print()

    if not INPUT_FILE.exists():
        print(f"ERROR: Input file not found: {INPUT_FILE}")
        print("Ensure ingestion/sample_data/shipboard_ctd_sample.csv exists.")
        return ""

    result = parse_ascii_csv(INPUT_FILE)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    result.to_parquet(OUTPUT_FILE, index=False)

    print(f"\nOutput: {OUTPUT_FILE}")
    print(f"Rows:   {len(result)}")
    print(f"Size:   {os.path.getsize(OUTPUT_FILE):,} bytes")

    if not result.empty:
        print(f"Instruments: {result['instrument_id'].nunique()} ({', '.join(result['instrument_id'].unique())})")
        print(f"Variables: {sorted(result['variable'].unique())}")

        for var in sorted(result["variable"].unique()):
            sub = result[result["variable"] == var]
            print(
                f"  {var}: n={len(sub)}, "
                f"min={sub['value'].min():.4f}, "
                f"max={sub['value'].max():.4f}, "
                f"mean={sub['value'].mean():.4f}"
            )

        print(f"\nLat range: {result['lat'].min():.4f} to {result['lat'].max():.4f}")
        print(f"Lon range: {result['lon'].min():.4f} to {result['lon'].max():.4f}")
        print(f"Depth range: {result['depth'].min():.1f} to {result['depth'].max():.1f} m")

    return str(OUTPUT_FILE)


if __name__ == "__main__":
    main()
