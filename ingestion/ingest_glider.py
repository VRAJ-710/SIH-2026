"""Stage 2 -- Glider sample data loader.

IMPORTANT: This is an ILLUSTRATIVE dataset, NOT from the Amphan event.
No ocean glider was deployed in the Bay of Bengal during Super Cyclone
Amphan (May 2020).  This script loads a real historical glider dataset
from the OceanGliders GDAC (Ifremer) to demonstrate the ingestion
pipeline and provide realistic glider data for the frontend.

The closest real glider campaign in the Bay of Bengal is the BoBBLE
(Bay of Bengal Boundary Layer Experiment) from July 2016, which deployed
five Seagliders along 8 deg N between 85-89 deg E.  That data is archived
at BODC (DOI: 10.5285/996bf53d-5448-297a-e053-6c86abc0b996) but requires
manual download.

FALLBACK APPROACH: This script generates a realistic sample glider dataset
based on published BoBBLE results (temperature/salinity/chlorophyll profiles
in the southern Bay of Bengal).  The values are representative of real
oceanographic conditions but are generated, not directly downloaded.

Output: ingestion/output/points_glider.parquet

Usage:
    python ingestion/ingest_glider.py
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
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "points_glider.parquet")

# BoBBLE 2016 approximate glider track: east-west along 8 deg N
# Deployment: June 28 - July 20, 2016
GLIDER_ID = "SG620"  # One of the five BoBBLE Seagliders
GLIDER_LAT_BASE = 8.0
LON_RANGE = (85.3, 89.0)
DATE_RANGE = ("2016-07-01", "2016-07-15")  # Subset of deployment

# Number of simulated dive profiles
N_PROFILES = 40

# Depth levels per profile (meters, positive down)
DEPTHS = np.array([
    1.0, 5.0, 10.0, 20.0, 30.0, 50.0, 75.0, 100.0,
    150.0, 200.0, 300.0, 500.0, 750.0, 1000.0,
])


def generate_glider_sample() -> pd.DataFrame:
    """Generate representative glider profile data mimicking BoBBLE 2016.

    Oceanographic conditions in the southern Bay of Bengal in July:
    - SST: ~28-29 degC; thermocline ~50-100m; deep ~4-5 degC
    - Salinity: ~34 PSU at surface, max ~35 PSU at 100-200m
    - Chlorophyll: subsurface max ~0.3-0.8 mg/m3 near 50-80m
    """
    rng = np.random.default_rng(seed=2016)
    dates = pd.date_range(DATE_RANGE[0], DATE_RANGE[1], periods=N_PROFILES)
    lons = np.linspace(LON_RANGE[0], LON_RANGE[1], N_PROFILES)

    rows = []
    for i in range(N_PROFILES):
        time_str = dates[i].strftime("%Y-%m-%dT%H:%M:%SZ")
        lat = GLIDER_LAT_BASE + rng.normal(0, 0.05)  # slight lat variation
        lon = float(lons[i])

        for depth in DEPTHS:
            d = float(depth)

            # Temperature profile: warm mixed layer, thermocline, cold deep
            if d <= 30:
                temp = 28.5 + rng.normal(0, 0.2)
            elif d <= 100:
                temp = 28.5 - (d - 30) * 0.15 + rng.normal(0, 0.3)
            elif d <= 500:
                temp = 18.0 - (d - 100) * 0.025 + rng.normal(0, 0.3)
            else:
                temp = 8.0 - (d - 500) * 0.006 + rng.normal(0, 0.2)

            # Salinity profile: fresh surface, halocline, saltier deep
            if d <= 50:
                sal = 33.8 + d * 0.01 + rng.normal(0, 0.05)
            elif d <= 200:
                sal = 34.3 + (d - 50) * 0.004 + rng.normal(0, 0.05)
            else:
                sal = 34.9 + rng.normal(0, 0.03)

            # Chlorophyll: subsurface maximum at ~60m
            chl = 0.05 + 0.6 * np.exp(-((d - 60) / 30) ** 2) + rng.normal(0, 0.02)
            chl = max(0.01, chl)  # Ensure non-negative

            base = {
                "lat": round(lat, 4),
                "lon": round(lon, 4),
                "depth": d,
                "time": time_str,
                "instrument_id": GLIDER_ID,
                "instrument_type": "glider",
            }

            rows.append({**base, "variable": "temperature", "value": round(temp, 3)})
            rows.append({**base, "variable": "salinity", "value": round(sal, 3)})
            rows.append({**base, "variable": "chlorophyll", "value": round(chl, 4)})

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
    print("Stage 2 -- Glider Sample Loader (BoBBLE 2016 illustrative)")
    print("=" * 60)
    print()
    print("NOTE: This is an ILLUSTRATIVE dataset based on published BoBBLE")
    print("2016 oceanographic conditions.  It is NOT from the Amphan event")
    print("(May 2020) -- no glider covered that storm.")
    print()

    df = generate_glider_sample()

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    df.to_parquet(OUTPUT_FILE, index=False)

    print(f"Output: {OUTPUT_FILE}")
    print(f"Rows:   {len(df)}")
    print(f"Size:   {os.path.getsize(OUTPUT_FILE):,} bytes")
    print(f"Profiles: {N_PROFILES}")
    print(f"Glider ID: {GLIDER_ID}")
    print(f"Variables: {sorted(df['variable'].unique())}")

    for var in sorted(df["variable"].unique()):
        sub = df[df["variable"] == var]
        print(f"  {var}: n={len(sub)}, "
              f"min={sub['value'].min():.4f}, "
              f"max={sub['value'].max():.4f}, "
              f"mean={sub['value'].mean():.4f}")

    print(f"\nLat range: {df['lat'].min():.4f} to {df['lat'].max():.4f}")
    print(f"Lon range: {df['lon'].min():.4f} to {df['lon'].max():.4f}")
    print(f"Depth range: {df['depth'].min():.1f} to {df['depth'].max():.1f} m")
    print(f"Time range: {df['time'].min()} to {df['time'].max()}")

    return OUTPUT_FILE


if __name__ == "__main__":
    main()
