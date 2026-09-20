"""Endpoints for variables metadata and ingestor plugin statuses.

Strictly conforms to docs/CONTRACTS.md Section 3(c) and amended Section 3(d).
"""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter

from backend.schemas import PluginStatus, VariablesResponse

router = APIRouter(tags=["metadata"])

# ---------------------------------------------------------------------------
# Section 3(c) Variables Metadata
#
# IMPORTANT ARCHITECTURAL NOTE (Stage 2/3 Data Contract Gap):
# The 'chlorophyll' variable metadata below applies to in-situ point instruments
# (e.g. BGC-Argo floats) and the Stage 1 synthetic grid dataset.
# The REAL physical grid reanalysis (tds/data/amphan_bob_real.nc, derived from
# GLORYS12V1) contains ONLY physical variables (temperature, salinity, current_u,
# current_v) and DOES NOT have a real chlorophyll grid/WMS layer.
# Frontend components querying THREDDS WMS for chlorophyll must query the Stage 1
# synthetic dataset or await follow-up BGC reanalysis ingestion.
# ---------------------------------------------------------------------------
VARIABLES_CATALOG: list[dict[str, Any]] = [
    {
        # Note: The min_val/max_val here (20-32°C) are a default surface view range,
        # not the full data range. Real GLORYS12 data spans ~1.06°C to 34.85°C across
        # depth. Stage 7's colorbar editor must be careful not to silently clip
        # deep-water or extreme values when a user changes depth.
        "name": "temperature",
        "display_name": "Sea Surface Temperature",
        "unit": "°C",
        "min_val": 20.0,
        "max_val": 32.0,
        "palette": "coolwarm",
    },
    {
        "name": "salinity",
        "display_name": "Sea Surface Salinity",
        "unit": "psu",
        "min_val": 28.0,
        "max_val": 36.0,
        "palette": "haline",
    },
    {
        "name": "current_u",
        "display_name": "Eastward Current Velocity",
        "unit": "m/s",
        "min_val": -2.0,
        "max_val": 2.0,
        "palette": "balance",
    },
    {
        "name": "current_v",
        "display_name": "Northward Current Velocity",
        "unit": "m/s",
        "min_val": -2.0,
        "max_val": 2.0,
        "palette": "balance",
    },
    {
        "name": "chlorophyll",
        "display_name": "Chlorophyll-a Concentration",
        "unit": "mg/m³",
        "min_val": 0.01,
        "max_val": 5.0,
        "palette": "algae",
    },
]

# ---------------------------------------------------------------------------
# Section 3(d) Plugins Registry (Amended per Stage 2 outcomes)
# - Copernicus Marine GLORYS12V1 Ingestor -> 'live'
# - argopy/erddapy Ifremer Argo Ingestor -> 'live'
# - OMNI Moored Buoy Ingestor -> 'sample' (illustrative fallback; no open API)
# - Glider Sample Loader -> 'sample' (illustrative BoBBLE 2016 fallback)
# ---------------------------------------------------------------------------
PLUGINS_REGISTRY: list[dict[str, Any]] = [
    {
        "name": "Copernicus Marine GLORYS12V1 Ingestor",
        "type": "grid",
        "status": "live",
    },
    {
        "name": "argopy/erddapy Ifremer Argo Ingestor",
        "type": "point",
        "status": "live",
    },
    {
        "name": "OMNI Moored Buoy Ingestor",
        "type": "point",
        "status": "sample",
    },
    {
        "name": "Glider Sample Loader",
        "type": "point",
        "status": "sample",
    },
    {
        "name": "ADCP Ingestor",
        "type": "point",
        "status": "stub",
    },
    {
        "name": "Copernicus Marine NRT Ingestor (Live Mode)",
        "type": "grid",
        "status": "stub",
    },
]


@router.get(
    "/variables",
    response_model=VariablesResponse,
    summary="Retrieve descriptions, units, and default palettes for ocean variables",
)
def get_variables() -> dict[str, Any]:
    """Return variable descriptions, ranges, and palettes per CONTRACTS.md Section 3(c)."""
    return {"variables": VARIABLES_CATALOG}


@router.get(
    "/plugins",
    response_model=list[PluginStatus],
    summary="List all registered ingestion pipelines and operational statuses",
)
def get_plugins() -> list[dict[str, Any]]:
    """Return ingestor plugin statuses per amended CONTRACTS.md Section 3(d)."""
    return PLUGINS_REGISTRY
