# Unified System Contracts

This document establishes the strict, locked data schemas, TDS naming conventions, and FastAPI REST API endpoint definitions for the INCOIS Ocean Data Visualization Platform.

Every component (ingestion pipelines, TDS cataloging, FastAPI endpoints, and the React frontend) **must** strictly conform to these contracts. No changes, extensions, or renegotiations of these structures are allowed without system-wide coordination.

---

## 1. Data Schemas

### (a) Point-Data Schema (Argo, Glider, Buoy, CTD)
All in-situ point data processed by the ingestion engine must be unified into a structured table (e.g., pandas DataFrame, database table) containing **exactly** these columns and types:

| Column Name | Type | Description / Constraints |
| :--- | :--- | :--- |
| `lat` | `float` | Decimal degrees, WGS84 coordinate system (e.g., `14.25`) |
| `lon` | `float` | Decimal degrees, WGS84 coordinate system, range: `[-180.0, 180.0]` |
| `depth` | `float` | Meters, **positive down** (e.g., `5.2` for 5.2 meters below sea surface) |
| `time` | `string` | ISO8601 UTC timestamp format: `YYYY-MM-DDTHH:MM:SSZ` |
| `variable` | `string` | Enum exactly: `["temperature", "salinity", "chlorophyll", "current_u", "current_v"]` |
| `value` | `float` | Measured parameter value in corresponding standard units |
| `instrument_id` | `string` | Source's native identifier (e.g., Argo WMO number like `"2902086"`, buoy name like `"BD11"`) |
| `instrument_type`| `string` | Enum exactly: `["argo", "glider", "buoy", "ctd", "adcp"]` |

*Note:* No extra columns are permitted in this table. All measurements across all sensors are represented vertically (normalized/melted format).

---

### (b) Grid-Data Schema
All grid ingestors must output CF-compliant NetCDF files. Dimension and variable naming is strict:

#### NetCDF Dimensions:
- `time` (standard coordinate variable: hours/days since a reference date, UTC)
- `depth` (positive down, meters — **must carry the CF attribute `positive: "down"` on the depth coordinate variable**. Without this attribute, TDS/ncWMS can misinterpret the sign convention and the `ELEVATION` WMS parameter will silently select the wrong layer.)
- `lat` (decimal degrees north, coordinate array matching the bounding box `[8.0, 23.0]`)
- `lon` (decimal degrees east, coordinate array matching the bounding box `[82.0, 92.0]`)

#### NetCDF Variables (exactly):
- `temperature` (Kelvin or degrees Celsius)
- `salinity` (psu)
- `current_u` (m/s, eastward velocity component)
- `current_v` (m/s, northward velocity component)
- `chlorophyll` (mg/m³)

> **CRITICAL:** TDS relies on these exact dimension and variable names, plus the `positive: "down"` attribute on `depth`. Any grid file that deviates from this naming or omits the attribute will break TDS metadata parsing or WMS layer mapping.

---

## 2. WMS Layer & TDS Dataset Naming Convention

Gridded ocean variables are cataloged and served via THREDDS Data Server (TDS) using a predictable URL structure.

### TDS Dataset ID
```
amphan_bob/{variable}
```
Where `{variable}` is one of the grid variables: `temperature`, `salinity`, `current_u`, `current_v`, or `chlorophyll`.

### Frontend WMS GetMap Contract
The frontend (React + CesiumJS) queries the TDS WMS server using the following schema.

#### WMS Endpoint Base URL:
```
http://localhost:8080/thredds/wms/amphan_bob/{variable}
```

