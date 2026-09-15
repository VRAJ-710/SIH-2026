"""Generate the Stage 1(a) synthetic CF-1.8 NetCDF grid for the TDS WMS spike.

Output: tds/data/amphan_bob_temperature_sample.nc
Schema: docs/CONTRACTS.md Section 1(b) — dimensions time, depth, lat, lon
and variables temperature, salinity, current_u, current_v, chlorophyll.
"""

from __future__ import annotations

import os

import numpy as np

try:
    from netCDF4 import Dataset
except ImportError as exc:  # pragma: no cover - environment bootstrap
    raise SystemExit(
        "netCDF4 is required. Install with: pip install netCDF4 numpy"
    ) from exc

OUTPUT_PATH = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "tds",
        "data",
        "amphan_bob_temperature_sample.nc",
    )
)

# CONTRACTS.md Section 1(b) / spike brief
TIME_HOURS = np.array([0.0, 24.0, 48.0], dtype=np.float64)  # since 2020-05-17T00:00Z
DEPTH_M = np.array([0.0, 10.0, 25.0, 50.0], dtype=np.float32)
LAT = np.linspace(8.0, 23.0, 61, dtype=np.float32)
LON = np.linspace(82.0, 92.0, 41, dtype=np.float32)


def _gaussian_bump(lat2d, lon2d, center_lat, center_lon, lat_scale=2.5, lon_scale=2.5):
    return np.exp(
        -(((lat2d - center_lat) / lat_scale) ** 2 + ((lon2d - center_lon) / lon_scale) ** 2)
    )


def build_fields():
    n_time, n_depth, n_lat, n_lon = len(TIME_HOURS), len(DEPTH_M), len(LAT), len(LON)
    lat2d, lon2d = np.meshgrid(LAT, LON, indexing="ij")

    temperature = np.empty((n_time, n_depth, n_lat, n_lon), dtype=np.float32)
    salinity = np.empty_like(temperature)
    current_u = np.empty_like(temperature)
    current_v = np.empty_like(temperature)
    chlorophyll = np.empty_like(temperature)

    for t_idx in range(n_time):
        # Warm core migrates slightly N/E so TIME changes are visible in WMS
        center_lat = 14.0 + t_idx * 1.5
        center_lon = 87.0 + t_idx * 0.4
        bump = _gaussian_bump(lat2d, lon2d, center_lat, center_lon)

        for d_idx, depth in enumerate(DEPTH_M):
            depth_frac = float(depth) / 50.0
            base_temp = 30.0 - depth_frac * 4.5  # ~30 C surface, ~25.5 C at 50 m
            warm_anomaly = 2.5 * bump * (1.0 - float(depth) / 70.0)
            lat_gradient = -0.05 * (lat2d - 15.0)
            temperature[t_idx, d_idx] = base_temp + warm_anomaly + lat_gradient

            salinity[t_idx, d_idx] = 33.5 + 0.4 * (lat2d - 15.0) / 15.0 - 0.2 * bump
            current_u[t_idx, d_idx] = 0.15 * np.sin((lon2d - 87.0) / 2.0) * (1.0 - 0.3 * depth_frac)
            current_v[t_idx, d_idx] = 0.10 * np.cos((lat2d - 14.0) / 3.0) * (1.0 - 0.3 * depth_frac)
            chlorophyll[t_idx, d_idx] = 0.08 + 0.35 * bump * np.exp(-depth_frac * 1.5)

    return temperature, salinity, current_u, current_v, chlorophyll


def _coord(ds, name, values, dtype, dims, **attrs):
    var = ds.createVariable(name, dtype, dims)
    var[:] = values
    for key, value in attrs.items():
        setattr(var, key, value)
    return var


def generate_sample_netcdf(output_path: str = OUTPUT_PATH) -> str:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    temperature, salinity, current_u, current_v, chlorophyll = build_fields()

    if os.path.exists(output_path):
        os.remove(output_path)

    # NETCDF3_CLASSIC: maximum TDS/ncWMS compatibility for a small spike grid
    with Dataset(output_path, "w", format="NETCDF3_CLASSIC") as ds:
        ds.createDimension("time", len(TIME_HOURS))
        ds.createDimension("depth", len(DEPTH_M))
        ds.createDimension("lat", len(LAT))
        ds.createDimension("lon", len(LON))

        _coord(
            ds,
            "time",
            TIME_HOURS,
            "f8",
            ("time",),
            standard_name="time",
            long_name="time",
            units="hours since 2020-05-17 00:00:00 UTC",
            calendar="gregorian",
            axis="T",
        )
        # CONTRACTS.md Section 1(b): positive="down" is required for ELEVATION
        _coord(
            ds,
            "depth",
            DEPTH_M,
            "f4",
            ("depth",),
            standard_name="depth",
            long_name="depth below sea surface",
            units="m",
            positive="down",
            axis="Z",
        )
        _coord(
            ds,
            "lat",
            LAT,
            "f4",
            ("lat",),
            standard_name="latitude",
            long_name="Latitude",
            units="degrees_north",
            axis="Y",
        )
        _coord(
            ds,
            "lon",
            LON,
            "f4",
            ("lon",),
            standard_name="longitude",
            long_name="Longitude",
            units="degrees_east",
            axis="X",
        )

        fill = np.float32(-9999.0)
        grid_vars = {
            "temperature": (
                temperature,
                "sea_water_temperature",
                "Sea Water Temperature",
                "degree_C",
            ),
            "salinity": (
                salinity,
                "sea_water_practical_salinity",
                "Sea Water Practical Salinity",
                "1e-3",
            ),
            "current_u": (
                current_u,
                "eastward_sea_water_velocity",
                "Eastward Sea Water Velocity",
                "m s-1",
            ),
            "current_v": (
                current_v,
                "northward_sea_water_velocity",
                "Northward Sea Water Velocity",
                "m s-1",
            ),
            "chlorophyll": (
                chlorophyll,
                "mass_concentration_of_chlorophyll_a_in_sea_water",
                "Chlorophyll-a Concentration",
                "mg m-3",
            ),
        }

        for name, (data, standard_name, long_name, units) in grid_vars.items():
            var = ds.createVariable(
                name,
                "f4",
                ("time", "depth", "lat", "lon"),
                fill_value=fill,
            )
            var[:] = data
            var.standard_name = standard_name
            var.long_name = long_name
            var.units = units
            var.coordinates = "time depth lat lon"

        ds.Conventions = "CF-1.8"
        ds.title = "Synthetic Bay of Bengal grid — Super Cyclone Amphan Stage 1(a) spike"
        ds.institution = "INCOIS / SIH-2026"
        ds.source = "Synthetic warm-core test grid for TDS WMS Cesium spike"
        ds.history = "Generated by spike_generate_sample_netcdf.py"
        ds.comment = (
            "temperature includes a Gaussian warm-core bump near 14N, 87E "
            "that migrates north with time so WMS TIME/ELEVATION changes are visible."
        )

    return output_path


if __name__ == "__main__":
    path = generate_sample_netcdf()
    print(f"Wrote {path} ({os.path.getsize(path)} bytes)")
