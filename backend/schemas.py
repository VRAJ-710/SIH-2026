"""Pydantic schemas strictly matching docs/CONTRACTS.md Section 3."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


class InstrumentMarker(BaseModel):
    """Schema for GET /instruments response items per CONTRACTS.md Section 3(a)."""
    instrument_id: str
    instrument_type: str
    lat: float
    lon: float
    latest_time: str
    variables: list[str]


class InstrumentProfile(BaseModel):
    """Schema for GET /instrument/{instrument_id}/profile response per CONTRACTS.md Section 3(b)."""
    instrument_id: str
    instrument_type: str
    lat: float
    lon: float
    time: str
    data: list[dict[str, Any]]


class VariableMetadata(BaseModel):
    """Schema for individual variable metadata in GET /variables per CONTRACTS.md Section 3(c)."""
    name: str
    display_name: str
    unit: str
    min_val: float
    max_val: float
    palette: str


class VariablesResponse(BaseModel):
    """Schema for GET /variables response per CONTRACTS.md Section 3(c)."""
    variables: list[VariableMetadata]


class PluginStatus(BaseModel):
    """Schema for GET /plugins response items per CONTRACTS.md Section 3(d)."""
    name: str
    type: Literal["grid", "point"]
    status: Literal["live", "sample", "stub"]


class VolumeResolution(BaseModel):
    """3D grid voxel counts per dimension."""
    lon: int
    lat: int
    depth: int


class VolumeValueRange(BaseModel):
    """Minimum and maximum values across valid non-sentinel ocean voxels."""
    min: float | None = None
    max: float | None = None


class VolumeResponse(BaseModel):
    """Schema for GET /volume response per CONTRACTS.md Section 3(f)."""
    bbox: list[float]
    time: str
    variable: str
    depth_range: list[float]
    resolution: VolumeResolution
    value_range: VolumeValueRange
    land_sentinel: float = -9999.0
    values: list[float]
