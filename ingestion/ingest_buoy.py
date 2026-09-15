"""Stage 2 -- INCOIS OMNI Moored Buoy ingestion (sample fallback).

INVESTIGATION SUMMARY:
    INCOIS (Indian National Centre for Ocean Information Services) operates
    the OMNI (Ocean Moored buoy Network for northern Indian Ocean) network
    of moored buoys in the Bay of Bengal and Arabian Sea.

    After investigation, NO programmatic/live data access was found:
    - erddap.incois.gov.in -- not responding / not a public endpoint
    - incois.gov.in data portal -- requires manual login and request;
      no ERDDAP, OPeNDAP, THREDDS, or REST API exposed publicly
    - No publicly documented API for OMNI buoy data
    - Published research papers reference data obtained via direct request
      to INCOIS rather than through any automated download

    FALLBACK: This script creates a small, clearly-labeled SAMPLE dataset
    with realistic-but-fabricated buoy observations from known OMNI buoy
    locations in the Bay of Bengal during the Amphan time window.  These
    values are NOT real measurements -- they are illustrative placeholders
    matching the CONTRACTS.md point schema.

Output: ingestion/output/points_buoy.parquet

Usage:
    python ingestion/ingest_buoy.py
"""

from __future__ import annotations

import os

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "output")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "points_buoy.parquet")

# Known approximate OMNI buoy locations in the Bay of Bengal
# These are real station positions; the DATA VALUES are fabricated samples.
BUOY_LOCATIONS = [
    {"id": "BD08", "lat": 13.0, "lon": 84.0, "name": "BD08 (off Machilipatnam)"},
    {"id": "BD11", "lat": 16.5, "lon": 88.0, "name": "BD11 (central BoB)"},
    {"id": "BD14", "lat": 18.0, "lon": 89.5, "name": "BD14 (north BoB)"},
]

# Time range -- one observation per day during the Amphan window
DATES = pd.date_range("2020-05-13", "2020-05-25", freq="D")

# Observation depths (meters, positive down)
DEPTHS = [1.0, 5.0, 10.0, 25.0, 50.0, 100.0]


def generate_sample_buoy_data() -> pd.DataFrame:
    """Generate realistic-but-fabricated buoy observations.

    Temperature, salinity values are based on climatological expectations
    for the Bay of Bengal in May (pre-monsoon season):
    - SST: ~29-31 degC, decreasing with depth
    - Salinity: ~33-34 PSU at surface, increasing with depth
    """
    rows = []
    rng = np.random.default_rng(seed=42)  # Reproducible

    for buoy in BUOY_LOCATIONS:
        for date in DATES:
            for depth in DEPTHS:
                time_str = date.strftime("%Y-%m-%dT00:00:00Z")
                depth_frac = depth / 100.0

                # Temperature: warm surface, cooler with depth
                base_temp = 30.5 - depth_frac * 5.0 + rng.normal(0, 0.3)
                # Slightly cooler further north (higher lat)
                base_temp -= (buoy["lat"] - 13.0) * 0.05

                # Salinity: fresher surface (Bay of Bengal is relatively fresh)
                base_sal = 33.0 + depth_frac * 1.5 + rng.normal(0, 0.1)

                rows.append({
                    "lat": buoy["lat"],
                    "lon": buoy["lon"],
                    "depth": depth,
                    "time": time_str,
                    "variable": "temperature",
                    "value": round(float(base_temp), 3),
                    "instrument_id": buoy["id"],
                    "instrument_type": "buoy",
                })
                rows.append({
                    "lat": buoy["lat"],
                    "lon": buoy["lon"],
                    "depth": depth,
                    "time": time_str,
                    "variable": "salinity",
                    "value": round(float(base_sal), 3),
                    "instrument_id": buoy["id"],
                    "instrument_type": "buoy",
                })

    df = pd.DataFrame(rows)

    # Enforce CONTRACTS.md column order and types
    df = df[[
        "lat", "lon", "depth", "time", "variable", "value",
        "instrument_id", "instrument_type",
    ]]
    df["lat"] = df["lat"].astype(float)
    df["lon"] = df["lon"].astype(float)
    df["depth"] = df["depth"].astype(float)
    df["value"] = df["value"].astype(float)

    return df


def main():
    print("=" * 60)
    print("Stage 2 -- INCOIS OMNI Buoy Ingestion (Sample Fallback)")
    print("=" * 60)
    print()
    print("NOTE: This is a SAMPLE/ILLUSTRATIVE dataset.")
    print("INCOIS does not provide programmatic access to OMNI buoy data.")
    print("See docstring in this script for investigation details.")
    print()

    df = generate_sample_buoy_data()

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    df.to_parquet(OUTPUT_FILE, index=False)

    print(f"Output: {OUTPUT_FILE}")
    print(f"Rows:   {len(df)}")
    print(f"Size:   {os.path.getsize(OUTPUT_FILE):,} bytes")
    print(f"Buoys:  {df['instrument_id'].nunique()} ({', '.join(df['instrument_id'].unique())})")
    print(f"Variables: {sorted(df['variable'].unique())}")

    for var in sorted(df["variable"].unique()):
        sub = df[df["variable"] == var]
        print(f"  {var}: n={len(sub)}, "
              f"min={sub['value'].min():.3f}, "
              f"max={sub['value'].max():.3f}, "
              f"mean={sub['value'].mean():.3f}")

    return OUTPUT_FILE


if __name__ == "__main__":
    main()
