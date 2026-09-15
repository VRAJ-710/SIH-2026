/**
 * VolumeRaymarch.ts
 *
 * Creates a raymarched volume renderer for a 3D scalar field using a
 * custom ShaderMaterial and Data3DTexture.
 *
 * Rendering technique: a unit BoxGeometry rendered with `side: BackSide`.
 * The fragment shader raymarches front-to-back through the volume,
 * sampling the Data3DTexture and applying a colour + opacity transfer
 * function that maps temperature values to a cool→warm colour ramp.
 */

import {
  BackSide,
  BoxGeometry,
  ClampToEdgeWrapping,
  Data3DTexture,
  FloatType,
  LinearFilter,
  Mesh,
  RedFormat,
  ShaderMaterial,
  type Texture,
} from 'three';
import type { ScalarField } from './generateScalarField';

/* ------------------------------------------------------------------ */
/*  GLSL shaders                                                      */
/* ------------------------------------------------------------------ */

const vertexShader = /* glsl */ `
  // Interpolated position in model (object) space — 0..1 across the box
  varying vec3 vOrigin;
  varying vec3 vDirection;

  void main() {
    // Transform camera position into object space
    vOrigin = vec3(inverse(modelMatrix) * vec4(cameraPosition, 1.0));
    // Direction from camera to vertex, in object space
    vDirection = position - vOrigin;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  precision highp sampler3D;

  uniform sampler3D u_volume;
  uniform float u_minVal;
  uniform float u_maxVal;
  uniform float u_opacityMidpoint; // 0–1 normalised (maps to temperature range)
  uniform float u_stepCount;

  varying vec3 vOrigin;
  varying vec3 vDirection;

  // ---- Ray–AABB intersection for a unit box [0,1]^3 ----
  vec2 hitBox(vec3 orig, vec3 dir) {
    vec3 invDir = 1.0 / dir;
    vec3 tMin = (vec3(0.0) - orig) * invDir;
    vec3 tMax = (vec3(1.0) - orig) * invDir;
    vec3 t1 = min(tMin, tMax);
    vec3 t2 = max(tMin, tMax);
    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar  = min(min(t2.x, t2.y), t2.z);
    return vec2(tNear, tFar);
  }

  // ---- Transfer function: normalised value [0,1] → RGBA ----
  // Uses a cool-to-warm colour ramp: blue/cyan → green → orange → red
  vec4 transferFunction(float t, float midpoint) {
    // Colour ramp (5-stop)
    vec3 c;
    if (t < 0.25) {
      c = mix(vec3(0.05, 0.15, 0.60), vec3(0.10, 0.55, 0.75), t / 0.25);
    } else if (t < 0.50) {
      c = mix(vec3(0.10, 0.55, 0.75), vec3(0.30, 0.75, 0.40), (t - 0.25) / 0.25);
    } else if (t < 0.75) {
      c = mix(vec3(0.30, 0.75, 0.40), vec3(0.95, 0.65, 0.15), (t - 0.50) / 0.25);
    } else {
      c = mix(vec3(0.95, 0.65, 0.15), vec3(0.85, 0.10, 0.10), (t - 0.75) / 0.25);
    }

    // Opacity: sigmoid-like ramp centred around the midpoint.
    // Values below midpoint are nearly transparent; above become opaque.
    float opacity = smoothstep(midpoint - 0.25, midpoint + 0.25, t) * 0.6;
    return vec4(c, opacity);
  }

  void main() {
    // Shift box coordinates so the geometry goes from 0..1 instead of -0.5..0.5
    vec3 origin = vOrigin + 0.5;
    vec3 dir = normalize(vDirection);

    vec2 bounds = hitBox(origin, dir);
    if (bounds.x > bounds.y) discard;
    bounds.x = max(bounds.x, 0.0);

    float stepSize = 1.0 / u_stepCount;
    vec4 accum = vec4(0.0);

    // Front-to-back compositing
    for (float t = bounds.x; t < bounds.y; t += stepSize) {
      vec3 samplePos = origin + dir * t;

      // Sample the 3D texture (coordinates must be in 0–1 range)
      float rawVal = texture(u_volume, samplePos).r;

      // Normalise to 0–1 based on the data range
      float normVal = clamp((rawVal - u_minVal) / (u_maxVal - u_minVal), 0.0, 1.0);

      vec4 sampleColor = transferFunction(normVal, u_opacityMidpoint);
      sampleColor.a *= stepSize * 8.0; // scale opacity by step size
      sampleColor.rgb *= sampleColor.a; // pre-multiply alpha

      accum += sampleColor * (1.0 - accum.a);

      // Early exit when nearly opaque
      if (accum.a > 0.95) break;
    }

    gl_FragColor = accum;
  }
`;

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

export interface VolumeRaymarchHandle {
  /** The Three.js mesh to add to the scene. */
  mesh: Mesh;
  /** Update the opacity midpoint (0–1 normalised). */
  setOpacityMidpoint: (value: number) => void;
  /** Replace the underlying data (e.g. for resolution switching). */
  updateData: (field: ScalarField) => void;
  /** Dispose GPU resources. */
  dispose: () => void;
}

/**
 * Create a raymarched volume mesh from a scalar field.
 *
 * @param field  The scalar field to render.
 * @param steps  Number of raymarch steps (default 128).
 */
export function createVolumeRaymarch(
  field: ScalarField,
  steps = 128,
): VolumeRaymarchHandle {
  let texture: Texture = makeTexture(field);

  const material = new ShaderMaterial({
    uniforms: {
      u_volume: { value: texture },
      u_minVal: { value: field.min },
      u_maxVal: { value: field.max },
      u_opacityMidpoint: { value: 0.5 },
      u_stepCount: { value: steps },
    },
    vertexShader,
    fragmentShader,
    side: BackSide,
    transparent: true,
    depthWrite: false,
  });

  const geometry = new BoxGeometry(1, 1, 1);
  const mesh = new Mesh(geometry, material);

  return {
    mesh,
    setOpacityMidpoint(value: number) {
      material.uniforms.u_opacityMidpoint.value = value;
    },
    updateData(newField: ScalarField) {
      texture.dispose();
      texture = makeTexture(newField);
      material.uniforms.u_volume.value = texture;
      material.uniforms.u_minVal.value = newField.min;
      material.uniforms.u_maxVal.value = newField.max;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeTexture(field: ScalarField): Data3DTexture {
  const tex = new Data3DTexture(field.data, field.width, field.height, field.depth);
  tex.format = RedFormat;
  tex.type = FloatType;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.wrapR = ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}
