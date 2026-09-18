"""FastAPI Backend Application for INCOIS Ocean Data Visualization Platform.

Strictly adheres to docs/CONTRACTS.md Section 3.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from backend.data_store import store
from backend.routers import instruments, metadata, volume
from backend.volume_store import volume_store

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("backend")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Lifespan context manager to report data status on startup."""
    logger.info("Initializing INCOIS backend service...")
    if store.is_empty:
        logger.warning(
            "DataStore is empty! Ensure Stage 2 parquet files exist in ingestion/output."
        )
    else:
        logger.info("DataStore ready with in-situ point observations.")

    if volume_store.is_available:
        logger.info("VolumeStore ready with physical ocean NetCDF data.")
    else:
        logger.warning(
            "VolumeStore unavailable: physical NetCDF not found at %s",
            volume_store.nc_path,
        )

    yield
    logger.info("Shutting down backend service.")


app = FastAPI(
    title="INCOIS Ocean Data Platform Backend",
    description="REST API serving ocean analytical point data, metadata, and ingestion plugins for Super Cyclone Amphan.",
    version="1.0.0",
    lifespan=lifespan,
)

# Mount routes at root (matching CONTRACTS.md Section 3)
app.include_router(instruments.router)
app.include_router(metadata.router)
app.include_router(volume.router)

# Mount routes also under /api to seamlessly handle Vite proxy requests ('/api' -> backend)
app.include_router(instruments.router, prefix="/api")
app.include_router(metadata.router, prefix="/api")
app.include_router(volume.router, prefix="/api")


@app.get("/health", tags=["system"])
def health_check() -> dict[str, str]:
    """Simple health check endpoint."""
    return {"status": "ok", "service": "incois-backend"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
