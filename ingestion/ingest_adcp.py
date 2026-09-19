"""Stage 8 -- ADCP (Acoustic Doppler Current Profiler) Ingestion Stub.

IMPORTANT: This is an ILLUSTRATIVE/SYNTHETIC STUB dataset, NOT real fetched data.
It demonstrates the extensibility of the ingestion pipeline and contract-based
architecture by adding a 5th instrument type (ADCP) producing vertical current
velocity profiles (current_u, current_v) in the Bay of Bengal during Super Cyclone Amphan.

Output: ingestion/output/points_adcp.parquet
Conforms strictly to CONTRACTS.md Section 1(a).

Usage:
    python ingestion/ingest_adcp.py
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
OUTPUT_FILE = OUTPUT_DIR / "points_adcp.parquet"


class ADCPIngestor:
    """Ingestor stub for Acoustic Doppler Current Profilers (ADCP).

    Generates synthetic vertical current velocity profiles (current_u, current_v)
    for sample stations in the Bay of Bengal during Cyclone Amphan (May 2020).
    """

    STATIONS = [
        {"id": "ADCP_BOB_01", "lat": 14.5, "lon": 86.5, "name": "ADCP Central BoB"},
        {"id": "ADCP_BOB_02", "lat": 17.2, "lon": 88.2, "name": "ADCP North BoB"},
    ]

    DEPTH_BINS = [2.0, 5.0, 10.0, 20.0, 35.0, 50.0, 75.0, 100.0, 150.0]

    OBSERVATION_TIMES = [
        "2020-05-17T12:00:00Z",
        "2020-05-18T12:00:00Z",
        "2020-05-19T12:00:00Z",
    ]

    def __init__(self, output_path: Path | str | None = None) -> None:
        self.output_path = Path(output_path or OUTPUT_FILE)

    def generate_sample_data(self) -> pd.DataFrame:
        """Generate synthetic ADCP current velocity profiles."""
        rng = np.random.default_rng(seed=20200518)
        rows: list[dict[str, Any]] = []

        for station in self.STATIONS:
            for time_str in self.OBSERVATION_TIMES:
                for depth in self.DEPTH_BINS:
                    # Current speeds are highest at surface and attenuate exponentially with depth
                    depth_decay = float(np.exp(-depth / 45.0))

                    # Storm surge / cyclonic currents:
                    # u (eastward) and v (northward) components
                    u_val = float(0.85 * depth_decay + rng.normal(0, 0.04))
                    v_val = float(1.20 * depth_decay + rng.normal(0, 0.04))

                    base = {
                        "lat": float(station["lat"]),
                        "lon": float(station["lon"]),
                        "depth": float(depth),
                        "time": time_str,
                        "instrument_id": str(station["id"]),
                        "instrument_type": "adcp",
                    }

                    rows.append({**base, "variable": "current_u", "value": round(u_val, 4)})
                    rows.append({**base, "variable": "current_v", "value": round(v_val, 4)})

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
    print("Stage 8 -- ADCP Ingestion Stub (Illustrative)")
    print("=" * 60)
    print()
    print("NOTE: This is a SYNTHETIC/ILLUSTRATIVE stub dataset.")
    print("It demonstrates generic pipeline extensibility for point instruments.")
    print()

    ingestor = ADCPIngestor()
    output_path = ingestor.run()
    df = pd.read_parquet(output_path)

    print(f"Output: {output_path}")
    print(f"Rows:   {len(df)}")
    print(f"Size:   {os.path.getsize(output_path):,} bytes")
    print(f"ADCPs:  {df['instrument_id'].nunique()} ({', '.join(df['instrument_id'].unique())})")
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
