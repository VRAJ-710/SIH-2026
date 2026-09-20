/**
 * VolumetricSpikePage.tsx
 *
 * Standalone Three.js host page for the volumetric rendering spike (Stage 1b).
 * Provides:
 *  - Interactive OrbitControls camera navigation
 *  - Synthetic 3D ocean temperature scalar field
 *  - Mode toggle: Raymarch Volume vs MarchingCubes Isosurface
 *  - Double-duty slider: Opacity Midpoint (raymarch) / Threshold (isosurface)
 *  - Resolution selector: 32x32x16 vs 64x64x32 (double resolution stress test)
 *  - Real-time FPS / frame time monitor
 *  - lil-gui control panel and floating glass HUD
 */

import { useEffect, useRef, useState } from 'react';
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
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import GUI, { Controller } from 'lil-gui';
import { generateScalarField, type ScalarField } from './generateScalarField';
import { createVolumeRaymarch, type VolumeRaymarchHandle } from './VolumeRaymarch';
import { createVolumeIsosurface, type VolumeIsosurfaceHandle } from './VolumeIsosurface';

type RenderMode = 'raymarch' | 'isosurface';
type GridResolution = '32x32x16' | '64x64x32';

export default function VolumetricSpikePage() {
  const mountRef = useRef<HTMLDivElement>(null);

  // React state for HUD displays and synchronized controls
  const [mode, setMode] = useState<RenderMode>('raymarch');
  const [temperatureVal, setTemperatureVal] = useState<number>(27.8);
  const [resolution, setResolution] = useState<GridResolution>('32x32x16');
  const [fps, setFps] = useState<number>(60);
  const [frameTimeMs, setFrameTimeMs] = useState<number>(16.6);

  // Internal mutable refs for animation loop & callbacks
  const stateRef = useRef({
    mode: 'raymarch' as RenderMode,
    temperatureVal: 27.8,
    resolution: '32x32x16' as GridResolution,
    stepCount: 128,
  });

  const controllersRef = useRef<{
    mode?: Controller;
    temperature?: Controller;
    resolution?: Controller;
  }>({});

  useEffect(() => {
    stateRef.current.mode = mode;
  }, [mode]);

  useEffect(() => {
    stateRef.current.temperatureVal = temperatureVal;
  }, [temperatureVal]);

  useEffect(() => {
    stateRef.current.resolution = resolution;
  }, [resolution]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene setup
    const scene = new Scene();
    scene.background = new Color(0x0a0f1d); // deep oceanic dark slate

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 2. Camera setup
    const camera = new PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(1.6, 1.3, 1.8);

    // 3. Renderer setup
    const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 4. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);

    // 5. Lighting (for MarchingCubes isosurface)
    const ambientLight = new AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const keyLight = new DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(3, 4, 3);
    scene.add(keyLight);

    const fillLight = new DirectionalLight(0x4fc3f7, 1.0);
    fillLight.position.set(-3, -2, -2);
    scene.add(fillLight);

    // 6. Bounding box wireframe (spatial reference for the 1x1x1 volume)
    const boxGeo = new BoxGeometry(1, 1, 1);
    const edges = new EdgesGeometry(boxGeo);
    const boxWire = new LineSegments(
      edges,
      new LineBasicMaterial({ color: 0x38bdf8, opacity: 0.35, transparent: true })
    );
    scene.add(boxWire);

    // 7. Generate initial scalar fields
    let field32 = generateScalarField({ width: 32, height: 32, depth: 16 });
    let field64: ScalarField | null = null;
    let activeField = field32;

    // 8. Create rendering handles
    let raymarchHandle: VolumeRaymarchHandle = createVolumeRaymarch(
      activeField,
      stateRef.current.stepCount
    );
    scene.add(raymarchHandle.mesh);

    // Normalized midpoint for raymarch: (temp - min) / (max - min)
    const normMidpoint = (stateRef.current.temperatureVal - activeField.min) /
      (activeField.max - activeField.min);
    raymarchHandle.setOpacityMidpoint(normMidpoint);

    let isosurfaceHandle: VolumeIsosurfaceHandle = createVolumeIsosurface(
      activeField,
      stateRef.current.temperatureVal,
      32
    );
    // Isosurface is initially hidden since mode is raymarch
    isosurfaceHandle.mesh.visible = false;
    scene.add(isosurfaceHandle.mesh);

    // Helper to switch modes
    const applyMode = (newMode: RenderMode) => {
      stateRef.current.mode = newMode;
      setMode(newMode);

      if (newMode === 'raymarch') {
        raymarchHandle.mesh.visible = true;
        isosurfaceHandle.mesh.visible = false;
        const norm = (stateRef.current.temperatureVal - activeField.min) /
          (activeField.max - activeField.min);
        raymarchHandle.setOpacityMidpoint(norm);
      } else {
        raymarchHandle.mesh.visible = false;
        isosurfaceHandle.mesh.visible = true;
        isosurfaceHandle.setThreshold(stateRef.current.temperatureVal);
      }
    };

    // Helper to switch resolution
    const applyResolution = (res: GridResolution) => {
      stateRef.current.resolution = res;
      setResolution(res);

      if (res === '64x64x32') {
        if (!field64) {
          field64 = generateScalarField({ width: 64, height: 64, depth: 32 });
        }
        activeField = field64;
      } else {
        activeField = field32;
      }

      raymarchHandle.updateData(activeField);
      isosurfaceHandle.updateData(activeField);

      // Reapply threshold / midpoint
      const norm = (stateRef.current.temperatureVal - activeField.min) /
        (activeField.max - activeField.min);
      raymarchHandle.setOpacityMidpoint(norm);
      isosurfaceHandle.setThreshold(stateRef.current.temperatureVal);
    };

    // Helper to update slider value
    const applyTemperature = (val: number) => {
      stateRef.current.temperatureVal = val;
      setTemperatureVal(val);

      const norm = (val - activeField.min) / (activeField.max - activeField.min);
      raymarchHandle.setOpacityMidpoint(norm);
      isosurfaceHandle.setThreshold(val);
    };

    // 9. lil-gui setup
    const gui = new GUI({ title: 'Volumetric Spike Controls' });
    gui.domElement.style.position = 'absolute';
    gui.domElement.style.top = '20px';
    gui.domElement.style.right = '20px';
    gui.domElement.style.zIndex = '50';

    const guiParams = {
      mode: 'raymarch' as RenderMode,
      temperature: stateRef.current.temperatureVal,
      resolution: '32x32x16' as GridResolution,
      raymarchSteps: 128,
    };

    const modeController = gui.add(guiParams, 'mode', ['raymarch', 'isosurface']).name('Technique');
    modeController.onChange((v: RenderMode) => applyMode(v));
    controllersRef.current.mode = modeController;

    const tempController = gui
      .add(guiParams, 'temperature', 26.0, 30.0, 0.05)
      .name('Temp / Threshold (°C)');
    tempController.onChange((v: number) => applyTemperature(v));
    controllersRef.current.temperature = tempController;

    const resController = gui
      .add(guiParams, 'resolution', ['32x32x16', '64x64x32'])
      .name('Grid Resolution');
    resController.onChange((v: GridResolution) => applyResolution(v));
    controllersRef.current.resolution = resController;

    gui
      .add(guiParams, 'raymarchSteps', [64, 128, 256])
      .name('Raymarch Steps')
      .onChange((steps: number) => {
        stateRef.current.stepCount = steps;
        scene.remove(raymarchHandle.mesh);
        raymarchHandle.dispose();
        raymarchHandle = createVolumeRaymarch(activeField, steps);
        scene.add(raymarchHandle.mesh);
        raymarchHandle.mesh.visible = stateRef.current.mode === 'raymarch';
        const norm = (stateRef.current.temperatureVal - activeField.min) /
          (activeField.max - activeField.min);
        raymarchHandle.setOpacityMidpoint(norm);
      });

    // 10. Animation & FPS tracking loop
    let animationFrameId: number;
    let frameCount = 0;
    let lastTime = performance.now();
    let lastFpsUpdate = performance.now();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const now = performance.now();
      const delta = now - lastTime;
      lastTime = now;
      frameCount++;

      if (now - lastFpsUpdate >= 400) {
        const measuredFps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
        setFps(measuredFps);
        setFrameTimeMs(parseFloat(delta.toFixed(1)));
        frameCount = 0;
        lastFpsUpdate = now;
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // 11. Responsive resize
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // 12. Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      gui.destroy();

      raymarchHandle.dispose();
      isosurfaceHandle.dispose();
      boxGeo.dispose();
      edges.dispose();
      renderer.dispose();

      if (container && renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* Three.js canvas container */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Top-Left Header Badge */}
      <div className="absolute top-5 left-5 z-40 bg-slate-900/85 backdrop-blur-md border border-slate-700/60 rounded-xl p-4 text-white shadow-2xl max-w-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <h1 className="text-sm font-semibold tracking-wider text-slate-100 uppercase">
            Stage 1(b): Volumetric Spike
          </h1>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed mb-3">
          Standalone Three.js 3D ocean temperature anomaly field with real-time transfer function
          and isosurface extraction.
        </p>

        {/* Live FPS Badge */}
        <div className="flex items-center gap-3 pt-2 border-t border-slate-800 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">FPS:</span>
            <span
              className={`font-mono font-bold ${
                fps >= 50 ? 'text-emerald-400' : fps >= 30 ? 'text-amber-400' : 'text-rose-400'
              }`}
            >
              {fps}
            </span>
          </div>
          <div className="text-slate-500">•</div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Frame:</span>
            <span className="font-mono text-cyan-300">{frameTimeMs} ms</span>
          </div>
          <div className="text-slate-500">•</div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Grid:</span>
            <span className="font-mono text-slate-300">{resolution}</span>
          </div>
        </div>
      </div>

      {/* Bottom Floating Control Dock */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/90 backdrop-blur-lg border border-slate-700/70 rounded-2xl px-6 py-4 text-white shadow-2xl flex flex-col md:flex-row items-center gap-6">
        {/* Rendering Mode Selector */}
        <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setMode('raymarch');
              controllersRef.current.mode?.setValue('raymarch');
            }}
            className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
              mode === 'raymarch'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/25'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Raymarch Volume
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('isosurface');
              controllersRef.current.mode?.setValue('isosurface');
            }}
            className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
              mode === 'isosurface'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/25'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Marching Cubes
          </button>
        </div>

        {/* Double-Duty Slider */}
        <div className="flex flex-col gap-1 min-w-[240px]">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-medium">
              {mode === 'raymarch' ? 'Opacity Midpoint' : 'Isosurface Threshold'}
            </span>
            <span className="font-mono text-cyan-400 font-semibold">
              {temperatureVal.toFixed(2)} °C
            </span>
          </div>
          <input
            type="range"
            min={26.0}
            max={30.0}
            step={0.05}
            value={temperatureVal}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setTemperatureVal(val);
              controllersRef.current.temperature?.setValue(val);
            }}
            className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-700 rounded-lg appearance-none"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>26.0°C (Ambient)</span>
            <span>30.0°C (Anomaly Peak)</span>
          </div>
        </div>

        {/* Resolution Switcher (TASK 4 Sanity Check) */}
        <div className="flex items-center gap-2 border-l border-slate-800 pl-4">
          <span className="text-xs text-slate-400">Res:</span>
          <button
            type="button"
            onClick={() => {
              const nextRes = resolution === '32x32x16' ? '64x64x32' : '32x32x16';
              setResolution(nextRes);
              controllersRef.current.resolution?.setValue(nextRes);
            }}
            className="px-2.5 py-1 text-xs font-mono rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition-colors"
          >
            {resolution}
          </button>
        </div>
      </div>
    </div>
  );
}
