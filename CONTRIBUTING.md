# Contributing Guidelines

Thank you for contributing to the INCOIS Ocean Data Visualization Platform. To ensure a highly reliable, consistent, and offline-compatible application for hackathon presentation, all contributors and AI agents must strictly follow these rules:

---

## 1. Zero Large Data Commits to Git
- **Never commit large, raw oceanographic datasets** (NetCDF, large CSVs, JSON dumps, GRIB files) directly to this repository.
- To enable automated testing and local developer workflows, store **only small, highly summarized, or mocked sample data files** under `/ingestion/sample_data/`.
- Maintain a `.gitignore` that prevents unintentional commits of heavy datasets.

---

## 2. Absolute Adherence to Locked Contracts
- All ingestion pipelines, backend REST endpoints, TDS WMS query constructs, and frontend UI visualization must strictly match `/docs/CONTRACTS.md`.
- **Do not invent, rename, or renegotiate** variables, dimension keys, table columns, or query parameter keys.
- Any modification or deviation from the contract will immediately break integration boundaries between the backend, TDS WMS, and the 3D frontend canvas.

---

## 3. Strict Offline & Cached Fallback Requirement
- The primary target of this codebase is a **flawless live hackathon demonstration running on local hardware (potentially completely offline)**.
- **No production or ingestion code path may silently depend on active internet access or external APIs** (such as live Copernicus, argopy, or INCOIS servers) without an immediate, robust fallback.
- Ingestion scripts must check if local cached files are present in `/ingestion/sample_data/` and default to loading from them. If live APIs are slow or down, the system should behave normally.
- Mock handlers must be available for all API and WMS datasets to guarantee consistent demo performance.
