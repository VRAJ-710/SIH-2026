/**
 * VolumeIsosurface.ts
 *
 * Implements isosurface extraction on the 3D scalar field using Three.js
 * MarchingCubes from three/examples/jsm/objects/MarchingCubes.js.
 *
 * Extracts a solid polygonal surface at a configurable temperature threshold
 * with standard/phong lighting and smooth normals.
 */

import {
  Color,
  DoubleSide,
  MeshStandardMaterial,
} from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import type { ScalarField } from './generateScalarField';

export interface VolumeIsosurfaceHandle {
  /** The MarchingCubes mesh to add to the scene. */
  mesh: MarchingCubes;
  /** Update the isosurface extraction threshold (temperature in °C). */
  setThreshold: (temperature: number) => void;
  /** Update data source and refresh surface. */
  updateData: (field: ScalarField) => void;
  /** Dispose resources. */
  dispose: () => void;
}

/**
 * Trilinearly sample the scalar field with normalized coords [0, 1].
 */
function sampleField(field: ScalarField, u: number, v: number, w: number): number {
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

  const fx = gx - x0;
  const fy = gy - y0;
  const fz = gz - z0;

  const sliceSize = width * height;

  const c000 = data[z0 * sliceSize + y0 * width + x0];
  const c100 = data[z0 * sliceSize + y0 * width + x1];
  const c010 = data[z0 * sliceSize + y1 * width + x0];
  const c110 = data[z0 * sliceSize + y1 * width + x1];

  const c001 = data[z1 * sliceSize + y0 * width + x0];
  const c101 = data[z1 * sliceSize + y0 * width + x1];
  const c011 = data[z1 * sliceSize + y1 * width + x0];
  const c111 = data[z1 * sliceSize + y1 * width + x1];

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
function populateMarchingCubes(mc: MarchingCubes, field: ScalarField, resolution: number): void {
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
 * Create an isosurface mesh instance from the given scalar field.
 *
 * @param field The 3D scalar field.
 * @param initialThreshold Initial temperature threshold (e.g. 28.0 °C).
 * @param mcResolution Grid resolution for MarchingCubes (default 32).
 */
export function createVolumeIsosurface(
  field: ScalarField,
  initialThreshold = 28.0,
  mcResolution = 32,
): VolumeIsosurfaceHandle {
  const material = new MeshStandardMaterial({
    color: new Color(0xff5722), // warm amber / coral for ocean anomaly
    roughness: 0.35,
    metalness: 0.15,
    side: DoubleSide,
    flatShading: false,
  });

  // maxPolyCount set comfortably high so dense triangulations won't overflow
  const maxPolyCount = 80000;
  const mc = new MarchingCubes(mcResolution, material, false, false, maxPolyCount);

  // MarchingCubes coordinates range from -1 to 1.
  // Scale down to 0.5 to fit in the same 1x1x1 unit box as the raymarch volume.
  mc.scale.set(0.5, 0.5, 0.5);
  mc.position.set(0, 0, 0);

  let currentField = field;
  populateMarchingCubes(mc, currentField, mcResolution);

  mc.isolation = initialThreshold;
  mc.update();

  return {
    mesh: mc,
    setThreshold(temperature: number) {
      mc.isolation = temperature;
      mc.update();
    },
    updateData(newField: ScalarField) {
      currentField = newField;
      populateMarchingCubes(mc, currentField, mcResolution);
      mc.update();
    },
    dispose() {
      mc.geometry.dispose();
      material.dispose();
    },
  };
}
