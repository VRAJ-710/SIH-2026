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
| `instrument_type`| `string` | Enum exactly: `["argo", "glider", "buoy", "ctd"]` |

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
Retrieves the vertical profiling data (depth series measurements) for a specific instrument.

- **Path Parameters:**
  - `instrument_id` (string, path parameter, e.g., `"2902086"`)
- **Query Parameters:**
  - `time` (string, optional, retrieves profile at a specific timestamp. If omitted, returns latest profile)

- **Response:** `application/json` (Ordered vertical profile sequence)

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
  "data": [
    {
      "depth": 1.5,
      "temperature": 29.8,
      "salinity": 32.4,
      "chlorophyll": 0.12
    },
    {
      "depth": 5.0,
      "temperature": 29.5,
      "salinity": 32.5,
      "chlorophyll": 0.15
    },
    {
      "depth": 10.0,
      "temperature": 28.9,
      "salinity": 33.1,
      "chlorophyll": 0.22
    },
    {
      "depth": 25.0,
      "temperature": 27.2,
      "salinity": 33.8,
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
  }
]
```
