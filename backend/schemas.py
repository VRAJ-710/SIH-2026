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
