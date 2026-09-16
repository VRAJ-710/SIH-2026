"""Endpoints for in-situ instrument markers and vertical depth profiles.

Strictly conforms to docs/CONTRACTS.md Section 3(a) and Section 3(b).
"""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException, Query

from backend.data_store import store
from backend.schemas import InstrumentMarker, InstrumentProfile

router = APIRouter(tags=["instruments"])


@router.get(
    "/instruments",
    response_model=list[InstrumentMarker],
    summary="List instrument markers within bounding box and time range",
)
def get_instruments(
    bbox: str = Query(
        "8,82,23,92",
        description="Bounding box in min_lat,min_lon,max_lat,max_lon order",
    ),
    time_range: str = Query(
        "2020-05-13T00:00:00Z,2020-05-25T23:59:59Z",
        description="ISO8601 UTC time range in start_time,end_time format",
    ),
    instrument_type: str | None = Query(
        None,
        description="Filter by instrument type (e.g., 'argo', 'buoy', 'glider', 'ctd')",
    ),
) -> list[dict[str, Any]]:
    """Retrieve filtered list of instrument coordinate markers per CONTRACTS.md Section 3(a)."""
    return store.get_instruments(
        bbox=bbox,
        time_range=time_range,
        instrument_type=instrument_type,
    )


@router.get(
    "/instrument/{instrument_id}/profile",
    response_model=InstrumentProfile,
    summary="Retrieve vertical profiling depth measurements for an instrument",
)
def get_instrument_profile(
    instrument_id: str,
    time: str | None = Query(
        None,
        description="Specific observation timestamp (ISO8601 UTC). If omitted, returns latest profile.",
    ),
) -> dict[str, Any]:
    """Retrieve pivoted depth profile data per CONTRACTS.md Section 3(b)."""
    profile = store.get_profile(instrument_id=instrument_id, time=time)
    if not profile:
        msg = (
            f"Profile for instrument '{instrument_id}' at time '{time}' not found"
            if time
            else f"Instrument '{instrument_id}' not found"
        )
        raise HTTPException(status_code=404, detail=msg)
    return profile