#### GetMap Query Parameters:
- `SERVICE`: `WMS`
- `VERSION`: `1.3.0`
- `REQUEST`: `GetMap`
- `LAYERS`: `{variable}` (e.g., `temperature`)
- `STYLES`: `` (empty string — accept the server's default style rather than naming one explicitly; WMS 1.3.0 requires this parameter to be present even if empty)
- `CRS`: `CRS:84` (always lon,lat axis order regardless of WMS version — deliberately used instead of `EPSG:4326` to avoid that CRS's lat/lon-vs-lon/lat axis-order ambiguity under WMS 1.3.0)
- `BBOX`: `{min_lon},{min_lat},{max_lon},{max_lat}` (e.g., `82.0,8.0,92.0,23.0`)
- `WIDTH`: `256`
- `HEIGHT`: `256`
- `FORMAT`: `image/png`
- `TRANSPARENT`: `true`
- `TIME`: `{ISO8601_Timestamp}` (e.g., `2020-05-18T12:00:00Z`)
- `ELEVATION`: `{depth_meters}` (positive down, e.g., `10.0`)

#### Concrete Frontend GetMap Request Example:
```
http://localhost:8080/thredds/wms/amphan_bob/temperature?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=temperature&STYLES=&CRS=CRS:84&BBOX=82.0,8.0,92.0,23.0&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true&TIME=2020-05-18T12:00:00Z&ELEVATION=5.0
```

> **Note for the Cesium implementation (Stage 1/4):** `Cesium.WebMapServiceImageryProvider` must be configured with a matching `crs: 'CRS:84'` (or equivalent lon/lat-order parameter set) — this is a frontend config detail, not a contract change, but it must match what's defined here or tiles will misalign.

---

## 3. REST Endpoint Contract for FastAPI Backend

The `/backend` application serves metadata, configuration, and in-situ analytical point data over HTTP REST.

> **Note on bbox ordering — intentionally different from Section 2:** the `bbox` query parameter below uses `min_lat,min_lon,max_lat,max_lon` order (typical for a human-readable REST API), while the WMS `BBOX` parameter in Section 2 uses `min_lon,min_lat,max_lon,max_lat` order (required by `CRS:84`). These are two separate contracts by design — **do not assume they share an order.** Any code that reads a bbox from one and forwards it to the other must explicitly reorder it.

### (a) GET `/instruments`
Retrieves a filtered list of instrument coordinate markers within the bounding box and time window.

- **Query Parameters:**
  - `bbox` (string, optional, format: `"min_lat,min_lon,max_lat,max_lon"`, default: `"8,82,23,92"`)
  - `time_range` (string, optional, format: `"start_time,end_time"`, default: `"2020-05-13T00:00:00Z,2020-05-25T23:59:59Z"`)
  - `instrument_type` (string, optional, e.g., `"argo"`, `"buoy"`, `"glider"`, `"ctd"`)

- **Response:** `application/json` (List of instrument markers with metadata)

> Note: Instruments with status `"sample"` (per Section 3(d)'s plugin registry — currently glider, buoy) are illustrative and NOT subject to `bbox`/`time_range` filtering, since their coordinates/timestamps don't necessarily align with the queried scenario. This ensures they consistently appear on the map for demonstration purposes.

#### Example Request:
```http
GET /instruments?bbox=8,82,23,92&time_range=2020-05-13T00:00:00Z,2020-05-25T23:59:59Z&instrument_type=argo
```

#### Example Response:
```json
[
  {
    "instrument_id": "2902086",
    "instrument_type": "argo",
    "lat": 14.25,
    "lon": 87.12,
    "latest_time": "2020-05-18T06:30:00Z",
    "variables": ["temperature", "salinity", "chlorophyll"]
  }
]
```

---

### (b) GET `/instrument/{instrument_id}/profile`
Retrieves the vertical profiling data (depth series measurements) for a specific instrument, alongside collocated model reanalysis data for direct validation comparison.

- **Path Parameters:**
  - `instrument_id` (string, path parameter, e.g., `"2902086"`)
- **Query Parameters:**
  - `time` (string, optional, retrieves profile at a specific timestamp. If omitted, returns latest profile)

- **Response:** `application/json` (Ordered vertical profile sequence with model validation)

- **Model vs Observation Validation Fields:**
  - `model_temperature_mae` (float | null): Mean Absolute Error (MAE, in °C) between observed and model temperature across all depths where both values exist. Excluded (`null`) for glider data due to time window mismatch.
  - `model_salinity_mae` (float | null): Mean Absolute Error (MAE, in PSU) between observed and model salinity across all depths where both values exist. Excluded (`null`) for glider data.
  - Per depth entry in `data`:
    - `temperature_model` (float | null): Physical ocean model (GLORYS12V1 `amphan_bob_real.nc`) temperature interpolated to the instrument's exact coordinates, nearest model time slice, and interpolated to the instrument's **exact measured depths** (not model depth levels).
    - `salinity_model` (float | null): GLORYS12V1 salinity interpolated to the instrument's exact measured depths.
  - **Partial Availability**: If an instrument's measured depth falls beyond the model grid's vertical coverage at that specific location (e.g. surface layer < 0.494m or deep depths beyond the local seafloor bathymetry), `temperature_model` and `salinity_model` return `null` for just that specific depth item. Partial availability preserves all valid comparisons, and null depths are excluded from the MAE calculation.
  - **Glider Exclusion**: BoBBLE 2016 glider data is sample/illustrative demonstration data from July 2016, whereas the model grid covers Cyclone Amphan (May 2020). For glider instruments, `temperature_model`, `salinity_model`, `model_temperature_mae`, and `model_salinity_mae` are explicitly returned as `null`.

> Note: this response is intentionally **pivoted** (one row per depth, with `temperature`/`salinity`/`chlorophyll` as columns) for direct Plotly charting — this differs from the melted `variable`/`value` internal storage format in Section 1(a). This is a deliberate API-layer transformation, not a schema contradiction.

#### Example Request:
```http
GET /instrument/2902086/profile?time=2020-05-18T06:30:00Z
```

#### Example Response:
```json
{
  "instrument_id": "2902086",
  "instrument_type": "argo",
  "lat": 14.25,
  "lon": 87.12,
  "time": "2020-05-18T06:30:00Z",
  "model_temperature_mae": 0.230,
  "model_salinity_mae": 0.037,
  "data": [
    {
      "depth": 1.5,
      "temperature": 29.8,
      "temperature_model": 29.53,
      "salinity": 32.4,
      "salinity_model": 32.95,
      "chlorophyll": 0.12
    },
    {
      "depth": 5.0,
      "temperature": 29.5,
      "temperature_model": 29.49,
      "salinity": 32.5,
      "salinity_model": 32.95,
      "chlorophyll": 0.15
    },
    {
      "depth": 10.0,
      "temperature": 28.9,
      "temperature_model": 29.44,
      "salinity": 33.1,
      "salinity_model": 33.02,
      "chlorophyll": 0.22
    },
    {
      "depth": 25.0,
      "temperature": 27.2,
      "temperature_model": 27.85,
      "salinity": 33.8,
      "salinity_model": 33.41,
      "chlorophyll": 0.05
    }
  ]
}
```

---

### (c) GET `/variables`
Retrieves descriptions, units, and default visualization styles for available ocean grid variables. This allows the UI to automatically adapt its color scales and legends.

- **Response:** `application/json`

#### Example Request:
```http
GET /variables
```

#### Example Response:
```json
{
  "variables": [
    {
      "name": "temperature",
      "display_name": "Sea Surface Temperature",
      "unit": "°C",
      "min_val": 20.0,
      "max_val": 32.0,
      "palette": "coolwarm"
    },
    {
      "name": "salinity",
      "display_name": "Sea Surface Salinity",
      "unit": "psu",
      "min_val": 28.0,
      "max_val": 36.0,
      "palette": "haline"
    },
    {
      "name": "current_u",
      "display_name": "Eastward Current Velocity",
      "unit": "m/s",
      "min_val": -2.0,
      "max_val": 2.0,
      "palette": "balance"
    },
    {
      "name": "current_v",
      "display_name": "Northward Current Velocity",
      "unit": "m/s",
      "min_val": -2.0,
      "max_val": 2.0,
      "palette": "balance"
    },
    {
      "name": "chlorophyll",
      "display_name": "Chlorophyll-a Concentration",
      "unit": "mg/m³",
      "min_val": 0.01,
      "max_val": 5.0,
      "palette": "algae"
    }
  ]
}
```

---

### (d) GET `/plugins`
Lists all registered ingestion pipelines, tracking which source streams are operational or mocked.

- **Status Values:**
  - `"live"`: Operational pipeline fetching real, currently-fetchable data from live or archive providers.
  - `"sample"`: Fully working pipeline running against illustrative/sample or offline reference data.
  - `"stub"`: Ingestor interface defined but pipeline execution not yet implemented.

- **Response:** `application/json` (List of ingestor plugin statuses)

#### Example Request:
```http
GET /plugins
```

#### Example Response:
```json
[
  {
    "name": "Copernicus Marine GLORYS12V1 Ingestor",
    "type": "grid",
    "status": "live"
  },
  {
    "name": "argopy/erddapy Ifremer Argo Ingestor",
    "type": "point",
    "status": "live"
  },
  {
    "name": "OMNI Moored Buoy Ingestor",
    "type": "point",
    "status": "sample"
  },
  {
    "name": "Glider Sample Loader",
    "type": "point",
    "status": "sample"
  },
  {
    "name": "Copernicus Marine NRT Ingestor (Live Mode)",
    "type": "grid",
    "status": "stub"
  }
]
```

---

### (e) GET `/health`
Health check endpoint used by container orchestrators (e.g., Docker Compose, Kubernetes) to verify backend service readiness.

- **Response:** `application/json`

#### Example Request:
```http
GET /health
```

#### Example Response:
```json
{
  "status": "ok",
  "service": "incois-backend"
}
```

---

### (f) GET `/volume`
Retrieves a uniformly-gridded 3D subset of physical ocean reanalysis data for volumetric 3D visualization.

- **Query Parameters:**
  - `bbox` (string, optional, format: `"min_lon,min_lat,max_lon,max_lat"`, default: `"84,14,90,18"`)
  - `time` (string, optional, format: ISO8601 UTC timestamp `YYYY-MM-DDTHH:MM:SSZ`, default: `"2020-05-21T00:00:00Z"`)
  - `variable` (string, optional, enum: `["temperature", "salinity"]`, default: `"temperature"`)
  - `max_depth` (float, optional, positive depth in meters below ocean surface, default: `200.0`)
  - `resolution` (string, optional, format: `"lon,lat,depth"`, default: `"32,32,16"`)

- **Response:** `application/json`
  - `bbox`: `[min_lon, min_lat, max_lon, max_lat]`
  - `time`: Matched ISO8601 UTC timestamp
  - `variable`: Queried variable name
  - `depth_range`: `[actual_min_depth_used, actual_max_depth_used]` in meters
  - `resolution`: `{"lon": 32, "lat": 32, "depth": 16}`
  - `value_range`: `{"min": float, "max": float}` (computed exclusively over valid, non-sentinel ocean voxels)
  - `land_sentinel`: `-9999` (constant indicator representing land, seabed bathymetry, or missing data)
  - `values`: Flattened array of `lon * lat * depth` floats in row-major layout matching `data[z * width * height + y * width + x]`, where `x` is longitude index (`0..lon-1`), `y` is latitude index (`0..lat-1`), and `z` is depth index (`0..depth-1`). Land, seabed, and NaN cells are replaced with `land_sentinel`.

#### Example Request:
```http
GET /volume?bbox=84,14,90,18&time=2020-05-21T00:00:00Z&variable=temperature&max_depth=200&resolution=32,32,16
```

#### Example Response:
```json
{
  "bbox": [84.0, 14.0, 90.0, 18.0],
  "time": "2020-05-21T00:00:00Z",
  "variable": "temperature",
  "depth_range": [0.494, 186.126],
  "resolution": {
    "lon": 32,
    "lat": 32,
    "depth": 16
  },
  "value_range": {
    "min": 11.6852,
    "max": 31.0156
  },
  "land_sentinel": -9999,
  "values": [
    30.2508,
    30.2315,
    30.2677,
    30.1099,
    29.9335,
    29.6794,
    29.4581,
    29.1971,
    28.9472,
    28.8021
  ]
}
```

