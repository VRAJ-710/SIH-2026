/**
 * generateScalarField.ts
 *
 * Produces a synthetic 3D scalar field representing a fake sea-surface
 * temperature anomaly with a warm-core Gaussian blob roughly centred
 * in the volume.  Values range ~26–30 °C.
 *
 * The returned Float32Array is laid out so that the x-index (lon) varies
 * fastest, then y (lat), then z (depth) — i.e.
 *
 *   data[z * width * height + y * width + x]
 *
 * This is the memory layout that Three.js's Data3DTexture expects when
 * constructed as  new Data3DTexture(data, width, height, depth).
 */

export interface ScalarFieldConfig {
  /** Grid cells along the longitude axis (x). Default 32. */
  width?: number;
  /** Grid cells along the latitude axis (y).  Default 32. */
  height?: number;
  /** Grid cells along the depth axis (z).     Default 16. */
  depth?: number;
}

export interface ScalarField {
  data: Float32Array;
  width: number;
  height: number;
  depth: number;
  /** The minimum value stored in the field. */
  min: number;
  /** The maximum value stored in the field. */
  max: number;
}

/**
 * Generate the synthetic temperature volume.
 *
 * The field is a background temperature of ~26 °C with a 3D Gaussian
 * warm-core anomaly peaking at ~30 °C, centred slightly off-centre
 * so the blob doesn't look artificially symmetric.
 */
export function generateScalarField(
  config: ScalarFieldConfig = {},
): ScalarField {
  const width = config.width ?? 32;
  const height = config.height ?? 32;
  const depth = config.depth ?? 16;

  const size = width * height * depth;
  const data = new Float32Array(size);

  // Centre of the Gaussian (normalised 0–1 coords, slightly off-centre)
  const cx = 0.48;
  const cy = 0.52;
  const cz = 0.40; // slightly above mid-depth

  // Spread (sigma) per axis — wider in horizontal, tighter in depth
  const sx = 0.22;
  const sy = 0.22;
  const sz = 0.18;

  const bgTemp = 26.0; // background temperature
  const peakAnomaly = 4.0; // max anomaly added to background → peaks at 30 °C

  let min = Infinity;
  let max = -Infinity;

  for (let z = 0; z < depth; z++) {
    const nz = z / (depth - 1); // normalised 0–1
    for (let y = 0; y < height; y++) {
      const ny = y / (height - 1);
      for (let x = 0; x < width; x++) {
        const nx = x / (width - 1);

        // 3D Gaussian
        const dx = (nx - cx) / sx;
        const dy = (ny - cy) / sy;
        const dz = (nz - cz) / sz;
        const gaussian = Math.exp(-0.5 * (dx * dx + dy * dy + dz * dz));

        // Add a subtle secondary smaller blob for visual interest
        const dx2 = (nx - 0.72) / 0.12;
        const dy2 = (ny - 0.35) / 0.12;
        const dz2 = (nz - 0.60) / 0.14;
        const gaussian2 =
          0.4 * Math.exp(-0.5 * (dx2 * dx2 + dy2 * dy2 + dz2 * dz2));

        const value = bgTemp + peakAnomaly * Math.max(gaussian, gaussian2);

        data[z * width * height + y * width + x] = value;

        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
  }

  return { data, width, height, depth, min, max };
}
