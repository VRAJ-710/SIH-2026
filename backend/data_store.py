"""Data store loading and querying the Stage 2 parquet point datasets."""

from __future__ import annotations

import logging
from pathlib import Path
import threading
from typing import Any

import numpy as np
import pandas as pd
import xarray as xr

from backend.config import DATA_DIR, REAL_NC_PATH

logger = logging.getLogger(__name__)

PARQUET_FILES = [
    "points_argo.parquet",
    "points_buoy.parquet",
    "points_glider.parquet",
    "points_adcp.parquet",
]


class DataStore:
    """Manages loaded in-memory point dataset tables and model grid validation."""

    def __init__(self, data_dir: Path | None = None) -> None:
        self.data_dir = data_dir or DATA_DIR
        self._df: pd.DataFrame = pd.DataFrame()
        self._nc_ds: xr.Dataset | None = None
        self._nc_lock = threading.Lock()
        self.load_data()

    def get_model_dataset(self) -> xr.Dataset | None:
        """Lazily load and cache the GLORYS12 physical grid NetCDF dataset."""
        if self._nc_ds is None:
            with self._nc_lock:
                if self._nc_ds is None and REAL_NC_PATH.exists():
                    try:
                        self._nc_ds = xr.open_dataset(REAL_NC_PATH)
                        logger.info("Opened GLORYS12 grid NetCDF from %s", REAL_NC_PATH)
                    except Exception as exc:
                        logger.error("Failed to open grid NetCDF %s: %s", REAL_NC_PATH, exc)
        return self._nc_ds

    def load_data(self) -> None:
        """Load and concatenate all available parquet point files."""
        frames = []
        # Discover all points_*.parquet files generically, or fall back to PARQUET_FILES
        discovered = sorted(self.data_dir.glob("points_*.parquet"))
        file_paths = discovered if discovered else [self.data_dir / f for f in PARQUET_FILES]

        for file_path in file_paths:
            if file_path.exists():
                try:
                    df = pd.read_parquet(file_path)
                    logger.info("Loaded %d rows from %s", len(df), file_path)
                    frames.append(df)
                except Exception as exc:
                    logger.error("Failed to read parquet file %s: %s", file_path, exc)
            else:
                logger.warning("Parquet file not found: %s", file_path)

        if frames:
            self._df = pd.concat(frames, ignore_index=True)
            # Ensure instrument_id is clean string (e.g. strip accidental trailing .0)
            self._df["instrument_id"] = (
                self._df["instrument_id"].astype(str).str.replace(r"\.0$", "", regex=True)
            )
            self._df["instrument_type"] = self._df["instrument_type"].astype(str).str.lower()
            self._df["variable"] = self._df["variable"].astype(str).str.lower()
            self._df["time"] = self._df["time"].astype(str)
            self._df["lat"] = self._df["lat"].astype(float)
            self._df["lon"] = self._df["lon"].astype(float)
            self._df["depth"] = self._df["depth"].astype(float)
            self._df["value"] = self._df["value"].astype(float)
            logger.info("Unified DataStore initialized with %d total records", len(self._df))
        else:
            logger.warning("No point data loaded into DataStore (0 records)")
            self._df = pd.DataFrame(
                columns=[
                    "lat",
                    "lon",
                    "depth",
                    "time",
                    "variable",
                    "value",
                    "instrument_id",
                    "instrument_type",
                ]
            )

    @property
    def is_empty(self) -> bool:
        return self._df.empty

    def get_instruments(
        self,
        bbox: str | None = "8,82,23,92",
        time_range: str | None = "2020-05-13T00:00:00Z,2020-05-25T23:59:59Z",
        instrument_type: str | None = None,
    ) -> list[dict[str, Any]]:
        """Filter instruments per CONTRACTS.md Section 3(a).

        bbox: 'min_lat,min_lon,max_lat,max_lon'
        time_range: 'start_time,end_time'
        instrument_type: 'argo', 'buoy', 'glider', 'ctd'
        """
        if self._df.empty:
            return []

        df = self._df

        # We build a mask for bbox and time_range, but explicitly exempt 
        # 'glider' (and optionally 'buoy') sample data so they always appear 
        # for illustrative purposes even if they fall outside the strict Amphan slice.
        mask = pd.Series(True, index=df.index)

        # Filter bbox
        if bbox:
            try:
                parts = [float(p.strip()) for p in bbox.split(",")]
                if len(parts) == 4:
                    min_lat, min_lon, max_lat, max_lon = parts
                    bbox_mask = (
                        (df["lat"] >= min_lat)
                        & (df["lat"] <= max_lat)
                        & (df["lon"] >= min_lon)
                        & (df["lon"] <= max_lon)
                    )
                    # Exempt sample data from bbox restriction
                    mask = mask & (bbox_mask | (df["instrument_type"].isin(["glider", "buoy"])))
            except Exception as exc:
                logger.warning("Invalid bbox '%s': %s", bbox, exc)

        # Filter time_range
        if time_range:
            try:
                t_parts = [p.strip() for p in time_range.split(",")]
                if len(t_parts) == 2:
                    start_time, end_time = t_parts
                    time_mask = (df["time"] >= start_time) & (df["time"] <= end_time)
                    # Exempt sample data from time restriction
                    mask = mask & (time_mask | (df["instrument_type"].isin(["glider", "buoy"])))
            except Exception as exc:
                logger.warning("Invalid time_range '%s': %s", time_range, exc)
        
        df = df[mask]

        # Filter instrument_type
        if instrument_type:
            itype = instrument_type.strip().lower()
            df = df[df["instrument_type"] == itype]

        if df.empty:
            return []

        markers: list[dict[str, Any]] = []
        for inst_id, group in df.groupby("instrument_id"):
            latest_time = str(group["time"].max())
            latest_rows = group[group["time"] == latest_time]
            lat = float(latest_rows["lat"].iloc[0])
            lon = float(latest_rows["lon"].iloc[0])
            inst_type = str(group["instrument_type"].iloc[0])
            variables = sorted(list(group["variable"].unique()))

            markers.append(
                {
                    "instrument_id": str(inst_id),
                    "instrument_type": inst_type,
                    "lat": round(lat, 4),
                    "lon": round(lon, 4),
                    "latest_time": latest_time,
                    "variables": variables,
                }
            )

        # Sort markers deterministically by instrument_id
        markers.sort(key=lambda m: (m["instrument_type"], m["instrument_id"]))
        return markers

    def get_profile(
        self,
        instrument_id: str,
        time: str | None = None,
    ) -> dict[str, Any] | None:
        """Retrieve vertical profile per CONTRACTS.md Section 3(b).

        Pivots variable/value vertically into one record per depth.
        """
        if self._df.empty:
            return None

        # Clean search ID
        search_id = str(instrument_id).strip().replace(".0", "")
        sub = self._df[self._df["instrument_id"] == search_id]
        if sub.empty:
            return None

        if time:
            clean_time = time.strip()
            profile_df = sub[sub["time"] == clean_time]
            if profile_df.empty:
                return None
            selected_time = clean_time
        else:
            selected_time = str(sub["time"].max())
            profile_df = sub[sub["time"] == selected_time]

        if profile_df.empty:
            return None

        inst_type = str(profile_df["instrument_type"].iloc[0])
        lat = float(profile_df["lat"].iloc[0])
        lon = float(profile_df["lon"].iloc[0])

        # Pivot to depth sequence
        depth_data: list[dict[str, Any]] = []
        for depth_val, depth_group in profile_df.groupby("depth"):
            row_dict: dict[str, Any] = {"depth": round(float(depth_val), 3)}
            for _, r in depth_group.iterrows():
                v_name = str(r["variable"])
                v_val = float(r["value"])
                row_dict[v_name] = round(v_val, 4)
            depth_data.append(row_dict)

        # Sort strictly ascending by depth (meters below surface)
        depth_data.sort(key=lambda d: d["depth"])

        # Model validation calculation per CONTRACTS.md Section 3(b)
        model_temperature_mae: float | None = None
        model_salinity_mae: float | None = None

        # NOTE: Glider data is BoBBLE July 2016 (sample/demonstration only, not Amphan May 2020).
        # For glider instruments, EXPLICITLY DO NOT compute or return model validation fields
        # (return null for both model lines and MAE, due to the temporal mismatch).
        if inst_type.lower() == "glider":
            for row in depth_data:
                row["temperature_model"] = None
                row["salinity_model"] = None
        else:
            ds = self.get_model_dataset()
            # Grid bounds check: 8.0 to 23.0°N, 82.0 to 92.0°E
            in_bounds = (8.0 <= lat <= 23.0) and (82.0 <= lon <= 92.0)
            if ds is not None and in_bounds:
                try:
                    t_parsed = np.datetime64(pd.to_datetime(selected_time).tz_localize(None))
                    # Nearest time slice & bilinear spatial interpolation
                    pt = ds.sel(time=t_parsed, method="nearest").interp(lat=lat, lon=lon)
                    measured_depths = [d["depth"] for d in depth_data]

                    # Interpolate to instrument's exact measured depths WITHOUT extrapolation.
                    # Depths beyond the model grid's available vertical coverage at this location
                    # (e.g. surface layer < 0.494m or depths below local seafloor bathymetry)
                    # evaluate to NaN.
                    t_arr = np.atleast_1d(pt["temperature"].interp(depth=measured_depths).values)
                    s_arr = np.atleast_1d(pt["salinity"].interp(depth=measured_depths).values)

                    t_diffs: list[float] = []
                    s_diffs: list[float] = []

                    for idx, row in enumerate(depth_data):
                        t_mod_val = float(t_arr[idx]) if not np.isnan(t_arr[idx]) else None
                        s_mod_val = float(s_arr[idx]) if not np.isnan(s_arr[idx]) else None

                        row["temperature_model"] = round(t_mod_val, 4) if t_mod_val is not None else None
                        row["salinity_model"] = round(s_mod_val, 4) if s_mod_val is not None else None

                        # Exclude null depths from MAE calculation
                        if t_mod_val is not None and "temperature" in row and row["temperature"] is not None:
                            t_diffs.append(abs(row["temperature"] - t_mod_val))
                        if s_mod_val is not None and "salinity" in row and row["salinity"] is not None:
                            s_diffs.append(abs(row["salinity"] - s_mod_val))

                    if t_diffs:
                        model_temperature_mae = round(float(np.mean(t_diffs)), 3)
                    if s_diffs:
                        model_salinity_mae = round(float(np.mean(s_diffs)), 3)
                except Exception as exc:
                    logger.warning("Failed computing model validation for instrument %s: %s", search_id, exc)
                    for row in depth_data:
                        row["temperature_model"] = None
                        row["salinity_model"] = None
            else:
                for row in depth_data:
                    row["temperature_model"] = None
                    row["salinity_model"] = None

        return {
            "instrument_id": search_id,
            "instrument_type": inst_type,
            "lat": round(lat, 4),
            "lon": round(lon, 4),
            "time": selected_time,
            "model_temperature_mae": model_temperature_mae,
            "model_salinity_mae": model_salinity_mae,
            "data": depth_data,
        }


# Global instance
store = DataStore()
