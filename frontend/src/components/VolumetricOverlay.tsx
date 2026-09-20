/**
 * VolumetricOverlay.tsx
 *
 * Stage 6b: Full-viewport modal overlay that renders a Three.js volumetric
 * scene using REAL data from GET /api/volume.
 *
 * Props:
 *  - currentTime: ISO8601 string from the main app's time scrubber
 *  - onClose: callback to dismiss the overlay
 *
 * Features:
 *  - Debounced refetch (300ms) when currentTime changes
 *  - Land sentinel masking (transparent in raymarch, excluded in isosurface)
 *  - Dynamic color/threshold range from API response value_range
 *  - Mode toggle: Raymarch Volume / MarchingCubes Isosurface
 *  - Threshold slider with real units and dynamic bounds
 *  - Region toggle: Cold Wake (84-90E, 14-18N) vs Coastline Land Mask (86-91E, 20-23N)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { fetchVolumeData, type VolumeData } from '../lib/fetchVolumeData';
import {
  createVolumeRaymarchReal,
  type VolumeRaymarchRealHandle,
} from '../lib/VolumeRaymarchReal';
import {
  createVolumeIsosurfaceReal,
  type VolumeIsosurfaceRealHandle,
} from '../lib/VolumeIsosurfaceReal';

type RenderMode = 'raymarch' | 'isosurface';
type RegionPreset = 'coldwake' | 'coastline';

const REGION_BBOXES: Record<RegionPreset, { bbox: string; label: string }> = {
  coldwake: { bbox: '84,14,90,18', label: '84–90°E, 14–18°N (Cold Wake)' },
  coastline: { bbox: '86,20,91,23', label: '86–91°E, 20–23°N (Coastline Mask)' },
};

// Stage 7a Task 5: Gate land-mask test preset behind dev flag so it is not user-facing
const SHOW_DEV_REGIONS = typeof window !== 'undefined' && window.location.search.includes('dev_mask=true');

interface VolumetricOverlayProps {
  /** ISO8601 timestamp from the main app's time scrubber. */
  currentTime: string;
  /** Callback to close the overlay. */
  onClose: () => void;
}

