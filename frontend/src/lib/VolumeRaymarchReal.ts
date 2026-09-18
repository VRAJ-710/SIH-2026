/**
 * VolumeRaymarchReal.ts
 *
 * Raymarched volume renderer adapted for REAL data from GET /api/volume.
 * Key differences from the spike's VolumeRaymarch.ts:
 *
 *  1. Land sentinel handling: voxels with value <= -9998.5 are fully transparent
 *     (never colored as cold-blue). Uses tolerance-based check to avoid
 *     floating-point precision issues after JSON parsing.
 *
 *  2. Dynamic min/max: u_minVal and u_maxVal are set from the API response's
 *     value_range, not hardcoded to 26–30°C.
 *
 *  3. The ScalarField interface is reused but data comes from fetchVolumeData().
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

/** Matches the ScalarField shape from the spike, reused here. */
export interface RealScalarField {
  data: Float32Array;
  width: number;
  height: number;
  depth: number;
  min: number;
  max: number;
}

/* ------------------------------------------------------------------ */
/*  GLSL shaders                                                      */
/* ------------------------------------------------------------------ */

const vertexShader = /* glsl */ `
  varying vec3 vOrigin;
  varying vec3 vDirection;

  void main() {
    vOrigin = vec3(inverse(modelMatrix) * vec4(cameraPosition, 1.0));
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
  uniform float u_opacityMidpoint; // 0–1 normalised
  uniform float u_stepCount;
  uniform float u_landSentinel;    // -9999.0

  varying vec3 vOrigin;
  varying vec3 vDirection;

  // Ray–AABB intersection for a unit box [0,1]^3
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

  // Transfer function: normalised value [0,1] → RGBA
  // Cool-to-warm colour ramp: blue/cyan → green → orange → red
  vec4 transferFunction(float t, float midpoint) {
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

    // Opacity: sigmoid-like ramp centred around the midpoint
    float opacity = smoothstep(midpoint - 0.25, midpoint + 0.25, t) * 0.6;
    return vec4(c, opacity);
  }

  void main() {
    vec3 origin = vOrigin + 0.5;
    vec3 dir = normalize(vDirection);

    vec2 bounds = hitBox(origin, dir);
    if (bounds.x > bounds.y) discard;
    bounds.x = max(bounds.x, 0.0);

    float stepSize = 1.0 / u_stepCount;
    vec4 accum = vec4(0.0);

    for (float t = bounds.x; t < bounds.y; t += stepSize) {
      vec3 samplePos = origin + dir * t;

      float rawVal = texture(u_volume, samplePos).r;

      // LAND MASKING: skip sentinel cells entirely (fully transparent)
      // Uses tolerance to avoid float precision issues after JSON parse
      if (rawVal <= u_landSentinel + 0.5) continue;

      // Normalise to 0–1 based on the dynamic data range
      float normVal = clamp((rawVal - u_minVal) / (u_maxVal - u_minVal), 0.0, 1.0);

      vec4 sampleColor = transferFunction(normVal, u_opacityMidpoint);
      sampleColor.a *= stepSize * 8.0;
      sampleColor.rgb *= sampleColor.a;

      accum += sampleColor * (1.0 - accum.a);

      if (accum.a > 0.95) break;
    }

    gl_FragColor = accum;
  }
`;

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

export interface VolumeRaymarchRealHandle {
  mesh: Mesh;
  setOpacityMidpoint: (value: number) => void;
  updateData: (field: RealScalarField, landSentinel?: number) => void;
  dispose: () => void;
}

export function createVolumeRaymarchReal(
  field: RealScalarField,
  steps = 128,
  landSentinel = -9999.0,
): VolumeRaymarchRealHandle {
  let texture: Texture = makeTexture(field);

  const material = new ShaderMaterial({
    uniforms: {
      u_volume: { value: texture },
      u_minVal: { value: field.min },
      u_maxVal: { value: field.max },
      u_opacityMidpoint: { value: 0.5 },
      u_stepCount: { value: steps },
      u_landSentinel: { value: landSentinel },
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
    updateData(newField: RealScalarField, newSentinel?: number) {
      texture.dispose();
      texture = makeTexture(newField);
      material.uniforms.u_volume.value = texture;
      material.uniforms.u_minVal.value = newField.min;
      material.uniforms.u_maxVal.value = newField.max;
      if (newSentinel !== undefined) {
        material.uniforms.u_landSentinel.value = newSentinel;
      }
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

function makeTexture(field: RealScalarField): Data3DTexture {
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
