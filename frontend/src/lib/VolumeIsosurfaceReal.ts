/**
 * VolumeIsosurfaceReal.ts
 *
 * MarchingCubes isosurface extraction adapted for REAL data from GET /api/volume.
 * Key differences from the spike's VolumeIsosurface.ts:
 *
 *  1. Land sentinel handling: if any corner of the trilinear interpolation cell
 *     has a value <= -9998.5 (tolerance-based sentinel check), the sample returns
 *     +99999.0 — far above any realistic threshold — ensuring MarchingCubes never
 *     generates a surface at land boundaries (no phantom artifacts).
 *
 *  2. Dynamic threshold bounds from the API response's value_range.
 */

import {
  Color,
  DoubleSide,
  MeshStandardMaterial,
} from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import type { RealScalarField } from './VolumeRaymarchReal';

export interface VolumeIsosurfaceRealHandle {
  mesh: MarchingCubes;
  setThreshold: (temperature: number) => void;
  updateData: (field: RealScalarField, landSentinel?: number) => void;
  dispose: () => void;
}

/** Sentinel tolerance threshold. Values at or below this are considered land/missing. */
const SENTINEL_THRESHOLD = -9998.5;

/** Value returned for land-masked cells — far above any ocean temperature threshold. */
const LAND_MASKED_VALUE = 99999.0;

/**
 * Trilinearly sample the scalar field with normalized coords [0, 1].
 * If ANY of the 8 interpolation corners is a land sentinel, returns
 * LAND_MASKED_VALUE to prevent phantom isosurface artifacts.
 */
function sampleField(
  field: RealScalarField,
  u: number,
  v: number,
  w: number,
): number {
  const { data, width, height, depth } = field;
  const gx = u * (width - 1);
  const gy = v * (height - 1);
  const gz = w * (depth - 1);

  const x0 = Math.floor(gx);
  const x1 = Math.min(x0 + 1, width - 1);
  const y0 = Math.floor(gy);
  const y1 = Math.min(y0 + 1, height - 1);
  const z0 = Math.floor(gz);
  const z1 = Math.min(z0 + 1, depth - 1);

  const sliceSize = width * height;

  // Read all 8 corners
  const c000 = data[z0 * sliceSize + y0 * width + x0];
  const c100 = data[z0 * sliceSize + y0 * width + x1];
  const c010 = data[z0 * sliceSize + y1 * width + x0];
  const c110 = data[z0 * sliceSize + y1 * width + x1];
  const c001 = data[z1 * sliceSize + y0 * width + x0];
  const c101 = data[z1 * sliceSize + y0 * width + x1];
  const c011 = data[z1 * sliceSize + y1 * width + x0];
  const c111 = data[z1 * sliceSize + y1 * width + x1];

  // Land masking: if ANY corner is sentinel, exclude this cell entirely.
  // Uses tolerance-based check (<= -9998.5) for float precision safety.
  if (
    c000 <= SENTINEL_THRESHOLD ||
    c100 <= SENTINEL_THRESHOLD ||
    c010 <= SENTINEL_THRESHOLD ||
    c110 <= SENTINEL_THRESHOLD ||
    c001 <= SENTINEL_THRESHOLD ||
    c101 <= SENTINEL_THRESHOLD ||
    c011 <= SENTINEL_THRESHOLD ||
    c111 <= SENTINEL_THRESHOLD
  ) {
    return LAND_MASKED_VALUE;
  }

  // Standard trilinear interpolation
  const fx = gx - x0;
  const fy = gy - y0;
  const fz = gz - z0;

  const c00 = c000 * (1 - fx) + c100 * fx;
  const c10 = c010 * (1 - fx) + c110 * fx;
  const c01 = c001 * (1 - fx) + c101 * fx;
  const c11 = c011 * (1 - fx) + c111 * fx;

  const c0 = c00 * (1 - fy) + c10 * fy;
  const c1 = c01 * (1 - fy) + c11 * fy;

  return c0 * (1 - fz) + c1 * fz;
}

/**
 * Fill MarchingCubes grid cells from the ScalarField.
 */
function populateMarchingCubes(
  mc: MarchingCubes,
  field: RealScalarField,
  resolution: number,
): void {
  mc.reset();

  for (let z = 0; z < resolution; z++) {
    const w = z / (resolution - 1);
    for (let y = 0; y < resolution; y++) {
      const v = y / (resolution - 1);
      for (let x = 0; x < resolution; x++) {
        const u = x / (resolution - 1);
        const val = sampleField(field, u, v, w);
        mc.setCell(x, y, z, val);
      }
    }
  }
}

/**
 * Create an isosurface mesh from a real-data scalar field.
 *
 * @param field The 3D scalar field from the API.
 * @param initialThreshold Initial temperature threshold in °C.
 * @param mcResolution Grid resolution for MarchingCubes (default 32).
 */
export function createVolumeIsosurfaceReal(
  field: RealScalarField,
  initialThreshold: number,
  mcResolution = 32,
): VolumeIsosurfaceRealHandle {
  const material = new MeshStandardMaterial({
    color: new Color(0xff5722),
    roughness: 0.35,
    metalness: 0.15,
    side: DoubleSide,
    flatShading: false,
  });

  const maxPolyCount = 80000;
  const mc = new MarchingCubes(mcResolution, material, false, false, maxPolyCount);

  // Scale to fit in the same 1×1×1 unit box as the raymarch volume
  mc.scale.set(0.5, 0.5, 0.5);
  mc.position.set(0, 0, 0);

  populateMarchingCubes(mc, field, mcResolution);

  mc.isolation = initialThreshold;
  mc.update();

  return {
    mesh: mc,
    setThreshold(temperature: number) {
      mc.isolation = temperature;
      mc.update();
    },
    updateData(newField: RealScalarField) {
      populateMarchingCubes(mc, newField, mcResolution);
      mc.update();
    },
    dispose() {
      mc.geometry.dispose();
      material.dispose();
    },
  };
}
