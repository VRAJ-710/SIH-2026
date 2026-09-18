/**
 * fetchVolumeData.ts
 *
 * API client for the GET /api/volume endpoint (CONTRACTS.md §3(f)).
 * Fetches a 3D scalar field of ocean data for volumetric rendering.
 *
 * The time parameter is passed in from the live app state (Stage 5's
 * time scrubber) — it is never hardcoded.
 */

/** Shape of the raw JSON response from GET /api/volume. */
export interface VolumeApiResponse {
  bbox: [number, number, number, number];
  time: string;
  variable: string;
  depth_range: [number, number];
  resolution: { lon: number; lat: number; depth: number };
  value_range: { min: number; max: number };
  land_sentinel: number;
  values: number[];
}

/**
 * Processed volume data ready for Three.js rendering.
 * The ScalarField layout matches Data3DTexture expectations:
 *   data[z * width * height + y * width + x]
 * where x = lon index, y = lat index, z = depth index.
 */
export interface VolumeData {
  /** Float32Array in row-major (depth, lat, lon) layout. */
  data: Float32Array;
  /** Grid cells along the longitude axis (x). */
  width: number;
  /** Grid cells along the latitude axis (y). */
  height: number;
  /** Grid cells along the depth axis (z). */
  depth: number;
  /** Minimum valid (non-sentinel) value in the field. */
  min: number;
  /** Maximum valid (non-sentinel) value in the field. */
  max: number;
  /** The sentinel value marking land/missing cells. */
  landSentinel: number;
  /** Actual depth range used [min_depth, max_depth] in meters. */
  depthRange: [number, number];
  /** The matched ISO8601 timestamp from the response. */
  time: string;
  /** The bounding box used. */
  bbox: [number, number, number, number];
}

/**
 * Default cold-wake region bbox.
 * Format: min_lon,min_lat,max_lon,max_lat (per CONTRACTS.md §3(f)).
 */
const DEFAULT_BBOX = '84,14,90,18';

/**
 * Fetch a 3D volume of ocean data from the backend.
 *
 * @param time  ISO8601 UTC timestamp from the app's time scrubber state.
 * @param options  Optional overrides (bbox, variable, max_depth, resolution).
 * @returns Processed VolumeData ready for Three.js rendering.
 */
export async function fetchVolumeData(
  time: string,
  options?: {
    bbox?: string;
    variable?: string;
    maxDepth?: number;
    resolution?: string;
  },
): Promise<VolumeData> {
  const bbox = options?.bbox ?? DEFAULT_BBOX;
  const variable = options?.variable ?? 'temperature';
  const maxDepth = options?.maxDepth ?? 200;
  const resolution = options?.resolution ?? '32,32,16';

  const params = new URLSearchParams({
    bbox,
    time,
    variable,
    max_depth: String(maxDepth),
    resolution,
  });

  const res = await fetch(`/api/volume?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`GET /api/volume failed: ${res.status} ${res.statusText}`);
  }

  const json: VolumeApiResponse = await res.json();

  // The API returns values in row-major (depth, lat, lon) layout:
  //   data[z * lon * lat + y * lon + x]
  // This matches Three.js Data3DTexture(data, width=lon, height=lat, depth=depth).
  const data = new Float32Array(json.values);

  return {
    data,
    width: json.resolution.lon,
    height: json.resolution.lat,
    depth: json.resolution.depth,
    min: json.value_range.min,
    max: json.value_range.max,
    landSentinel: json.land_sentinel,
    depthRange: json.depth_range,
    time: json.time,
    bbox: json.bbox,
  };
}
