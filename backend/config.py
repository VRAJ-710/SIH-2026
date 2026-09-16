"""Configuration and environment settings for the FastAPI backend."""

import os
from pathlib import Path

# Base directories
BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parent

# Resolve ingestion output directory containing the parquet files:
# 1. Check DATA_DIR environment variable
# 2. Check repo root / ingestion / output
# 3. Check current working directory / ingestion / output
def get_data_dir() -> Path:
    env_dir = os.environ.get("DATA_DIR")
    if env_dir and Path(env_dir).exists():
        return Path(env_dir)

    default_path = REPO_ROOT / "ingestion" / "output"
    if default_path.exists():
        return default_path

    cwd_path = Path.cwd() / "ingestion" / "output"
    if cwd_path.exists():
        return cwd_path

    # Fallback to local data dir inside backend if mounted/copied
    fallback_path = BACKEND_DIR / "data"
    return fallback_path

DATA_DIR = get_data_dir()
