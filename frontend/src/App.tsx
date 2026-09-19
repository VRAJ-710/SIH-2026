import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import Plot from 'react-plotly.js';

// Stage 6b: Volumetric overlay (lazy-loaded to avoid loading Three.js until needed)
const VolumetricOverlay = lazy(() => import('./components/VolumetricOverlay'));

// --- Configuration for WMS (Stage 5 Real GLORYS12 Data) ---
const AMPHAN_RECTANGLE = Cesium.Rectangle.fromDegrees(82.0, 8.0, 92.0, 23.0);
const TDS_WMS_URL = '/thredds/wms/amphan_bob_real/temperature';

// Interfaces for API responses
interface InstrumentMarker {
  instrument_id: string;
  instrument_type: string;
  lat: number;
  lon: number;
  latest_time: string;
  variables: string[];
}

interface ProfileDepthData {
  depth: number;
  temperature?: number;
  salinity?: number;
  chlorophyll?: number;
  [key: string]: number | undefined;
}

interface InstrumentProfile {
  instrument_id: string;
  instrument_type: string;
  lat: number;
  lon: number;
  time: string;
  data: ProfileDepthData[];
}

interface DepthLevel {
  valueStr: string;
  depthMeters: number;
}

export type GridVariable = 'temperature' | 'salinity' | 'current_u' | 'current_v';

export interface VariableConfig {
  name: GridVariable;
  display_name: string;
  unit: string;
  min_val: number;
  max_val: number;
  default_palette: string;
}

const DEFAULT_VARIABLES: Record<GridVariable, VariableConfig> = {
  temperature: {
    name: 'temperature',
    display_name: 'Sea Surface Temperature',
    unit: '°C',
    min_val: 20.0,
    max_val: 32.0,
    default_palette: 'psu-magma',
  },
  salinity: {
    name: 'salinity',
    display_name: 'Sea Surface Salinity',
    unit: 'psu',
    min_val: 28.0,
    max_val: 36.0,
    default_palette: 'psu-viridis',
  },
  current_u: {
    name: 'current_u',
    display_name: 'Eastward Current Velocity',
    unit: 'm/s',
    min_val: -1.5,
    max_val: 1.5,
    default_palette: 'psu-viridis',
  },
  current_v: {
    name: 'current_v',
    display_name: 'Northward Current Velocity',
    unit: 'm/s',
    min_val: -1.5,
    max_val: 1.5,
    default_palette: 'psu-viridis',
  },
};

