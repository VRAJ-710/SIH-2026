"""Stage Gap Closure -- CTD (Conductivity-Temperature-Depth) Ingestion Stub.

IMPORTANT: This is an ILLUSTRATIVE/SYNTHETIC STUB dataset, NOT real fetched data.
It demonstrates the extensibility of the ingestion pipeline by adding a CTD
instrument type — a single vertical profile cast at one location/time, measuring
temperature and salinity at realistic depth intervals in the Bay of Bengal during
Super Cyclone Amphan.

Output: ingestion/output/points_ctd.parquet
Conforms strictly to CONTRACTS.md Section 1(a).

Usage:
    python ingestion/ingest_ctd.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

# Bounding box & time window (CONTRACTS.md / AGENTS.md)
MIN_LAT, MAX_LAT = 8.0, 23.0
MIN_LON, MAX_LON = 82.0, 92.0

SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = SCRIPT_DIR / "output"
OUTPUT_FILE = OUTPUT_DIR / "points_ctd.parquet"


class CTDIngestor:
    """Ingestor stub for CTD (Conductivity-Temperature-Depth) casts.

    Generates synthetic vertical temperature and salinity profiles for sample
    CTD stations in the Bay of Bengal during Cyclone Amphan (May 2020).

    A CTD cast is a single lowered profile at one location and time — unlike
    moored buoys (time series) or Argo floats (drifting repeat profiles).
    """

    # Two sample CTD stations within the Amphan bbox
    STATIONS = [
        {
            "id": "CTD_BOB_01",
            "lat": 15.3,
            "lon": 85.8,
            "time": "2020-05-16T09:00:00Z",
            "name": "CTD cast — pre-cyclone central BoB",
        },
        {
            "id": "CTD_BOB_02",
            "lat": 19.1,
            "lon": 87.6,
            "time": "2020-05-22T14:00:00Z",
            "name": "CTD cast — post-cyclone northern BoB",
        },
    ]

    # Realistic CTD depth levels (meters, standard oceanographic depths)
    DEPTH_LEVELS = [
        1.0, 5.0, 10.0, 20.0, 30.0, 50.0, 75.0, 100.0,
        150.0, 200.0, 300.0, 500.0, 750.0, 1000.0,
    ]

    def __init__(self, output_path: Path | str | None = None) -> None:
        self.output_path = Path(output_path or OUTPUT_FILE)

    def generate_sample_data(self) -> pd.DataFrame:
        """Generate synthetic CTD temperature and salinity profiles."""
        rng = np.random.default_rng(seed=20200516)
        rows: list[dict[str, Any]] = []

        for station in self.STATIONS:
            # Bay of Bengal typical pre-/post-cyclone profile characteristics:
            # - Surface temperature ~29-30°C, dropping to ~4-5°C at 1000m
            # - Salinity ~32-33 psu at surface (low due to freshwater input),
            #   rising to ~35 psu at depth
            sst = 29.8 if "pre" in station["name"] else 28.2  # cold wake effect
            surface_sal = 32.5 if "pre" in station["name"] else 33.1

            for depth in self.DEPTH_LEVELS:
                # Temperature: exponential decay with depth
                temp_val = float(
                    sst * np.exp(-depth / 350.0)
                    + 4.0 * (1.0 - np.exp(-depth / 350.0))
                    + rng.normal(0, 0.08)
                )

                # Salinity: increases with depth toward deep-water values
                sal_val = float(
                    surface_sal
                    + (35.0 - surface_sal) * (1.0 - np.exp(-depth / 400.0))
                    + rng.normal(0, 0.03)
                )

                base = {
                    "lat": float(station["lat"]),
                    "lon": float(station["lon"]),
                    "depth": float(depth),
                    "time": station["time"],
                    "instrument_id": str(station["id"]),
                    "instrument_type": "ctd",
                }

                rows.append({**base, "variable": "temperature", "value": round(temp_val, 4)})
                rows.append({**base, "variable": "salinity", "value": round(sal_val, 4)})

        df = pd.DataFrame(rows)

        # Enforce CONTRACTS.md Section 1(a) column order and data types exactly
        columns = [
            "lat",
            "lon",
            "depth",
            "time",
            "variable",
            "value",
            "instrument_id",
            "instrument_type",
        ]
        df = df[columns]
        df["lat"] = df["lat"].astype(float)
        df["lon"] = df["lon"].astype(float)
        df["depth"] = df["depth"].astype(float)
        df["value"] = df["value"].astype(float)
        df["time"] = df["time"].astype(str)
        df["variable"] = df["variable"].astype(str)
        df["instrument_id"] = df["instrument_id"].astype(str)
        df["instrument_type"] = df["instrument_type"].astype(str)

        return df

    def run(self) -> Path:
        """Generate data and write to output parquet."""
        df = self.generate_sample_data()
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(self.output_path, index=False)
        return self.output_path


def main() -> str:
    print("=" * 60)
    print("Stage Gap Closure -- CTD Ingestion Stub (Illustrative)")
    print("=" * 60)
    print()
    print("NOTE: This is a SYNTHETIC/ILLUSTRATIVE stub dataset.")
    print("It demonstrates generic pipeline extensibility for CTD casts.")
    print()

    ingestor = CTDIngestor()
    output_path = ingestor.run()
    df = pd.read_parquet(output_path)

    print(f"Output: {output_path}")
    print(f"Rows:   {len(df)}")
    print(f"Size:   {os.path.getsize(output_path):,} bytes")
    print(f"CTDs:   {df['instrument_id'].nunique()} ({', '.join(df['instrument_id'].unique())})")
    print(f"Variables: {sorted(df['variable'].unique())}")

    for var in sorted(df["variable"].unique()):
        sub = df[df["variable"] == var]
        print(
            f"  {var}: n={len(sub)}, "
            f"min={sub['value'].min():.4f}, "
            f"max={sub['value'].max():.4f}, "
            f"mean={sub['value'].mean():.4f}"
        )

    print(f"\nLat range: {df['lat'].min():.4f} to {df['lat'].max():.4f}")
    print(f"Lon range: {df['lon'].min():.4f} to {df['lon'].max():.4f}")
    print(f"Depth range: {df['depth'].min():.1f} to {df['depth'].max():.1f} m")
    print(f"Time range: {df['time'].min()} to {df['time'].max()}")

    return str(output_path)


if __name__ == "__main__":
    main()
