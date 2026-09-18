"""Endpoint for 3D uniform ocean subgrid volume data.

Strictly conforms to docs/CONTRACTS.md Section 3(f).
"""

from __future__ import annotations

import logging
from typing import Any
from fastapi import APIRouter, HTTPException, Query

from backend.schemas import VolumeResponse
from backend.volume_store import volume_store

logger = logging.getLogger(__name__)

router = APIRouter(tags=["volume"])


@router.get(
    "/volume",
    response_model=VolumeResponse,
    summary="Retrieve uniformly-gridded 3D subset of ocean physical data",
)
def get_volume(
    bbox: str = Query(
        "84,14,90,18",
        description="Bounding box in min_lon,min_lat,max_lon,max_lat order",
    ),
    time: str = Query(
        "2020-05-21T00:00:00Z",
        description="ISO8601 UTC timestamp",
    ),
    variable: str = Query(
        "temperature",
        description="Physical ocean variable ('temperature' or 'salinity')",
    ),
    max_depth: float = Query(
        200.0,
        description="Maximum depth below surface in meters (positive float)",
    ),
    resolution: str = Query(
        "32,32,16",
        description="Grid resolution in lon,lat,depth voxel counts (e.g. '32,32,16')",
    ),
) -> dict[str, Any]:
    """Retrieve uniformly-interpolated 3D volume block per CONTRACTS.md Section 3(f)."""
    # Parse and validate bbox
    try:
        bbox_parts = [float(p.strip()) for p in bbox.split(",")]
        if len(bbox_parts) != 4:
            raise ValueError("Expected 4 comma-separated values")
        min_lon, min_lat, max_lon, max_lat = bbox_parts
        if min_lon >= max_lon or min_lat >= max_lat:
            raise ValueError("min coordinate must be strictly less than max coordinate")
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid bbox parameter '{bbox}'. Expected format 'min_lon,min_lat,max_lon,max_lat': {exc}",
        )

    # Parse and validate resolution
    try:
        res_parts = [int(p.strip()) for p in resolution.split(",")]
        if len(res_parts) != 3:
            raise ValueError("Expected 3 comma-separated integers")
        res_lon, res_lat, res_depth = res_parts
        if res_lon < 2 or res_lat < 2 or res_depth < 2:
            raise ValueError("Grid resolution counts must each be >= 2")
        if res_lon > 128 or res_lat > 128 or res_depth > 64:
            raise ValueError("Grid resolution counts exceed allowable limits")
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid resolution parameter '{resolution}'. Expected format 'lon,lat,depth': {exc}",
        )

    # Validate variable
    var_clean = variable.strip().lower()
    if var_clean not in ["temperature", "salinity"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid variable '{variable}'. Only 'temperature' or 'salinity' are supported for 3D volume view.",
        )

    # Validate max_depth
    if max_depth <= 0:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid max_depth '{max_depth}'. Must be positive depth in meters.",
        )

    # Check store readiness
    if not volume_store.is_available:
        raise HTTPException(
            status_code=503,
            detail="Physical ocean NetCDF dataset is not currently available on the server.",
        )

    try:
        volume_data = volume_store.extract_volume(
            bbox=[min_lon, min_lat, max_lon, max_lat],
            time_str=time,
            variable=var_clean,
            max_depth=max_depth,
            res_lon=res_lon,
            res_lat=res_lat,
            res_depth=res_depth,
        )
        return volume_data
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to extract volume: %s", exc)
        raise HTTPException(status_code=500, detail=f"Internal volume extraction error: {exc}")
