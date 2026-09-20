import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import gsap from 'gsap';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import Plot from 'react-plotly.js';
import { TOUR_BEATS } from './lib/tourScript';
import GuidedTourPanel from './components/GuidedTourPanel';

export type UIMode = 'forecaster' | 'public';

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
  current_u?: number;
  current_v?: number;
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

/** Timeout helper for external network requests (Cesium Ion imagery & bathymetry). */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMsg));
    }, timeoutMs);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

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
  
  // Stage 9 State: Forecaster / Public mode & Guided Tour
  const [uiMode, setUiMode] = useState<UIMode>('forecaster');
  const [isTourActive, setIsTourActive] = useState<boolean>(false);
  const [currentBeatIndex, setCurrentBeatIndex] = useState<number>(0);
  const [tourPlaying, setTourPlaying] = useState<boolean>(false);
  const [isCameraFlying, setIsCameraFlying] = useState<boolean>(false);
  const [dwellRemainingSec, setDwellRemainingSec] = useState<number>(7);
  const [basemapStatus, setBasemapStatus] = useState<'ion' | 'offline'>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'ion'
  );

  // Stage UI Polish (Task 8): Collapsible Sidebar State with GSAP smooth transition
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sidebarRef.current) return;
    if (isSidebarOpen) {
      gsap.to(sidebarRef.current, {
        x: 0,
        opacity: 1,
        duration: 0.35,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    } else {
      gsap.to(sidebarRef.current, {
        x: -425,
        opacity: 0,
        duration: 0.28,
        ease: 'power2.in',
        overwrite: 'auto',
      });
    }
  }, [isSidebarOpen]);

  // Initialize Cesium Viewer with Automatic Offline / Timeout Resilience (Stage 10)
  useEffect(() => {
    if (!containerRef.current) return;

    // Task 1: Configure Cesium Ion Access Token from env
    const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
    if (ionToken) {
      Cesium.Ion.defaultAccessToken = ionToken;
    }

    const TIMEOUT_MS = 6000;
    const isInitiallyOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    let currentBasemap = isInitiallyOffline ? 'offline' : 'ion';

    const getOfflineImageryProvider = () =>
      Cesium.TileMapServiceImageryProvider.fromUrl(
        Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'),
      );

    // Task 2: Attempt Cesium World Imagery with 6-second timeout; fall back gracefully to NaturalEarthII
    const imageryPromise = (async () => {
      if (isInitiallyOffline) {
        console.log('[Cesium] Browser is offline. Loading NaturalEarthII offline basemap immediately.');
        setBasemapStatus('offline');
        return getOfflineImageryProvider();
      }

      try {
        console.log(`[Cesium] Requesting Cesium World Imagery (${TIMEOUT_MS}ms timeout)...`);
        const provider = await withTimeout(
          Cesium.createWorldImageryAsync({
            style: Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS,
          }),
          TIMEOUT_MS,
          'Cesium World Imagery request timed out after 6s',
        );
        setBasemapStatus('ion');
        return provider;
      } catch (err: any) {
        console.warn(
          '[Cesium] createWorldImageryAsync failed or timed out; falling back to NaturalEarthII:',
          err?.message || err,
        );
        setBasemapStatus('offline');
        return getOfflineImageryProvider();
      }
    })();

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayer: Cesium.ImageryLayer.fromProviderAsync(imageryPromise),
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
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

    // Task 2: Attempt World Bathymetry / Terrain with 6-second timeout; fall back to EllipsoidTerrainProvider
    (async () => {
      if (isInitiallyOffline) {
        console.log('[Cesium] Browser is offline. Using EllipsoidTerrainProvider (offline).');
        return;
      }

      try {
        console.log(`[Cesium] Requesting Cesium World Bathymetry (Asset 2426648, ${TIMEOUT_MS}ms timeout)...`);
        const bathyProvider = await withTimeout(
          Cesium.createWorldBathymetryAsync({
            requestVertexNormals: true,
          }),
          TIMEOUT_MS,
          'Cesium World Bathymetry request timed out after 6s',
        );
        if (!viewer.isDestroyed()) {
          viewer.scene.terrainProvider = bathyProvider;
          bathyProvider.errorEvent.addEventListener((err) => {
            console.warn('[Cesium] World Bathymetry runtime tile error; falling back to EllipsoidTerrainProvider:', err);
            if (!viewer.isDestroyed()) {
              viewer.scene.terrainProvider = new Cesium.EllipsoidTerrainProvider();
            }
          });
          console.log('[Cesium] Cesium World Bathymetry successfully loaded on globe.');
        }
      } catch (bathyErr: any) {
        console.warn(
          '[Cesium] Could not load World Bathymetry (Asset 2426648):',
          bathyErr?.message || bathyErr,
          '— falling back to Cesium World Terrain (Asset 1)...',
        );
        try {
          const worldTerrainProvider = await withTimeout(
            Cesium.createWorldTerrainAsync({
              requestVertexNormals: true,
            }),
            TIMEOUT_MS,
            'Cesium World Terrain request timed out after 6s',
          );
          if (!viewer.isDestroyed()) {
            viewer.scene.terrainProvider = worldTerrainProvider;
            worldTerrainProvider.errorEvent.addEventListener((err) => {
              console.warn('[Cesium] World Terrain runtime tile error; falling back to EllipsoidTerrainProvider:', err);
              if (!viewer.isDestroyed()) {
                viewer.scene.terrainProvider = new Cesium.EllipsoidTerrainProvider();
              }
            });
            console.log('[Cesium] Cesium World Terrain active on globe.');
          }
        } catch (terrainErr: any) {
          console.warn(
            '[Cesium] Failed to load Cesium World Terrain:',
            terrainErr?.message || terrainErr,
            '— falling back to EllipsoidTerrainProvider (offline).',
          );
          if (!viewer.isDestroyed()) {
            viewer.scene.terrainProvider = new Cesium.EllipsoidTerrainProvider();
            console.log('[Cesium] EllipsoidTerrainProvider active on globe.');
          }
        }
      }
    })();

    // Continuous runtime monitoring for tile failures on online imagery
    let failedTileCount = 0;
    const switchToOfflineBasemap = async () => {
      if (currentBasemap === 'offline' || viewer.isDestroyed()) return;
      currentBasemap = 'offline';
      setBasemapStatus('offline');
      console.warn('[Cesium] Online imagery tile failures detected. Recovering to NaturalEarthII basemap.');
      try {
        const offlineProvider = await getOfflineImageryProvider();
        if (viewer.isDestroyed()) return;
        if (viewer.imageryLayers.length > 0) {
          const currentBase = viewer.imageryLayers.get(0);
          viewer.imageryLayers.remove(currentBase, true);
        }
        const newBase = viewer.imageryLayers.addImageryProvider(offlineProvider, 0);
        newBase.alpha = 1.0;
        console.log('[Cesium] Recovered successfully to NaturalEarthII offline basemap.');
      } catch (fallbackErr) {
        console.error('[Cesium] Failed to switch to NaturalEarthII:', fallbackErr);
      }
    };

    viewer.imageryLayers.layerAdded.addEventListener((layer: Cesium.ImageryLayer) => {
      if (layer !== layerRef.current) {
        layer.errorEvent.addEventListener((tileError: any) => {
          failedTileCount++;
          console.warn(`[Cesium] Base imagery tile error (#${failedTileCount}):`, tileError);
          if (failedTileCount >= 4 && currentBasemap === 'ion') {
            switchToOfflineBasemap();
          }
        });
      }
    });

    const handleOfflineEvent = () => {
      console.warn('[Cesium] Window offline event detected. Triggering offline fallback.');
      switchToOfflineBasemap();
      if (!viewer.isDestroyed()) {
        viewer.scene.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      }
    };
    window.addEventListener('offline', handleOfflineEvent);

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
      window.removeEventListener('offline', handleOfflineEvent);
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

    const activeTourBeat = isTourActive ? TOUR_BEATS[currentBeatIndex] : null;

    instruments.forEach((inst) => {
      let color = Cesium.Color.WHITE;
      if (inst.instrument_type === 'argo') color = Cesium.Color.fromCssColorString('#fbbf24');
      if (inst.instrument_type === 'glider') color = Cesium.Color.fromCssColorString('#06b6d4');
      if (inst.instrument_type === 'buoy') color = Cesium.Color.fromCssColorString('#f43f5e');
      if (inst.instrument_type === 'adcp') color = Cesium.Color.fromCssColorString('#a855f7');

      const isTargetInstrument = activeTourBeat?.instrumentId === inst.instrument_id;

      ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(inst.lon, inst.lat),
        point: {
          pixelSize: isTargetInstrument ? 18 : 11,
          color: isTargetInstrument ? Cesium.Color.fromCssColorString('#38bdf8') : color,
          outlineColor: isTargetInstrument ? Cesium.Color.WHITE : Cesium.Color.fromCssColorString('#121214'),
          outlineWidth: isTargetInstrument ? 2.5 : 1.5,
        },
        properties: {
          instrument_id: inst.instrument_id,
          instrument_type: inst.instrument_type,
        },
      });
    });
  }, [instruments, viewerReady, isTourActive, currentBeatIndex]);

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

  const activateTourBeat = (beatIdx: number) => {
    if (beatIdx < 0 || beatIdx >= TOUR_BEATS.length) return;
    const beat = TOUR_BEATS[beatIdx];
    setCurrentBeatIndex(beatIdx);
    setDwellRemainingSec(7);

    // 1. Match time index
    if (timeSteps.length > 0) {
      const tIdx = timeSteps.findIndex((t) => t.includes(beat.targetDate));
      if (tIdx >= 0) {
        setTimeIndex(tIdx);
      }
    }

    // 2. Match depth index
    if (depthLevels.length > 0) {
      const dIdx = depthLevels.findIndex((d) => Math.abs(d.depthMeters - beat.depthMeters) < 1.0);
      if (dIdx >= 0) {
        setDepthIndex(dIdx);
      } else {
        setDepthIndex(0);
      }
    }

    // 3. Match variable
    handleVariableChange(beat.variable);

    // 4. Highlight / auto-open profile if beat specifies one (Beat 5 BGC-Argo #2902264)
    if (beat.instrumentId) {
      fetchProfile(beat.instrumentId);
    } else {
      setSelectedProfile(null);
    }

    // 5. Smooth camera flight
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      setIsCameraFlying(true);
      const target = Cesium.Cartesian3.fromDegrees(
        beat.camera.destination.lon,
        beat.camera.destination.lat,
        beat.camera.destination.height,
      );
      viewer.camera.flyTo({
        destination: target,
        orientation: {
          heading: Cesium.Math.toRadians(beat.camera.headingDeg),
          pitch: Cesium.Math.toRadians(beat.camera.pitchDeg),
          roll: Cesium.Math.toRadians(beat.camera.rollDeg),
        },
        duration: 2.5,
        easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
        complete: () => {
          setIsCameraFlying(false);
        },
        cancel: () => {
          setIsCameraFlying(false);
        },
      });
    }
  };

  const handleStartTour = () => {
    setIsTourActive(true);
    setTourPlaying(false);
    activateTourBeat(0);
  };

  const handleExitTour = () => {
    setIsTourActive(false);
    setTourPlaying(false);
  };

  const handleTourCallToAction = (action: 'open_3d' | 'open_profile', instrumentId?: string) => {
    if (action === 'open_3d') {
      setShow3DOverlay(true);
    } else if (action === 'open_profile' && instrumentId) {
      fetchProfile(instrumentId);
    }
  };

  // Auto-play timer: camera flight completion + minimum 7-second dwell
  useEffect(() => {
    if (!isTourActive || !tourPlaying) return;

    const interval = setInterval(() => {
      // Pause countdown while camera is flying
      if (isCameraFlying) return;

      setDwellRemainingSec((prev) => {
        if (prev <= 1) {
          setCurrentBeatIndex((currentIdx) => {
            const nextIdx = (currentIdx + 1) % TOUR_BEATS.length;
            activateTourBeat(nextIdx);
            return nextIdx;
          });
          return 7;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isTourActive, tourPlaying, isCameraFlying]);

  useEffect(() => {
    (window as any).fetchProfile = fetchProfile;
    (window as any).startTour = handleStartTour;
    (window as any).exitTour = handleExitTour;
    (window as any).setTourBeat = activateTourBeat;
    (window as any).setUiMode = setUiMode;
    (window as any).setSidebarOpen = (open: boolean) => {
      setIsSidebarOpen(open);
    };
    return () => {
      delete (window as any).fetchProfile;
      delete (window as any).startTour;
      delete (window as any).exitTour;
      delete (window as any).setTourBeat;
      delete (window as any).setUiMode;
      delete (window as any).setSidebarOpen;
    };
  }, [timeSteps, depthLevels]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Floating Left Tab (Visible when sidebar is collapsed) */}
      <button
        id="sidebar-collapsed-tab"
        type="button"
        onClick={() => setIsSidebarOpen(true)}
        onMouseEnter={() => setIsSidebarOpen(true)}
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 9998,
          background: 'rgba(30, 30, 30, 0.94)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '6px',
          padding: '8px 14px',
          color: '#f3f4f6',
          cursor: 'pointer',
          display: isSidebarOpen ? 'none' : 'flex',
          alignItems: 'center',
          gap: 10,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          fontSize: '12px',
          fontWeight: 600,
          transition: 'all 0.15s ease',
        }}
        title="Open Ocean Controls (Click or Hover)"
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 8px #38bdf8' }} />
        <span>Cyclone Amphan : GLORYS12</span>
        <span style={{ color: '#9ca3af', fontSize: '11px', display: 'flex', alignItems: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </span>
      </button>

      {/* Top Left WMS Panel (Hover to reveal, click X to close) */}
      <div
        id="wms-panel"
        ref={sidebarRef}
        className="no-scrollbar"
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: show3DOverlay ? 25000 : 9999,
          background: 'rgba(30, 30, 30, 0.94)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          color: '#f3f4f6',
          width: '395px',
          maxHeight: 'calc(100vh - 36px)',
          overflowY: 'auto',
          boxShadow: '0 16px 36px rgba(0, 0, 0, 0.65)',
          fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: '12px',
          padding: '18px',
          transform: 'translateX(-425px)',
          opacity: 0,
          pointerEvents: isSidebarOpen ? 'auto' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 8px #38bdf8', display: 'inline-block' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.04em', textTransform: 'uppercase', color: '#f3f4f6' }}>
                Cyclone Amphan: GLORYS12
              </div>
              <div style={{ fontSize: '10px', color: '#9ca3af', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span title="Coordinates: 8–23°N, 82–92°E" style={{ cursor: 'default' }}>Bay of Bengal • Live ncWMS</span>
                <span
                  id="basemap-status-badge"
                  style={{
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontSize: '9.5px',
                    fontWeight: 500,
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: '#9ca3af',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  {basemapStatus === 'ion' ? '🛰️ Ion Basemap' : '🌍 Offline Basemap (NaturalEarthII)'}
                </span>
              </div>
            </div>
          </div>
          <div>
            <button
              id="collapse-sidebar-btn"
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '5px',
                color: '#9ca3af',
                fontSize: '13px',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                lineHeight: 1,
                transition: 'all 0.15s ease',
              }}
              title="Close Sidebar (✕)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Forecaster / Public Mode Toggle (Task 1: Ghost inactive, solid active) */}
        <div style={{ display: 'flex', gap: 4, background: '#242426', padding: '3px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.06)', marginBottom: 16 }}>
          <button
            id="mode-forecaster-btn"
            type="button"
            onClick={() => setUiMode('forecaster')}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: '11px',
              fontWeight: uiMode === 'forecaster' ? 600 : 400,
              cursor: 'pointer',
              borderRadius: '5px',
              border: uiMode === 'forecaster' ? '1px solid #38bdf8' : '1px solid transparent',
              background: uiMode === 'forecaster' ? '#0284c7' : 'transparent',
              color: uiMode === 'forecaster' ? '#fff' : '#9ca3af',
              boxShadow: uiMode === 'forecaster' ? '0 2px 8px rgba(2, 132, 199, 0.35)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            🔬 Forecaster Mode
          </button>
          <button
            id="mode-public-btn"
            type="button"
            onClick={() => setUiMode('public')}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: '11px',
              fontWeight: uiMode === 'public' ? 600 : 400,
              cursor: 'pointer',
              borderRadius: '5px',
              border: uiMode === 'public' ? '1px solid #38bdf8' : '1px solid transparent',
              background: uiMode === 'public' ? '#0284c7' : 'transparent',
              color: uiMode === 'public' ? '#fff' : '#9ca3af',
              boxShadow: uiMode === 'public' ? '0 2px 8px rgba(2, 132, 199, 0.35)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            🌐 Public Tour Mode
          </button>
        </div>

        {/* Guided Tour Launcher in Forecaster Mode */}
        {uiMode === 'forecaster' && !isTourActive && (
          <div style={{ marginBottom: 16 }}>
            <button
              id="launch-tour-btn-forecaster"
              type="button"
              onClick={handleStartTour}
              style={{
                width: '100%',
                padding: '7px 10px',
                fontSize: '11px',
                fontWeight: 500,
                cursor: 'pointer',
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '5px',
                color: '#e5e7eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
              }}
            >
              <span>▶ Launch Guided Tour (Story Beats)</span>
            </button>
          </div>
        )}

        {/* Prominent Guided Tour Banner in Public Mode */}
        {uiMode === 'public' && !isTourActive && (
          <div
            id="public-tour-banner"
            style={{
              marginBottom: 16,
              padding: '12px 14px',
              background: '#242426',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '6px',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '12px', color: '#f3f4f6', marginBottom: 4 }}>
              🎓 Public Outreach Story Tour
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af', lineHeight: 1.45, marginBottom: 10 }}>
              Explore Super Cyclone Amphan across 5 story beats: pre-storm warm pool, Category 5 peak, Sundarbans landfall, cold wake upwelling, and biological aftermath.
            </div>
            <button
              id="launch-tour-btn-public"
              type="button"
              onClick={handleStartTour}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontWeight: 500,
                fontSize: '11.5px',
                cursor: 'pointer',
                background: 'transparent',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '5px',
                boxShadow: 'none',
                transition: 'all 0.15s ease',
              }}
            >
              🌟 Start Guided Story Tour
            </button>
          </div>
        )}

        {loadingCapabilities ? (
          <div style={{ padding: '12px 0', color: '#9ca3af', fontSize: '12px' }}>
            ⏳ Loading available depth levels & time steps from TDS...
          </div>
        ) : (
          <>
            {/* Task 1: Ocean Variable Selector */}
            <div style={{ marginBottom: 16, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: '#9ca3af', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  {uiMode === 'public' ? 'OCEAN PARAMETER' : 'VARIABLE'}
                </span>
                <span id="active-variable-label" style={{ display: 'none' }}>
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
                        padding: '7px 8px',
                        fontSize: '11px',
                        fontWeight: isSelected ? 600 : 400,
                        cursor: 'pointer',
                        background: isSelected ? '#0284c7' : 'transparent',
                        color: isSelected ? '#ffffff' : '#9ca3af',
                        border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '5px',
                        textAlign: 'center',
                        boxShadow: isSelected ? '0 2px 8px rgba(2, 132, 199, 0.35)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {v === 'temperature' && (uiMode === 'public' ? '🌡️ Sea Surface Temp' : '🌡️ Temperature')}
                      {v === 'salinity' && (uiMode === 'public' ? '🧂 Ocean Salinity' : '🧂 Salinity')}
                      {v === 'current_u' && (uiMode === 'public' ? '➡️ East-West Currents' : '➡️ Current U (East)')}
                      {v === 'current_v' && (uiMode === 'public' ? '⬆️ North-South Currents' : '⬆️ Current V (North)')}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Depth Control Slider */}
            <div style={{ marginBottom: 16, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ color: '#9ca3af', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>DEPTH</span>
                <span id="current-depth-label" style={{ display: 'none' }}>
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
                style={{ width: '100%', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#6b7280', marginTop: 3 }}>
                <span>Surface ({depthLevels[0]?.depthMeters.toFixed(1)}m)</span>
                <span>Deep ({depthLevels[depthLevels.length - 1]?.depthMeters.toFixed(1)}m)</span>
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setDepthIndex(0)}
                  style={{
                    flex: 1,
                    padding: '5px 6px',
                    fontSize: '10.5px',
                    fontWeight: depthIndex === 0 ? 600 : 400,
                    cursor: 'pointer',
                    background: depthIndex === 0 ? '#0284c7' : 'transparent',
                    color: depthIndex === 0 ? '#fff' : '#9ca3af',
                    border: depthIndex === 0 ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '5px',
                    transition: 'all 0.15s ease',
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
                    padding: '5px 6px',
                    fontSize: '10.5px',
                    fontWeight: depthLevels[depthIndex]?.depthMeters >= 90 && depthLevels[depthIndex]?.depthMeters < 150 ? 600 : 400,
                    cursor: 'pointer',
                    background: depthLevels[depthIndex]?.depthMeters >= 90 && depthLevels[depthIndex]?.depthMeters < 150 ? '#0284c7' : 'transparent',
                    color: depthLevels[depthIndex]?.depthMeters >= 90 && depthLevels[depthIndex]?.depthMeters < 150 ? '#fff' : '#9ca3af',
                    border: depthLevels[depthIndex]?.depthMeters >= 90 && depthLevels[depthIndex]?.depthMeters < 150 ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '5px',
                    transition: 'all 0.15s ease',
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
                    padding: '5px 6px',
                    fontSize: '10.5px',
                    fontWeight: depthLevels[depthIndex]?.depthMeters >= 400 && depthLevels[depthIndex]?.depthMeters < 600 ? 600 : 400,
                    cursor: 'pointer',
                    background: depthLevels[depthIndex]?.depthMeters >= 400 && depthLevels[depthIndex]?.depthMeters < 600 ? '#0284c7' : 'transparent',
                    color: depthLevels[depthIndex]?.depthMeters >= 400 && depthLevels[depthIndex]?.depthMeters < 600 ? '#fff' : '#9ca3af',
                    border: depthLevels[depthIndex]?.depthMeters >= 400 && depthLevels[depthIndex]?.depthMeters < 600 ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '5px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Deep (454m)
                </button>
              </div>
            </div>

            {/* Time Control Scrubber & Animation */}
            <div style={{ marginBottom: 16, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ color: '#9ca3af', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>TIME</span>
                <span id="current-time-label" style={{ fontWeight: 500, color: '#e5e7eb', fontFamily: 'monospace', fontSize: '11px' }}>
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
                style={{ width: '100%', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#6b7280', marginTop: 3 }}>
                <span>{timeSteps[0]?.substring(0, 10)}</span>
                <span>{timeSteps[timeSteps.length - 1]?.substring(0, 10)}</span>
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: 8, alignItems: 'center' }}>
                <button
                  id="play-button"
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  style={{
                    flex: 2,
                    padding: '6px 8px',
                    fontWeight: 500,
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    background: isPlaying ? '#28282b' : 'transparent',
                    border: isPlaying ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '5px',
                    color: isPlaying ? '#f87171' : '#e5e7eb',
                    boxShadow: 'none',
                    transition: 'all 0.15s ease',
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
                    padding: '6px 6px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '5px',
                    color: '#d1d5db',
                    transition: 'all 0.15s ease',
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
                    padding: '6px 6px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '5px',
                    color: '#d1d5db',
                    transition: 'all 0.15s ease',
                  }}
                  title="Next Day"
                >
                  Next ⏭
                </button>
              </div>
            </div>

            {/* Task 2: Colorbar Editor & Scale Controls */}
            <div style={{ marginBottom: 16, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, color: '#9ca3af' }}>
                {uiMode === 'forecaster' ? 'COLORBAR & SCALE CONTROLS' : 'COLORBAR SCALE'}
              </div>

              {uiMode === 'forecaster' && (
                <div id="forecaster-colorbar-controls">
                  {/* Palette selector */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label htmlFor="palette-select" style={{ fontSize: '11px', color: '#9ca3af' }}>Palette:</label>
                    <select
                      id="palette-select"
                      value={palette}
                      onChange={(e) => setPalette(e.target.value)}
                      style={{
                        fontSize: '11px',
                        padding: '4px 8px',
                        borderRadius: '5px',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        background: '#242426',
                        color: '#f3f4f6',
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
                      <label htmlFor="range-min-input" style={{ fontSize: '10px', color: '#9ca3af', display: 'block', marginBottom: 3 }}>
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
                          background: '#1e1e1e',
                          color: '#f3f4f6',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: '5px',
                          fontFamily: 'monospace',
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label htmlFor="range-max-input" style={{ fontSize: '10px', color: '#9ca3af', display: 'block', marginBottom: 3 }}>
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
                          background: '#1e1e1e',
                          color: '#f3f4f6',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: '5px',
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
                          background: 'transparent',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: '5px',
                          color: '#9ca3af',
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
                </div>
              )}

              {/* Dynamic WMS Legend Graphic with consistent decimal labels */}
              <div style={{ marginTop: 8, background: '#242426', padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <span id="legend-range-label" style={{ display: 'none' }}>
                  {effectiveMin.toFixed(1)} to {effectiveMax.toFixed(1)} {unit}
                </span>
                <div style={{ marginBottom: 6 }}>
                  <img
                    id="wms-legend-img"
                    key={`${activeVariable}-${palette}-${effectiveMin}-${effectiveMax}-${activeLogScale}`}
                    src={`/thredds/wms/amphan_bob_real/${activeVariable}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&LAYERS=${activeVariable}&STYLES=${palette === 'default' ? '' : `default-scalar/${palette}`}&COLORSCALERANGE=${effectiveMin},${effectiveMax}${activeLogScale ? '&LOGSCALE=true' : ''}`}
                    alt="WMS Colorbar Legend"
                    style={{ width: '100%', height: '16px', display: 'block', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#9ca3af', fontFamily: 'monospace' }}>
                  <span id="legend-min-display">{effectiveMin.toFixed(1)} {unit}</span>
                  <span id="legend-mid-display">{((effectiveMin + effectiveMax) / 2).toFixed(1)} {unit}</span>
                  <span id="legend-max-display">{effectiveMax.toFixed(1)} {unit}</span>
                </div>
              </div>
            </div>

            {/* Task 3: Layer Opacity Control */}
            <div style={{ marginBottom: 16, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ color: '#9ca3af', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>LAYER OPACITY</span>
                <span id="opacity-label" style={{ fontWeight: 500, color: '#e5e7eb', fontFamily: 'monospace', fontSize: '11px' }}>
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
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>

            {/* Task 4: Vertical Exaggeration Control */}
            <div style={{ marginBottom: 16, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#9ca3af', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>VERTICAL EXAGGERATION</span>
                  <span
                    title="Exaggerates 3D seafloor bathymetry and coastal relief across the Bay of Bengal basin."
                    style={{
                      cursor: 'help',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 13,
                      height: 13,
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: '#9ca3af',
                      fontSize: '9.5px',
                      fontWeight: 600,
                      userSelect: 'none',
                    }}
                  >
                    ℹ
                  </span>
                </div>
                <span id="vertical-exaggeration-label" style={{ fontWeight: 500, color: '#e5e7eb', fontFamily: 'monospace', fontSize: '11px' }}>
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
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>

            {/* Stage 6b: Drill into 3D Volumetric View (Task 3: Subdued secondary button when active) */}
            <div style={{ paddingTop: 4 }}>
              <button
                id="drill-3d-button"
                type="button"
                onClick={() => setShow3DOverlay(!show3DOverlay)}
                disabled={!currentTime}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  fontWeight: 500,
                  fontSize: '12px',
                  cursor: currentTime ? 'pointer' : 'not-allowed',
                  background: show3DOverlay ? '#28282b' : 'transparent',
                  color: show3DOverlay ? '#e5e7eb' : '#ffffff',
                  border: show3DOverlay ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(255, 255, 255, 0.18)',
                  borderRadius: '5px',
                  boxShadow: 'none',
                  letterSpacing: '0.02em',
                  opacity: currentTime ? 1 : 0.5,
                  transition: 'all 0.15s ease',
                }}
              >
                {show3DOverlay ? '✕ Close 3D Volumetric View' : '🌊 Drill into 3D Volumetric View'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Profile Popup (Task 4: Frosted Glassmorphic Dark Layout with External Legend) */}
      {(selectedProfile || loadingProfile) && (
        <div
          id="profile-popup"
          className="no-scrollbar"
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            zIndex: 9999,
            background: 'rgba(30, 30, 30, 0.94)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            padding: '16px 18px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            color: '#f3f4f6',
            width: '400px',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.65)',
            maxHeight: '620px',
            overflowY: 'auto',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          }}
        >
          {loadingProfile ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#38bdf8', fontSize: '12px' }}>
              ⏳ Loading profile data from /api/instrument/...
            </div>
          ) : selectedProfile ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: '#f3f4f6' }}>
                    {selectedProfile.instrument_type.toUpperCase()} • {selectedProfile.instrument_id}
                  </h3>
                  <div style={{ fontSize: '10.5px', color: '#9ca3af', marginTop: 2 }}>
                    {selectedProfile.time.substring(0, 10)} | {selectedProfile.lat.toFixed(4)}°N, {selectedProfile.lon.toFixed(4)}°E
                  </div>
                </div>
                <button
                  id="profile-close-btn"
                  type="button"
                  onClick={() => setSelectedProfile(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#9ca3af',
                    fontSize: '14px',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    lineHeight: 1,
                  }}
                  title="Close Profile Popup"
                >
                  ✕
                </button>
              </div>

              {/* Task 4: Clean horizontal legend row above the chart */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px 14px',
                  alignItems: 'center',
                  marginBottom: 8,
                  fontSize: '10.5px',
                  padding: '6px 10px',
                  background: '#242426',
                  borderRadius: '5px',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 3, background: '#f87171', borderRadius: 1 }} />
                  <span style={{ color: '#f87171', fontWeight: 600 }}>Temp (°C)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 3, background: '#38bdf8', borderRadius: 1 }} />
                  <span style={{ color: '#38bdf8', fontWeight: 600 }}>Salinity (PSU)</span>
                </div>
                {selectedProfile.data.some((d) => d.chlorophyll !== undefined) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 10, height: 3, background: '#4ade80', borderRadius: 1 }} />
                    <span style={{ color: '#4ade80', fontWeight: 600 }}>Chl-a (mg/m³)</span>
                  </div>
                )}
                {selectedProfile.data.some((d) => d.current_u !== undefined) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 10, height: 3, background: '#fb923c', borderRadius: 1 }} />
                    <span style={{ color: '#fb923c', fontWeight: 600 }}>Current U (m/s)</span>
                  </div>
                )}
                {selectedProfile.data.some((d) => d.current_v !== undefined) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 10, height: 3, background: '#c084fc', borderRadius: 1 }} />
                    <span style={{ color: '#c084fc', fontWeight: 600 }}>Current V (m/s)</span>
                  </div>
                )}
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
                  {
                    x: selectedProfile.data.filter((d) => d.current_u !== undefined).map((d) => d.current_u!),
                    y: selectedProfile.data.filter((d) => d.current_u !== undefined).map((d) => d.depth),
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Current U (m/s)',
                    line: { color: '#fb923c', width: 2 },
                    marker: { size: 5, color: '#fb923c' },
                  },
                  {
                    x: selectedProfile.data.filter((d) => d.current_v !== undefined).map((d) => d.current_v!),
                    y: selectedProfile.data.filter((d) => d.current_v !== undefined).map((d) => d.depth),
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Current V (m/s)',
                    line: { color: '#c084fc', width: 2 },
                    marker: { size: 5, color: '#c084fc' },
                  },
                ].filter((trace) => trace.x.length > 0)}
                layout={{
                  width: 360,
                  height: 350,
                  margin: { l: 55, r: 25, t: 35, b: 35 },
                  paper_bgcolor: 'rgba(0, 0, 0, 0)',
                  plot_bgcolor: 'rgba(24, 24, 27, 0.7)',
                  font: { color: '#cbd5e1', family: 'Inter, system-ui, sans-serif', size: 10 },
                  yaxis: {
                    title: { text: 'Depth', font: { color: '#9ca3af', size: 10.5 } },
                    autorange: 'reversed',
                    color: '#9ca3af',
                    ticksuffix: ' m',
                    tickfont: { color: '#9ca3af', size: 9 },
                    showgrid: true,
                    gridcolor: 'rgba(255, 255, 255, 0.08)',
                    griddash: 'dash',
                    zeroline: false,
                  },
                  xaxis: {
                    title: { text: 'Temp (°C)', font: { color: '#f87171', size: 10 } },
                    side: 'bottom',
                    color: '#f87171',
                    tickfont: { color: '#f87171', size: 9 },
                    tickcolor: '#f87171',
                    showgrid: false,
                  },
                  xaxis2: {
                    title: { text: 'Salinity (PSU)', font: { color: '#38bdf8', size: 10 } },
                    side: 'top',
                    overlaying: 'x',
                    color: '#38bdf8',
                    tickfont: { color: '#38bdf8', size: 9 },
                    tickcolor: '#38bdf8',
                    showgrid: false,
                  },
                  xaxis3: {
                    title: { text: 'Chl-a', font: { color: '#4ade80', size: 10 } },
                    side: 'top',
                    overlaying: 'x',
                    color: '#4ade80',
                    tickfont: { color: '#4ade80', size: 9 },
                    tickcolor: '#4ade80',
                    showgrid: false,
                    position: 0.88,
                  },
                  showlegend: false,
                }}
                config={{ displayModeBar: false, responsive: true }}
              />
            </div>
          ) : null}
        </div>
      )}

      {/* In-Situ Instruments Legend (Relocated to top-right corner, compact footprint) */}
      {!show3DOverlay && (
        <div
          id="instruments-legend"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 9990,
            background: 'rgba(30, 30, 30, 0.94)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            padding: '7px 10px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '6px',
            color: '#f3f4f6',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            fontSize: '10px',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af', marginBottom: 4 }}>
            Instruments
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ color: '#fbbf24', fontSize: '9px', lineHeight: 1 }}>●</span>
              <span style={{ color: '#d1d5db', fontSize: '10px' }}>Argo Float</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ color: '#06b6d4', fontSize: '9px', lineHeight: 1 }}>●</span>
              <span style={{ color: '#d1d5db', fontSize: '10px' }}>Glider</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ color: '#f43f5e', fontSize: '9px', lineHeight: 1 }}>●</span>
              <span style={{ color: '#d1d5db', fontSize: '10px' }}>Moored Buoy</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ color: '#a855f7', fontSize: '9px', lineHeight: 1 }}>●</span>
              <span style={{ color: '#d1d5db', fontSize: '10px' }}>ADCP</span>
            </div>
          </div>
        </div>
      )}

      {/* Stage 9: Guided Tour Panel */}
      {isTourActive && (
        <GuidedTourPanel
          currentBeat={TOUR_BEATS[currentBeatIndex]}
          beatIndex={currentBeatIndex}
          totalBeats={TOUR_BEATS.length}
          isPlaying={tourPlaying}
          isFlying={isCameraFlying}
          dwellRemainingSec={dwellRemainingSec}
          onTogglePlay={() => setTourPlaying(!tourPlaying)}
          onNext={() => {
            const next = Math.min(TOUR_BEATS.length - 1, currentBeatIndex + 1);
            activateTourBeat(next);
          }}
          onPrev={() => {
            const prev = Math.max(0, currentBeatIndex - 1);
            activateTourBeat(prev);
          }}
          onSelectBeat={(idx) => activateTourBeat(idx)}
          onExit={handleExitTour}
          onCallToAction={handleTourCallToAction}
        />
      )}

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