const AVAILABLE_PALETTES = [
  { id: 'psu-magma', label: 'Magma (psu-magma - Recommended)' },
  { id: 'psu-viridis', label: 'Viridis (psu-viridis)' },
  { id: 'x-Rainbow', label: 'Rainbow (x-Rainbow)' },
  { id: 'div-RdBu', label: 'RdBu Diverging' },
  { id: 'seq-Blues', label: 'Blues Sequential' },
  { id: 'seq-Heat', label: 'Heat Sequential' },
  { id: 'default', label: 'Default' },
];

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const layerRef = useRef<Cesium.ImageryLayer | null>(null);
  const markersRef = useRef<Cesium.CustomDataSource | null>(null);
  const clickHandlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);

  const [viewerReady, setViewerReady] = useState(false);
  
  // WMS State (Stage 5 Real Data dynamically loaded from GetCapabilities)
  const [depthLevels, setDepthLevels] = useState<DepthLevel[]>([]);
  const [depthIndex, setDepthIndex] = useState<number>(0);
  const [timeSteps, setTimeSteps] = useState<string[]>([]);
  const [timeIndex, setTimeIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [loadingCapabilities, setLoadingCapabilities] = useState<boolean>(true);

  // Stage 4 State
  const [instruments, setInstruments] = useState<InstrumentMarker[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<InstrumentProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Stage 6b: Volumetric 3D overlay state
  const [show3DOverlay, setShow3DOverlay] = useState(false);

  // Stage 7a State: Variable, Palette, Range overrides, Log scale, Opacity, Vertical exaggeration
  const [activeVariable, setActiveVariable] = useState<GridVariable>('temperature');
  const [palette, setPalette] = useState<string>('psu-magma');
  const [customMin, setCustomMin] = useState<number | null>(null);
  const [customMax, setCustomMax] = useState<number | null>(null);
  const [isLogScale, setIsLogScale] = useState<boolean>(false);
  const [layerOpacity, setLayerOpacity] = useState<number>(1.0);
  const [verticalExaggeration, setVerticalExaggeration] = useState<number>(1.0);
  const [variableConfigs, setVariableConfigs] = useState<Record<GridVariable, VariableConfig>>(DEFAULT_VARIABLES);

  // Initialize Cesium Viewer (Stage 7b Visual Polish Pass)
  useEffect(() => {
    if (!containerRef.current) return;

    // Task 1: Configure Cesium Ion Access Token from env
    const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
    if (ionToken) {
      Cesium.Ion.defaultAccessToken = ionToken;
    }

    // Task 1: Replace NaturalEarthII offline imagery with Cesium World Imagery
    const imageryPromise = Cesium.createWorldImageryAsync({
      style: Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS,
    }).catch((err) => {
      console.warn('[Cesium] createWorldImageryAsync fallback to NaturalEarthII:', err);
      return Cesium.TileMapServiceImageryProvider.fromUrl(
        Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'),
      );
    });

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayer: Cesium.ImageryLayer.fromProviderAsync(imageryPromise),
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      timeline: false,
      animation: false,
      fullscreenButton: false,
    });

    // Task 1: Replace EllipsoidTerrainProvider with Cesium World Bathymetry (Asset 2426648)
    // enabling requestVertexNormals: true so seafloor has real depth data and responds to vertical exaggeration
    (async () => {
      try {
        console.log('[Cesium] Requesting Cesium World Bathymetry (Asset 2426648) with vertex normals...');
        const bathyProvider = await Cesium.createWorldBathymetryAsync({
          requestVertexNormals: true,
        });
        if (!viewer.isDestroyed()) {
          viewer.scene.terrainProvider = bathyProvider;
          console.log('[Cesium] Cesium World Bathymetry successfully loaded on globe.');
        }
      } catch (bathyErr: any) {
        console.warn(
          '[Cesium] Could not load World Bathymetry (Asset 2426648):',
          bathyErr?.message || bathyErr,
          '— falling back to Cesium World Terrain (Asset 1)...',
        );
        try {
          const worldTerrainProvider = await Cesium.createWorldTerrainAsync({
            requestVertexNormals: true,
          });
          if (!viewer.isDestroyed()) {
            viewer.scene.terrainProvider = worldTerrainProvider;
            console.log('[Cesium] Cesium World Terrain active on globe.');
          }
        } catch (terrainErr: any) {
          console.error('[Cesium] Failed to load Cesium World Terrain:', terrainErr?.message || terrainErr);
        }
      }
    })();

    // Task 2: Dynamic sun-based shading, atmosphere, and starfield skybox
    viewer.scene.globe.enableLighting = true;
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = true;
    }
    viewer.scene.globe.showGroundAtmosphere = true;
    if (viewer.scene.skyBox) {
      viewer.scene.skyBox.show = true;
    }

    // Task 3: Smooth cinematic camera - start in orbit from space and fly in to Amphan bbox
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(87.0, 15.0, 18000000.0),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-90),
        roll: 0.0,
      },
    });

    viewer.camera.flyTo({
      destination: AMPHAN_RECTANGLE,
      duration: 3.8,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
    });

    const dataSource = new Cesium.CustomDataSource('instruments');
    viewer.dataSources.add(dataSource);
    markersRef.current = dataSource;

    // Handle clicks on markers
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: any) => {
      const pickedObject = viewer.scene.pick(click.position);
      if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.properties) {
        const instId = pickedObject.id.properties.instrument_id.getValue();
        const instType = pickedObject.id.properties.instrument_type.getValue();
        console.log(`CLICKED ENTITY: ${instType} (ID: ${instId}) at screen coords: ${click.position.x}, ${click.position.y}`);
        fetchProfile(instId);
      } else {
        console.log(`CLICKED MISS: No valid entity found at ${click.position.x}, ${click.position.y}`);
        setSelectedProfile(null); // Clicked off
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    clickHandlerRef.current = handler;

    viewerRef.current = viewer;
    (window as any).cesiumViewer = viewer;
    (window as any).Cesium = Cesium;
    setViewerReady(true);

    return () => {
      setViewerReady(false);
      delete (window as any).cesiumViewer;
      handler.destroy();
      layerRef.current = null;
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  // Fetch TDS GetCapabilities on mount to obtain actual available depth levels & time steps
  useEffect(() => {
    async function fetchCapabilities() {
      try {
        setLoadingCapabilities(true);
        const res = await fetch(`${TDS_WMS_URL}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`);
        if (!res.ok) throw new Error(`GetCapabilities failed: ${res.statusText}`);
        const xmlText = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, 'text/xml');

        const layers = Array.from(doc.getElementsByTagName('Layer'));
        const tempLayer = layers.find((l) => {
          const nameEl = l.getElementsByTagName('Name')[0];
          return nameEl && nameEl.textContent?.trim() === 'temperature';
        });

        if (tempLayer) {
          const dimensions = Array.from(tempLayer.getElementsByTagName('Dimension'));

          // Depth / elevation dimension
          const elevDim = dimensions.find((d) => {
            const name = d.getAttribute('name')?.toLowerCase();
            return name === 'elevation' || name === 'depth';
          });
          if (elevDim && elevDim.textContent) {
            const parsedDepths = elevDim.textContent
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .map((v) => ({
                valueStr: v,
                depthMeters: parseFloat(v),
              }))
              .sort((a, b) => a.depthMeters - b.depthMeters);
            setDepthLevels(parsedDepths);
            setDepthIndex(0); // Surface ~0.5m
          }

          // Time dimension (handles comma-delimited list or start/end/period interval)
          const timeDim = dimensions.find((d) => d.getAttribute('name')?.toLowerCase() === 'time');
          if (timeDim && timeDim.textContent) {
            const rawText = timeDim.textContent.trim();
            const times: string[] = [];
            const parts = rawText.split(',').map((s) => s.trim()).filter(Boolean);
            for (const part of parts) {
              if (part.includes('/')) {
                const [startStr, endStr] = part.split('/');
                const start = new Date(startStr);
                const end = new Date(endStr);
                const curr = new Date(start.getTime());
                while (curr.getTime() <= end.getTime()) {
                  times.push(curr.toISOString().replace('.000Z', 'Z').replace('Z', '.000Z'));
                  curr.setUTCDate(curr.getUTCDate() + 1);
                }
              } else {
                times.push(part);
              }
            }
            if (times.length > 0) {
              setTimeSteps(times);
              // Default to storm peak (2020-05-18) if available
              const defaultIdx = times.findIndex((t) => t.includes('2020-05-18'));
              setTimeIndex(defaultIdx >= 0 ? defaultIdx : 0);
            }
          }
        }
      } catch (err) {
        console.error('Failed to parse GetCapabilities:', err);
      } finally {
        setLoadingCapabilities(false);
      }
    }

    fetchCapabilities();
  }, []);

  // Playback timer (animates ~1s per day)
  useEffect(() => {
    if (!isPlaying || timeSteps.length === 0) return;
    const interval = setInterval(() => {
      setTimeIndex((prev) => (prev + 1) % timeSteps.length);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, timeSteps.length]);

  // Fetch Instruments on mount
  useEffect(() => {
    fetch('/api/instruments?bbox=8,82,23,92&time_range=2020-05-13T00:00:00Z,2020-05-25T23:59:59Z')
      .then((res) => res.json())
      .then((data: InstrumentMarker[]) => {
        setInstruments(data);
      })
      .catch((err) => console.error('Failed to fetch instruments:', err));
  }, []);

  // Render Markers
  useEffect(() => {
    const ds = markersRef.current;
    if (!viewerReady || !ds) return;
    
    ds.entities.removeAll();

    instruments.forEach((inst) => {
      let color = Cesium.Color.WHITE;
      if (inst.instrument_type === 'argo') color = Cesium.Color.YELLOW;
      if (inst.instrument_type === 'glider') color = Cesium.Color.CYAN;
      if (inst.instrument_type === 'buoy') color = Cesium.Color.RED;

      ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(inst.lon, inst.lat),
        point: {
          pixelSize: 12,
          color: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
        },
        properties: {
          instrument_id: inst.instrument_id,
          instrument_type: inst.instrument_type,
        },
      });
    });
  }, [instruments, viewerReady]);

  // Fetch /api/variables metadata on mount to initialize sensible defaults
  useEffect(() => {
    fetch('/api/variables')
      .then((res) => res.json())
      .then((data: { variables: any[] }) => {
        if (data && Array.isArray(data.variables)) {
          const updated = { ...DEFAULT_VARIABLES };
          for (const v of data.variables) {
            if (v.name in updated) {
              const k = v.name as GridVariable;
              updated[k] = {
                ...updated[k],
                display_name: v.display_name || updated[k].display_name,
                unit: v.unit || updated[k].unit,
                min_val: typeof v.min_val === 'number' ? v.min_val : updated[k].min_val,
                max_val: typeof v.max_val === 'number' ? v.max_val : updated[k].max_val,
              };
            }
          }
          setVariableConfigs(updated);
        }
      })
      .catch((err) => console.warn('Failed to fetch /api/variables, using defaults:', err));
  }, []);

  // Sync layer opacity to Cesium active imagery layer
  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.alpha = layerOpacity;
    }
  }, [layerOpacity]);

  // Sync vertical exaggeration to Cesium scene and globe
  useEffect(() => {
    if (viewerRef.current && !viewerRef.current.isDestroyed()) {
      const viewer = viewerRef.current;
      viewer.scene.verticalExaggeration = verticalExaggeration;
      if ('verticalExaggeration' in (viewer.scene.globe as any)) {
        (viewer.scene.globe as any).verticalExaggeration = verticalExaggeration;
      }
    }
  }, [verticalExaggeration]);

  // Task 1: When switching active variable, ALWAYS reset customMin/customMax to null
  const handleVariableChange = (newVar: GridVariable) => {
    setActiveVariable(newVar);
    setCustomMin(null);
    setCustomMax(null);
    const cfg = variableConfigs[newVar] || DEFAULT_VARIABLES[newVar];
    setPalette(cfg.default_palette || 'psu-viridis');
    if (cfg.min_val <= 0) {
      setIsLogScale(false);
    }
  };

  // Calculate current depth & dynamic color scale range
  const currentDepth = depthLevels[depthIndex];
  const currentTime = timeSteps[timeIndex];

  // Active variable configuration
  const currentVarConfig = variableConfigs[activeVariable] || DEFAULT_VARIABLES[activeVariable];
  const unit = currentVarConfig.unit;

  // Calculate default min/max
  let defaultMin = currentVarConfig.min_val;
  let defaultMax = currentVarConfig.max_val;

  if (activeVariable === 'temperature' && currentDepth) {
    if (currentDepth.depthMeters >= 200) {
      defaultMin = 1.0;
      defaultMax = 15.0;
    } else if (currentDepth.depthMeters >= 50) {
      defaultMin = 15.0;
      defaultMax = 28.0;
    } else {
      defaultMin = 24.0;
      defaultMax = 32.0;
    }
  }

  const effectiveMin = customMin !== null ? customMin : defaultMin;
  const effectiveMax = customMax !== null ? customMax : defaultMax;
  const canLogScale = effectiveMin > 0;
  const activeLogScale = isLogScale && canLogScale;

  // Handle WMS layer
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewerReady || !viewer || viewer.isDestroyed()) return;
    if (depthLevels.length === 0 || timeSteps.length === 0) return;

    if (layerRef.current) {
      viewer.imageryLayers.remove(layerRef.current, true);
      layerRef.current = null;
    }

    if (!currentDepth || !currentTime) return;

    const wmsUrl = `/thredds/wms/amphan_bob_real/${activeVariable}`;
    const stylesParam = palette === 'default' ? '' : `default-scalar/${palette}`;

    const provider = new Cesium.WebMapServiceImageryProvider({
      url: wmsUrl,
      layers: activeVariable,
      crs: 'CRS:84',
      enablePickFeatures: false,
      parameters: {
        service: 'WMS',
        version: '1.3.0',
        request: 'GetMap',
        styles: stylesParam,
        format: 'image/png',
        transparent: true,
        TIME: currentTime,
        ELEVATION: currentDepth.valueStr,
        COLORSCALERANGE: `${effectiveMin},${effectiveMax}`,
        ...(activeLogScale ? { LOGSCALE: 'true' } : { LOGSCALE: 'false' }),
      },
      rectangle: AMPHAN_RECTANGLE,
      tilingScheme: new Cesium.GeographicTilingScheme(),
    });

    const newLayer = viewer.imageryLayers.addImageryProvider(provider);
    newLayer.alpha = layerOpacity;
    layerRef.current = newLayer;

    // Sync Cesium Clock with timeline
    try {
      viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(currentTime);
    } catch {
      // fallback
    }
  }, [
    activeVariable,
    palette,
    effectiveMin,
    effectiveMax,
    activeLogScale,
    currentDepth,
    currentTime,
    viewerReady,
    layerOpacity,
    depthLevels.length,
    timeSteps.length,
  ]);

  const fetchProfile = async (instrumentId: string) => {
    setLoadingProfile(true);
    setSelectedProfile(null);
    try {
      const res = await fetch(`/api/instrument/${instrumentId}/profile`);
      if (res.ok) {
        const data = await res.json();
        setSelectedProfile(data);
      } else {
        console.error('Failed to fetch profile:', res.statusText);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoadingProfile(false);
    }
  };

  useEffect(() => {
    (window as any).fetchProfile = fetchProfile;
    return () => {
      delete (window as any).fetchProfile;
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Top Left WMS Panel (Stage 7b Unified Glassmorphic HUD) */}
      <div
        id="wms-panel"
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: show3DOverlay ? 25000 : 9999,
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(56, 189, 248, 0.28)',
          borderRadius: '14px',
          color: '#f8fafc',
          width: '395px',
          maxHeight: 'calc(100vh - 36px)',
          overflowY: 'auto',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
          fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: '12.5px',
          padding: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottom: '1px solid rgba(100, 116, 139, 0.25)', paddingBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 8px #38bdf8', display: 'inline-block' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.04em', textTransform: 'uppercase', color: '#f8fafc' }}>
                Cyclone Amphan: GLORYS12
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', letterSpacing: '0.02em' }}>
                Bay of Bengal (8–23°N, 82–92°E) • Live ncWMS
              </div>
            </div>
          </div>
        </div>

        {loadingCapabilities ? (
          <div style={{ padding: '12px 0', color: '#38bdf8', fontSize: '12px' }}>
            ⏳ Loading available depth levels & time steps from TDS...
          </div>
        ) : (
          <>
            {/* Task 1: Ocean Variable Selector */}
            <div style={{ marginBottom: 12, borderBottom: '1px solid rgba(100, 116, 139, 0.2)', paddingBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ color: '#cbd5e1', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Variable (WMS Layer):</strong>
                <span id="active-variable-label" style={{ fontWeight: 700, color: '#38bdf8', fontSize: '11px' }}>
                  {currentVarConfig.display_name}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                {(['temperature', 'salinity', 'current_u', 'current_v'] as GridVariable[]).map((v) => {
                  const isSelected = activeVariable === v;
                  return (
                    <button
                      key={v}
                      id={`var-btn-${v}`}
                      type="button"
                      onClick={() => handleVariableChange(v)}
                      style={{
                        padding: '6px 8px',
                        fontSize: '11px',
                        fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer',
                        background: isSelected
                          ? 'linear-gradient(135deg, #0284c7, #0369a1)'
                          : 'rgba(30, 41, 59, 0.65)',
                        color: isSelected ? '#ffffff' : '#94a3b8',
                        border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(100, 116, 139, 0.3)',
                        borderRadius: '8px',
                        textAlign: 'center',
                        boxShadow: isSelected ? '0 2px 10px rgba(56, 189, 248, 0.3)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {v === 'temperature' && '🌡️ Temperature'}
                      {v === 'salinity' && '🧂 Salinity'}
                      {v === 'current_u' && '➡️ Current U (East)'}
                      {v === 'current_v' && '⬆️ Current V (North)'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Depth Control Slider */}
            <div style={{ marginBottom: 12, borderBottom: '1px solid rgba(100, 116, 139, 0.2)', paddingBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <strong style={{ color: '#cbd5e1', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Depth (ELEVATION):</strong>
                <span id="current-depth-label" style={{ fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace', fontSize: '11.5px' }}>
                  {currentDepth ? `${currentDepth.depthMeters.toFixed(1)} m (Level ${depthIndex + 1}/${depthLevels.length})` : 'Loading...'}
                </span>
              </div>
              <input
                id="depth-slider"
                type="range"
                min={0}
                max={Math.max(0, depthLevels.length - 1)}
                step={1}
                value={depthIndex}
                onChange={(e) => setDepthIndex(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: '#38bdf8' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b', marginTop: 2 }}>
                <span>Surface ({depthLevels[0]?.depthMeters.toFixed(1)}m)</span>
                <span>Deep ({depthLevels[depthLevels.length - 1]?.depthMeters.toFixed(1)}m)</span>
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setDepthIndex(0)}
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    fontSize: '10.5px',
                    fontWeight: depthIndex === 0 ? 700 : 500,
                    cursor: 'pointer',
                    background: depthIndex === 0 ? '#0891b2' : 'rgba(30, 41, 59, 0.65)',
                    color: depthIndex === 0 ? '#fff' : '#94a3b8',
                    border: depthIndex === 0 ? '1px solid #22d3ee' : '1px solid rgba(100, 116, 139, 0.3)',
                    borderRadius: '6px',
                  }}
                >
                  Surface (0.5m)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const idx = depthLevels.findIndex((d) => d.depthMeters >= 90);
                    if (idx >= 0) setDepthIndex(idx);
                  }}
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    fontSize: '10.5px',
                    fontWeight: depthLevels[depthIndex]?.depthMeters >= 90 && depthLevels[depthIndex]?.depthMeters < 150 ? 700 : 500,
                    cursor: 'pointer',
                    background: depthLevels[depthIndex]?.depthMeters >= 90 && depthLevels[depthIndex]?.depthMeters < 150 ? '#0891b2' : 'rgba(30, 41, 59, 0.65)',
                    color: depthLevels[depthIndex]?.depthMeters >= 90 && depthLevels[depthIndex]?.depthMeters < 150 ? '#fff' : '#94a3b8',
                    border: depthLevels[depthIndex]?.depthMeters >= 90 && depthLevels[depthIndex]?.depthMeters < 150 ? '1px solid #22d3ee' : '1px solid rgba(100, 116, 139, 0.3)',
                    borderRadius: '6px',
                  }}
                >
                  Thermocline (92m)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const idx = depthLevels.findIndex((d) => d.depthMeters >= 450);
                    if (idx >= 0) setDepthIndex(idx);
                  }}
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    fontSize: '10.5px',
                    fontWeight: depthLevels[depthIndex]?.depthMeters >= 400 && depthLevels[depthIndex]?.depthMeters < 600 ? 700 : 500,
                    cursor: 'pointer',
                    background: depthLevels[depthIndex]?.depthMeters >= 400 && depthLevels[depthIndex]?.depthMeters < 600 ? '#0891b2' : 'rgba(30, 41, 59, 0.65)',
                    color: depthLevels[depthIndex]?.depthMeters >= 400 && depthLevels[depthIndex]?.depthMeters < 600 ? '#fff' : '#94a3b8',
                    border: depthLevels[depthIndex]?.depthMeters >= 400 && depthLevels[depthIndex]?.depthMeters < 600 ? '1px solid #22d3ee' : '1px solid rgba(100, 116, 139, 0.3)',
                    borderRadius: '6px',
                  }}
                >
                  Deep (454m)
                </button>
              </div>
            </div>

            {/* Time Control Scrubber & Animation */}
            <div style={{ marginBottom: 12, borderBottom: '1px solid rgba(100, 116, 139, 0.2)', paddingBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <strong style={{ color: '#cbd5e1', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Time (TIME):</strong>
                <span id="current-time-label" style={{ fontWeight: 700, color: '#f59e0b', fontFamily: 'monospace', fontSize: '11.5px' }}>
                  {currentTime ? `${currentTime.substring(0, 10)} (Day ${timeIndex + 1}/${timeSteps.length})` : 'Loading...'}
                </span>
              </div>
              <input
                id="time-scrubber"
                type="range"
                min={0}
                max={Math.max(0, timeSteps.length - 1)}
                step={1}
                value={timeIndex}
                onChange={(e) => setTimeIndex(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: '#38bdf8' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b', marginTop: 2 }}>
                <span>{timeSteps[0]?.substring(0, 10)}</span>
                <span>{timeSteps[timeSteps.length - 1]?.substring(0, 10)}</span>
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: 6, alignItems: 'center' }}>
                <button
                  id="play-button"
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  style={{
                    flex: 2,
                    padding: '5px 8px',
                    fontWeight: 700,
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    background: isPlaying
                      ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(185, 28, 28, 0.35))'
                      : 'linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(2, 132, 199, 0.35))',
                    border: isPlaying ? '1px solid #f87171' : '1px solid #38bdf8',
                    borderRadius: '6px',
                    color: '#fff',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  {isPlaying ? '⏸ Pause Animation' : '▶ Play Animation'}
                </button>
                <button
                  id="prev-time-btn"
                  type="button"
                  onClick={() => setTimeIndex((prev) => (prev > 0 ? prev - 1 : timeSteps.length - 1))}
                  style={{
                    flex: 1,
                    padding: '5px 6px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    background: 'rgba(30, 41, 59, 0.65)',
                    border: '1px solid rgba(100, 116, 139, 0.3)',
                    borderRadius: '6px',
                    color: '#cbd5e1',
                  }}
                  title="Previous Day"
                >
                  ⏮ Prev
                </button>
                <button
                  id="next-time-btn"
                  type="button"
                  onClick={() => setTimeIndex((prev) => (prev < timeSteps.length - 1 ? prev + 1 : 0))}
                  style={{
                    flex: 1,
                    padding: '5px 6px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    background: 'rgba(30, 41, 59, 0.65)',
                    border: '1px solid rgba(100, 116, 139, 0.3)',
                    borderRadius: '6px',
                    color: '#cbd5e1',
                  }}
                  title="Next Day"
                >
                  Next ⏭
                </button>
              </div>
            </div>

            {/* Task 2: Colorbar Editor & Scale Controls */}
            <div style={{ marginBottom: 12, borderBottom: '1px solid rgba(100, 116, 139, 0.2)', paddingBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 8, color: '#cbd5e1' }}>
                Colorbar & Scale Controls
              </div>

              {/* Palette selector */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label htmlFor="palette-select" style={{ fontSize: '11px', color: '#94a3b8' }}>Palette:</label>
                <select
                  id="palette-select"
                  value={palette}
                  onChange={(e) => setPalette(e.target.value)}
                  style={{
                    fontSize: '11px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(100, 116, 139, 0.4)',
                    background: '#1e293b',
                    color: '#f8fafc',
                    width: '230px',
                    cursor: 'pointer',
                  }}
                >
                  {AVAILABLE_PALETTES.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* Min/Max Overrides */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="range-min-input" style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: 2 }}>
                    Min ({unit}):
                  </label>
                  <input
                    id="range-min-input"
                    type="number"
                    step={activeVariable.startsWith('current') ? '0.1' : '0.5'}
                    value={customMin !== null ? customMin : effectiveMin}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setCustomMin(isNaN(val) ? null : val);
                    }}
                    style={{
                      width: '100%',
                      fontSize: '11px',
                      padding: '4px 6px',
                      background: '#1e293b',
                      color: '#f8fafc',
                      border: '1px solid rgba(100, 116, 139, 0.4)',
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="range-max-input" style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: 2 }}>
                    Max ({unit}):
                  </label>
                  <input
                    id="range-max-input"
                    type="number"
                    step={activeVariable.startsWith('current') ? '0.1' : '0.5'}
                    value={customMax !== null ? customMax : effectiveMax}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setCustomMax(isNaN(val) ? null : val);
                    }}
                    style={{
                      width: '100%',
                      fontSize: '11px',
                      padding: '4px 6px',
                      background: '#1e293b',
                      color: '#f8fafc',
                      border: '1px solid rgba(100, 116, 139, 0.4)',
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
                <div>
                  <button
                    id="reset-range-btn"
                    type="button"
                    onClick={() => {
                      setCustomMin(null);
                      setCustomMax(null);
                    }}
                    disabled={customMin === null && customMax === null}
                    style={{
                      fontSize: '11px',
                      padding: '4px 8px',
                      height: '26px',
                      cursor: (customMin === null && customMax === null) ? 'default' : 'pointer',
                      background: 'rgba(51, 65, 85, 0.65)',
                      border: '1px solid rgba(100, 116, 139, 0.4)',
                      borderRadius: '6px',
                      color: '#e2e8f0',
                      opacity: (customMin === null && customMax === null) ? 0.35 : 1,
                    }}
                    title="Reset to variable default range"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Log scale toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', color: '#cbd5e1', cursor: canLogScale ? 'pointer' : 'not-allowed' }}>
                  <input
                    id="logscale-toggle"
                    type="checkbox"
                    checked={activeLogScale}
                    disabled={!canLogScale}
                    onChange={(e) => setIsLogScale(e.target.checked)}
                    style={{ accentColor: '#38bdf8' }}
                  />
                  <span>Logarithmic Scale</span>
                </label>
                {!canLogScale && (
                  <span id="logscale-note" style={{ fontSize: '10px', color: '#f87171' }}>
                    Requires min &gt; 0
                  </span>
                )}
              </div>

              {/* Dynamic WMS Legend Graphic */}
              <div style={{ marginTop: 6, background: 'rgba(15, 23, 42, 0.7)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, marginBottom: 4 }}>
                  <span style={{ color: '#cbd5e1' }}>{currentVarConfig.display_name}:</span>
                  <span id="legend-range-label" style={{ color: '#38bdf8', fontFamily: 'monospace' }}>
                    {effectiveMin} to {effectiveMax} {unit}
                  </span>
                </div>
                <div style={{ margin: '6px 0' }}>
                  <img
                    id="wms-legend-img"
                    key={`${activeVariable}-${palette}-${effectiveMin}-${effectiveMax}-${activeLogScale}`}
                    src={`/thredds/wms/amphan_bob_real/${activeVariable}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&LAYER=${activeVariable}&STYLES=${palette === 'default' ? '' : `default-scalar/${palette}`}&COLORSCALERANGE=${effectiveMin},${effectiveMax}&WIDTH=280&HEIGHT=14${activeLogScale ? '&LOGSCALE=true' : ''}`}
                    alt="WMS Colorbar Legend"
                    style={{ width: '100%', height: '16px', display: 'block', borderRadius: '4px', border: '1px solid rgba(100, 116, 139, 0.3)' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>
                  <span id="legend-min-display">{effectiveMin} {unit}</span>
                  <span id="legend-mid-display">{((effectiveMin + effectiveMax) / 2).toFixed(1)} {unit}</span>
                  <span id="legend-max-display">{effectiveMax} {unit}</span>
                </div>
              </div>
            </div>

            {/* Task 3: Layer Opacity Control */}
            <div style={{ marginBottom: 12, borderBottom: '1px solid rgba(100, 116, 139, 0.2)', paddingBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <strong style={{ color: '#cbd5e1', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Layer Opacity:</strong>
                <span id="opacity-label" style={{ fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace', fontSize: '11.5px' }}>
                  {Math.round(layerOpacity * 100)}%
                </span>
              </div>
              <input
                id="opacity-slider"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={layerOpacity}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setLayerOpacity(val);
                  if (layerRef.current) {
                    layerRef.current.alpha = val;
                  }
                }}
                style={{ width: '100%', cursor: 'pointer', accentColor: '#38bdf8' }}
              />
            </div>

            {/* Task 4: Vertical Exaggeration Control */}
            <div style={{ marginBottom: 12, borderBottom: '1px solid rgba(100, 116, 139, 0.2)', paddingBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <strong style={{ color: '#cbd5e1', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Vertical Exaggeration:</strong>
                <span id="vertical-exaggeration-label" style={{ fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace', fontSize: '11.5px' }}>
                  {verticalExaggeration.toFixed(1)}×
                </span>
              </div>
              <input
                id="vertical-exaggeration-slider"
                type="range"
                min={1.0}
                max={10.0}
                step={0.5}
                value={verticalExaggeration}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setVerticalExaggeration(val);
                  if (viewerRef.current && !viewerRef.current.isDestroyed()) {
                    const viewer = viewerRef.current;
                    viewer.scene.verticalExaggeration = val;
                    if ('verticalExaggeration' in (viewer.scene.globe as any)) {
                      (viewer.scene.globe as any).verticalExaggeration = val;
                    }
                  }
                }}
                style={{ width: '100%', cursor: 'pointer', accentColor: '#38bdf8' }}
              />
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: 3, lineHeight: 1.35 }}>
                Exaggerates 3D seafloor bathymetry and coastal relief across the Bay of Bengal basin.
              </div>
            </div>

            {/* Stage 6b: Drill into 3D Volumetric View */}
            <div style={{ paddingTop: 4 }}>
              <button
                id="drill-3d-button"
                type="button"
                onClick={() => setShow3DOverlay(!show3DOverlay)}
                disabled={!currentTime}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  fontWeight: 700,
                  fontSize: '12.5px',
                  cursor: currentTime ? 'pointer' : 'not-allowed',
                  background: show3DOverlay
                    ? 'linear-gradient(135deg, #e11d48, #be123c)'
                    : 'linear-gradient(135deg, #0284c7, #0369a1)',
                  color: '#fff',
                  border: show3DOverlay ? '1px solid #f43f5e' : '1px solid #38bdf8',
                  borderRadius: '8px',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
                  letterSpacing: '0.03em',
                  opacity: currentTime ? 1 : 0.5,
                  transition: 'all 0.2s',
                }}
              >
                {show3DOverlay ? '✕ Close 3D Volumetric View' : '🌊 Drill into 3D Volumetric View'}
              </button>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: 5, textAlign: 'center' as const }}>
                {show3DOverlay ? 'Showing 3D ocean temperature volume with thermal bloom' : 'Opens 3D temperature volume (84–90°E, 14–18°N, 0–200m)'}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Profile Popup (Stage 7b Glassmorphic Dark Layout) */}
      {(selectedProfile || loadingProfile) && (
        <div
          id="profile-popup"
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            padding: '16px 18px',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: '14px',
            color: '#f8fafc',
            width: '400px',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6)',
            maxHeight: '620px',
            overflowY: 'auto',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          }}
        >
          {loadingProfile ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#38bdf8', fontSize: '13px' }}>
              ⏳ Loading profile data from /api/instrument/...
            </div>
          ) : selectedProfile ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '13.5px', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: '#f8fafc' }}>
                    {selectedProfile.instrument_type.toUpperCase()} • {selectedProfile.instrument_id}
                  </h3>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 2 }}>
                    {selectedProfile.time.substring(0, 10)} | {selectedProfile.lat.toFixed(4)}°N, {selectedProfile.lon.toFixed(4)}°E
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProfile(null)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px',
                    color: '#fff',
                    width: '28px',
                    height: '28px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 700,
                  }}
                  title="Close Profile Popup"
                >
                  ✕
                </button>
              </div>

              <Plot
                data={[
                  {
                    x: selectedProfile.data.filter((d) => d.temperature !== undefined).map((d) => d.temperature!),
                    y: selectedProfile.data.filter((d) => d.temperature !== undefined).map((d) => d.depth),
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Temp (°C)',
                    line: { color: '#f87171', width: 2 },
                    marker: { size: 5, color: '#f87171' },
                  },
                  {
                    x: selectedProfile.data.filter((d) => d.salinity !== undefined).map((d) => d.salinity!),
                    y: selectedProfile.data.filter((d) => d.salinity !== undefined).map((d) => d.depth),
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Salinity (PSU)',
                    line: { color: '#38bdf8', width: 2 },
                    marker: { size: 5, color: '#38bdf8' },
                    xaxis: 'x2',
                  },
                  {
                    x: selectedProfile.data.filter((d) => d.chlorophyll !== undefined).map((d) => d.chlorophyll!),
                    y: selectedProfile.data.filter((d) => d.chlorophyll !== undefined).map((d) => d.depth),
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Chl-a (mg/m³)',
                    line: { color: '#4ade80', width: 2 },
                    marker: { size: 5, color: '#4ade80' },
                    xaxis: 'x3',
                  },
                ].filter((trace) => trace.x.length > 0)}
                layout={{
                  width: 360,
                  height: 380,
                  margin: { l: 50, r: 20, t: 35, b: 35 },
                  paper_bgcolor: 'rgba(0, 0, 0, 0)',
                  plot_bgcolor: 'rgba(15, 23, 42, 0.7)',
                  font: { color: '#cbd5e1', family: 'Inter, system-ui, sans-serif', size: 10 },
                  yaxis: {
                    title: 'Depth (m)',
                    autorange: 'reversed',
                    color: '#94a3b8',
                    gridcolor: 'rgba(100, 116, 139, 0.2)',
                    zerolinecolor: 'rgba(100, 116, 139, 0.3)',
                  },
                  xaxis: {
                    title: 'Temp (°C)',
                    side: 'bottom',
                    color: '#f87171',
                    showgrid: false,
                    tickcolor: '#f87171',
                  },
                  xaxis2: {
                    title: 'Salinity (PSU)',
                    side: 'top',
                    overlaying: 'x',
                    color: '#38bdf8',
                    showgrid: false,
                    tickcolor: '#38bdf8',
                  },
                  xaxis3: {
                    title: 'Chl-a',
                    side: 'top',
                    overlaying: 'x',
                    color: '#4ade80',
                    showgrid: false,
                    position: 0.88,
                    tickcolor: '#4ade80',
                  },
                  showlegend: true,
                  legend: {
                    orientation: 'h',
                    y: -0.22,
                    font: { color: '#cbd5e1', size: 10 },
                    bgcolor: 'rgba(0, 0, 0, 0)',
                  },
                }}
                config={{ displayModeBar: false, responsive: true }}
              />
            </div>
          ) : null}
        </div>
      )}

      {/* Legend (Stage 7b Glassmorphic Dark Layout) */}
      <div
        id="instruments-legend"
        style={{
          position: 'absolute',
          bottom: 20,
          left: 424,
          zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          padding: '10px 14px',
          border: '1px solid rgba(56, 189, 248, 0.28)',
          borderRadius: '12px',
          color: '#f8fafc',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          fontSize: '11.5px',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: 6 }}>
          In-Situ Instruments
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#facc15', fontSize: '14px', textShadow: '0 0 6px rgba(250, 204, 21, 0.6)' }}>●</span>
            <span style={{ color: '#e2e8f0' }}>Argo Float</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#22d3ee', fontSize: '14px', textShadow: '0 0 6px rgba(34, 211, 238, 0.6)' }}>●</span>
            <span style={{ color: '#e2e8f0' }}>Glider</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#f87171', fontSize: '14px', textShadow: '0 0 6px rgba(248, 113, 113, 0.6)' }}>●</span>
            <span style={{ color: '#e2e8f0' }}>Moored Buoy</span>
          </div>
        </div>
      </div>

      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Stage 6b: 3D Volumetric Overlay */}
      {show3DOverlay && (
        <Suspense fallback={null}>
          <VolumetricOverlay
            currentTime={currentTime}
            onClose={() => setShow3DOverlay(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