export default function VolumetricOverlay({ currentTime, onClose }: VolumetricOverlayProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  // UI state
  const [mode, setMode] = useState<RenderMode>('raymarch');
  const [region, setRegion] = useState<RegionPreset>('coldwake');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [valueRange, setValueRange] = useState<{ min: number; max: number }>({ min: 10, max: 32 });
  const [thresholdVal, setThresholdVal] = useState<number>(20);
  const [depthRange, setDepthRange] = useState<[number, number]>([0, 200]);
  const [responseTime, setResponseTime] = useState<string>('');
  const [sentinelCount, setSentinelCount] = useState<number>(0);
  const [fps, setFps] = useState(60);

  // Refs for Three.js objects (mutable, not React state)
  const sceneRef = useRef<{
    scene: Scene;
    camera: PerspectiveCamera;
    renderer: WebGLRenderer;
    composer: EffectComposer;
    bloomPass: UnrealBloomPass;
    controls: OrbitControls;
    raymarch: VolumeRaymarchRealHandle | null;
    isosurface: VolumeIsosurfaceRealHandle | null;
    animFrameId: number;
  } | null>(null);

  // Track current mode/threshold in refs for the animation loop
  const modeRef = useRef<RenderMode>('raymarch');
  const thresholdRef = useRef<number>(20);
  const valueRangeRef = useRef<{ min: number; max: number }>({ min: 10, max: 32 });
  const regionRef = useRef<RegionPreset>('coldwake');

  // Sync refs with state
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { thresholdRef.current = thresholdVal; }, [thresholdVal]);
  useEffect(() => { valueRangeRef.current = valueRange; }, [valueRange]);
  useEffect(() => { regionRef.current = region; }, [region]);

  // ---- Three.js scene setup (once on mount) ----
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new Scene();
    scene.background = new Color(0x0a0f1d);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const camera = new PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(1.6, 1.3, 1.8);

    const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Post-processing Bloom pipeline (Stage 7b Task 6)
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Warm-core thermal bloom pass: threshold 0.65 selects high-thermal core highlights,
    // strength 0.40 provides a rich organic glow while preserving internal volume details
    const bloomPass = new UnrealBloomPass(
      new Vector2(width, height),
      0.40, // strength
      0.35, // radius
      0.65  // threshold
    );
    composer.addPass(bloomPass);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);

    // Lighting
    scene.add(new AmbientLight(0xffffff, 1.2));
    const keyLight = new DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(3, 4, 3);
    scene.add(keyLight);
    const fillLight = new DirectionalLight(0x4fc3f7, 1.0);
    fillLight.position.set(-3, -2, -2);
    scene.add(fillLight);

    // Bounding box wireframe
    const boxGeo = new BoxGeometry(1, 1, 1);
    const edges = new EdgesGeometry(boxGeo);
    const boxWire = new LineSegments(
      edges,
      new LineBasicMaterial({ color: 0x38bdf8, opacity: 0.35, transparent: true }),
    );
    scene.add(boxWire);

    // FPS tracking
    let frameCount = 0;
    let lastFpsUpdate = performance.now();

    // Animation loop using composer.render() for bloom postprocessing
    let animFrameId = 0;
    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      const now = performance.now();
      frameCount++;
      if (now - lastFpsUpdate >= 500) {
        setFps(Math.round((frameCount * 1000) / (now - lastFpsUpdate)));
        frameCount = 0;
        lastFpsUpdate = now;
      }
      controls.update();
      composer.render();
    };
    animate();

    // Resize handler
    const handleResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
      bloomPass.resolution.set(w, h);
    };
    window.addEventListener('resize', handleResize);

    sceneRef.current = {
      scene,
      camera,
      renderer,
      composer,
      bloomPass,
      controls,
      raymarch: null,
      isosurface: null,
      animFrameId,
    };

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animFrameId);
      sceneRef.current?.raymarch?.dispose();
      sceneRef.current?.isosurface?.dispose();
      boxGeo.dispose();
      edges.dispose();
      bloomPass.dispose();
      composer.dispose();
      renderer.dispose();
      if (container && renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, []);

  // ---- Data fetching with debounce ----
  const loadData = useCallback(async (time: string, currentRegion: RegionPreset) => {
    const s = sceneRef.current;
    if (!s) return;

    setLoading(true);
    setError(null);

    try {
      const bboxStr = REGION_BBOXES[currentRegion].bbox;
      const volumeData: VolumeData = await fetchVolumeData(time, { bbox: bboxStr });

      // Count sentinels to display land/water metrics
      let sc = 0;
      for (let i = 0; i < volumeData.data.length; i++) {
        if (volumeData.data[i] <= -9998.5) sc++;
      }
      setSentinelCount(sc);

      // Update state from response
      setValueRange({ min: volumeData.min, max: volumeData.max });
      valueRangeRef.current = { min: volumeData.min, max: volumeData.max };
      setDepthRange(volumeData.depthRange);
      setResponseTime(volumeData.time);

      // Set initial threshold to midpoint of real range
      const midThreshold = Number(((volumeData.min + volumeData.max) / 2).toFixed(2));
      setThresholdVal(midThreshold);
      thresholdRef.current = midThreshold;

      const field = {
        data: volumeData.data,
        width: volumeData.width,
        height: volumeData.height,
        depth: volumeData.depth,
        min: volumeData.min,
        max: volumeData.max,
      };

      // Update or create raymarch
      if (s.raymarch) {
        s.raymarch.updateData(field, volumeData.landSentinel);
      } else {
        s.raymarch = createVolumeRaymarchReal(field, 128, volumeData.landSentinel);
        s.scene.add(s.raymarch.mesh);
      }

      // Update or create isosurface
      if (s.isosurface) {
        s.isosurface.updateData(field, volumeData.landSentinel);
      } else {
        s.isosurface = createVolumeIsosurfaceReal(field, midThreshold, 32);
        s.scene.add(s.isosurface.mesh);
      }

      // Apply current mode visibility
      const currentMode = modeRef.current;
      s.raymarch.mesh.visible = currentMode === 'raymarch';
      s.isosurface.mesh.visible = currentMode === 'isosurface';

      // Apply threshold
      const norm = (midThreshold - volumeData.min) / (volumeData.max - volumeData.min);
      s.raymarch.setOpacityMidpoint(norm);
      s.isosurface.setThreshold(midThreshold);

    } catch (err) {
      console.error('Failed to fetch volume data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch volume data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced time/region change handler (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentTime) {
        loadData(currentTime, region);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [currentTime, region, loadData]);

  // ---- Mode switching ----
  const handleModeChange = useCallback((newMode: RenderMode) => {
    setMode(newMode);
    modeRef.current = newMode;
    const s = sceneRef.current;
    if (!s) return;

    if (newMode === 'raymarch') {
      if (s.raymarch) s.raymarch.mesh.visible = true;
      if (s.isosurface) s.isosurface.mesh.visible = false;
      const range = valueRangeRef.current;
      const norm = (thresholdRef.current - range.min) / (range.max - range.min);
      s.raymarch?.setOpacityMidpoint(norm);
    } else {
      if (s.raymarch) s.raymarch.mesh.visible = false;
      if (s.isosurface) s.isosurface.mesh.visible = true;
      s.isosurface?.setThreshold(thresholdRef.current);
    }
  }, []);

  // ---- Threshold/midpoint slider change ----
  const handleThresholdChange = useCallback((val: number) => {
    setThresholdVal(val);
    thresholdRef.current = val;
    const s = sceneRef.current;
    if (!s) return;

    const range = valueRangeRef.current;
    const norm = (val - range.min) / (range.max - range.min);
    s.raymarch?.setOpacityMidpoint(norm);
    s.isosurface?.setThreshold(val);
  }, []);

  // ---- Close with Escape key ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      id="volumetric-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 20000,
        background: '#121214',
      }}
    >
      {/* Three.js canvas */}
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* Close button (Task 3: Subdued ghost button matching panel header) */}
      <button
        id="close-3d-btn"
        type="button"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 20010,
          background: 'rgba(30, 30, 30, 0.88)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 6,
          color: '#9ca3af',
          fontSize: 16,
          fontWeight: 600,
          width: 36,
          height: 36,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          transition: 'all 0.15s ease',
        }}
        title="Close 3D view (Esc)"
      >
        ✕
      </button>

      {/* Top-Right Header info badge (Task 3: Frosted glassmorphic neutral dark card) */}
      <div
        id="volume-info-panel"
        className="no-scrollbar"
        style={{
          position: 'absolute',
          top: 16,
          right: 64,
          zIndex: 20010,
          background: 'rgba(30, 30, 30, 0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 8,
          padding: '14px 16px',
          color: '#f3f4f6',
          width: '340px',
          maxWidth: 'calc(100vw - 88px)',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: loading ? '#facc15' : error ? '#ef4444' : '#38bdf8',
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' as const, color: '#f3f4f6' }}>
              3D Volumetric View
            </span>
          </div>
          {/* FPS Counter: small status pill with subtle green background tint (Task 3) */}
          <span
            id="volumetric-fps"
            style={{
              fontSize: '10.5px',
              color: fps >= 45 ? '#4ade80' : fps >= 25 ? '#facc15' : '#f87171',
              fontWeight: 600,
              fontFamily: 'monospace',
              padding: '2px 8px',
              borderRadius: '9999px',
              background: 'rgba(34, 197, 94, 0.12)',
              border: '1px solid rgba(74, 222, 128, 0.25)',
            }}
          >
            {fps} FPS
          </span>
        </div>

        {/* Region preset selector (Gated behind SHOW_DEV_REGIONS for Task 5) */}
        {SHOW_DEV_REGIONS && (
          <div style={{ display: 'flex', gap: 6, margin: '8px 0 6px' }}>
            <button
              id="region-select-coldwake"
              type="button"
              onClick={() => setRegion('coldwake')}
              style={{
                flex: 1,
                padding: '4px 6px',
                fontSize: '11px',
                fontWeight: region === 'coldwake' ? 600 : 400,
                borderRadius: 5,
                border: region === 'coldwake' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.12)',
                background: region === 'coldwake' ? '#0284c7' : 'transparent',
                color: region === 'coldwake' ? '#fff' : '#9ca3af',
                cursor: 'pointer',
              }}
            >
              Cold-Wake Box
            </button>
            <button
              id="region-select-coastline"
              type="button"
              onClick={() => setRegion('coastline')}
              style={{
                flex: 1,
                padding: '4px 6px',
                fontSize: '11px',
                fontWeight: region === 'coastline' ? 600 : 400,
                borderRadius: 5,
                border: region === 'coastline' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.12)',
                background: region === 'coastline' ? '#0284c7' : 'transparent',
                color: region === 'coastline' ? '#fff' : '#9ca3af',
                cursor: 'pointer',
              }}
            >
              Coastline (Land Mask Test)
            </button>
          </div>
        )}

        {/* Task 3: Clean 2-column key-value list (muted uppercase labels, bright values) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '5px 12px',
            alignItems: 'baseline',
            marginTop: 6,
            fontSize: '11px',
            lineHeight: 1.4,
          }}
        >
          <span style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Box</span>
          <span id="overlay-region-label" style={{ color: '#f3f4f6', fontFamily: 'monospace' }}>{REGION_BBOXES[region].label}</span>

          <span style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Depth</span>
          <span style={{ color: '#f3f4f6', fontFamily: 'monospace' }}>{depthRange[0].toFixed(1)}–{depthRange[1].toFixed(1)} m</span>

          <span style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Grid</span>
          <span style={{ color: '#f3f4f6', fontFamily: 'monospace' }}>32 × 32 × 16</span>

          <span style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Date</span>
          <span id="overlay-date-label" style={{ color: '#f3f4f6', fontWeight: 500, fontFamily: 'monospace' }}>{responseTime ? responseTime.substring(0, 10) : '...'}</span>

          <span style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Range</span>
          <span style={{ color: '#f3f4f6', fontFamily: 'monospace' }}>{valueRange.min.toFixed(1)}–{valueRange.max.toFixed(1)} °C</span>

          <span style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Land Mask</span>
          <span id="overlay-mask-status" style={{ color: sentinelCount > 0 ? '#cbd5e1' : '#9ca3af' }}>
            {sentinelCount > 0 ? `${sentinelCount} masked cells transparent` : '100% Ocean (no land)'}
          </span>
        </div>

        {loading && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#38bdf8' }}>
            ⏳ Fetching 3D volume from /api/volume...
          </div>
        )}
        {error && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#f87171' }}>
            ❌ {error}
          </div>
        )}
      </div>

      {/* Bottom control dock (Task 3: Repositioned & frosted neutral dark glassmorphism) */}
      <div
        id="volumetric-dock"
        style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20010,
          background: 'rgba(30, 30, 30, 0.94)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 8,
          padding: '12px 20px',
          color: '#f3f4f6',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6)',
          maxWidth: 'calc(100vw - 48px)',
        }}
      >
        {/* Mode toggle: ghost style inactive, solid accent active (Task 3) */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            background: '#242426',
            padding: 3,
            borderRadius: 6,
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <button
            id="render-mode-raymarch"
            type="button"
            onClick={() => handleModeChange('raymarch')}
            style={{
              padding: '6px 14px',
              fontSize: 11.5,
              fontWeight: mode === 'raymarch' ? 600 : 400,
              borderRadius: 5,
              border: mode === 'raymarch' ? '1px solid #38bdf8' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              background: mode === 'raymarch' ? '#0284c7' : 'transparent',
              color: mode === 'raymarch' ? '#fff' : '#9ca3af',
              boxShadow: mode === 'raymarch' ? '0 2px 8px rgba(2, 132, 199, 0.35)' : 'none',
            }}
          >
            Raymarch Volume
          </button>
          <button
            id="render-mode-isosurface"
            type="button"
            onClick={() => handleModeChange('isosurface')}
            style={{
              padding: '6px 14px',
              fontSize: 11.5,
              fontWeight: mode === 'isosurface' ? 600 : 400,
              borderRadius: 5,
              border: mode === 'isosurface' ? '1px solid #38bdf8' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              background: mode === 'isosurface' ? '#0284c7' : 'transparent',
              color: mode === 'isosurface' ? '#fff' : '#9ca3af',
              boxShadow: mode === 'isosurface' ? '0 2px 8px rgba(2, 132, 199, 0.35)' : 'none',
            }}
          >
            Marching Cubes
          </button>
        </div>

        {/* Threshold slider with dynamic range */}
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4, minWidth: 260 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
            <span style={{ color: '#9ca3af', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
              {mode === 'raymarch' ? 'Opacity Midpoint' : 'Isosurface Threshold'}
            </span>
            <span id="current-threshold-label" style={{ fontFamily: 'monospace', color: '#e5e7eb', fontWeight: 600 }}>
              {thresholdVal.toFixed(2)} °C
            </span>
          </div>
          <input
            id="threshold-slider"
            type="range"
            min={valueRange.min}
            max={valueRange.max}
            step={0.05}
            value={thresholdVal}
            onChange={(e) => handleThresholdChange(parseFloat(e.target.value))}
            style={{
              width: '100%',
              cursor: 'pointer',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>
            <span id="slider-min-label">{valueRange.min.toFixed(2)} °C</span>
            <span id="slider-max-label">{valueRange.max.toFixed(2)} °C</span>
          </div>
        </div>
      </div>
    </div>
  );
}
