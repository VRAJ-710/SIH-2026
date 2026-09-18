"""Volume data store extracting uniform 3D subgrids from physical ocean NetCDF data.

Strictly adheres to docs/CONTRACTS.md Section 3(f).
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import xarray as xr

from backend.config import REAL_NC_PATH

logger = logging.getLogger(__name__)

LAND_SENTINEL = -9999


class VolumeStore:
    """Manages cached access to the 4D ocean NetCDF dataset (amphan_bob_real.nc)."""

    def __init__(self, nc_path: Path | None = None) -> None:
        self.nc_path = nc_path or REAL_NC_PATH
        self._ds: xr.Dataset | None = None
        self._lock = threading.Lock()
        self.load_dataset()

    def load_dataset(self) -> None:
        """Open the NetCDF dataset if the file exists on disk."""
        if not self.nc_path.exists():
            logger.warning("Physical NetCDF file not found at %s", self.nc_path)
            self._ds = None
            return

        try:
            # Open NetCDF dataset with xarray
            self._ds = xr.open_dataset(self.nc_path)
            logger.info(
                "Physical ocean NetCDF loaded from %s (dims: %s)",
                self.nc_path,
                dict(self._ds.dims),
            )
        except Exception as exc:
            logger.error("Failed to open NetCDF file %s: %s", self.nc_path, exc)
            self._ds = None

    @property
    def is_available(self) -> bool:
        """Return True if dataset is loaded and ready."""
        return self._ds is not None

    def extract_volume(
        self,
        bbox: list[float],
        time_str: str,
        variable: str = "temperature",
        max_depth: float = 200.0,
        res_lon: int = 32,
        res_lat: int = 32,
        res_depth: int = 16,
    ) -> dict[str, Any]:
        """Extract and uniformly interpolate a 3D subgrid per CONTRACTS.md Section 3(f).

        Args:
            bbox: [min_lon, min_lat, max_lon, max_lat]
            time_str: ISO8601 UTC timestamp
            variable: 'temperature' or 'salinity'
            max_depth: positive depth in meters
            res_lon: longitude voxel count (default 32)
            res_lat: latitude voxel count (default 32)
            res_depth: depth voxel count (default 16)
        """
        if self._ds is None:
            raise RuntimeError(f"Physical dataset not loaded from {self.nc_path}")

        min_lon, min_lat, max_lon, max_lat = bbox
        if min_lon >= max_lon or min_lat >= max_lat:
            raise ValueError(f"Invalid bbox coordinates: min must be < max ({bbox})")

        var_clean = variable.strip().lower()
        if var_clean not in self._ds.data_vars:
            raise ValueError(
                f"Variable '{variable}' not found in physical dataset. Available: {list(self._ds.data_vars.keys())}"
            )

        # Thread-safe read/interpolation
        with self._lock:
            # Parse requested time and find nearest available slice
            try:
                parsed_time = pd.to_datetime(time_str).tz_localize(None)
                target_time = np.datetime64(parsed_time)
            except Exception as exc:
                raise ValueError(f"Invalid ISO8601 time string '{time_str}': {exc}")

            da_var = self._ds[var_clean]
            da_time = da_var.sel(time=target_time, method="nearest")
            matched_time_iso = (
                pd.Timestamp(da_time.time.values).strftime("%Y-%m-%dT%H:%M:%SZ")
            )

            # Determine actual depth range within requested max_depth (depth >= 0 and <= max_depth)
            depth_coords = da_time.depth
            valid_depths = depth_coords[(depth_coords >= 0) & (depth_coords <= max_depth)]
            if len(valid_depths) == 0:
                actual_min_depth = float(depth_coords.min())
                actual_max_depth = float(depth_coords.min())
            else:
                actual_min_depth = float(valid_depths.min())
                actual_max_depth = float(valid_depths.max())

            # Spatial boundary clip & padding for interpolation
            lat_min_ds = float(da_time.lat.min())
            lat_max_ds = float(da_time.lat.max())
            lon_min_ds = float(da_time.lon.min())
            lon_max_ds = float(da_time.lon.max())

            pad = 0.25  # ~0.25 deg buffer to ensure boundary cells have neighbors
            slice_min_lat = max(lat_min_ds, min_lat - pad)
            slice_max_lat = min(lat_max_ds, max_lat + pad)
            slice_min_lon = max(lon_min_ds, min_lon - pad)
            slice_max_lon = min(lon_max_ds, max_lon + pad)
            slice_min_depth = max(0.0, actual_min_depth - 1.0)
            slice_max_depth = actual_max_depth + 10.0

            # Crop subslice
            da_sub = da_time.sel(
                depth=slice(slice_min_depth, slice_max_depth),
                lat=slice(slice_min_lat, slice_max_lat),
                lon=slice(slice_min_lon, slice_max_lon),
            )

            # Construct evenly-spaced target coordinates
            target_lon = np.linspace(min_lon, max_lon, res_lon)
            target_lat = np.linspace(min_lat, max_lat, res_lat)
            target_depth = np.linspace(actual_min_depth, actual_max_depth, res_depth)

            # Perform linear interpolation onto uniform grid.
            # Using method="linear" with kwargs={"fill_value": np.nan} ensures:
            # 1. Any target point near land (raw NaN) becomes NaN (no extrapolation of ocean into land).
            # 2. Points outside dataset bounds evaluate to NaN (no edge bleed).
            # 3. NaNs are not replaced until AFTER interpolation, preventing artificial temperature bleed.
            da_interp = da_sub.interp(
                lon=target_lon,
                lat=target_lat,
                depth=target_depth,
                method="linear",
                kwargs={"fill_value": np.nan},
            )

            # Transpose to ensure strictly ('depth', 'lat', 'lon') order
            # Layout index: z * (lat * lon) + y * lon + x
            da_ordered = da_interp.transpose("depth", "lat", "lon")
            arr = da_ordered.values

            # Mask land and calculate valid ocean value range
            nan_mask = np.isnan(arr)
            valid_cells = arr[~nan_mask]

            if valid_cells.size > 0:
                val_min = round(float(np.min(valid_cells)), 4)
                val_max = round(float(np.max(valid_cells)), 4)
            else:
                val_min = None
                val_max = None

            # Replace NaNs with LAND_SENTINEL (-9999)
            arr_filled = np.where(nan_mask, LAND_SENTINEL, arr)

            # Flatten in C row-major layout
            flat_values: list[float] = [
                round(float(v), 4) if v != LAND_SENTINEL else float(LAND_SENTINEL)
                for v in arr_filled.flatten()
            ]

        return {
            "bbox": [round(min_lon, 4), round(min_lat, 4), round(max_lon, 4), round(max_lat, 4)],
            "time": matched_time_iso,
            "variable": var_clean,
            "depth_range": [round(actual_min_depth, 3), round(actual_max_depth, 3)],
            "resolution": {"lon": res_lon, "lat": res_lat, "depth": res_depth},
            "value_range": {"min": val_min, "max": val_max},
            "land_sentinel": float(LAND_SENTINEL),
            "values": flat_values,
        }


# Global instance
volume_store = VolumeStore()
