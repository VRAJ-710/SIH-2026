import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import Plot from 'react-plotly.js';

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

  // Initialize Cesium Viewer
  useEffect(() => {
    if (!containerRef.current) return;

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayer: Cesium.ImageryLayer.fromProviderAsync(
        Cesium.TileMapServiceImageryProvider.fromUrl(
          Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'),
        ),
      ),
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

    viewer.camera.flyTo({
      destination: AMPHAN_RECTANGLE,
      duration: 1.5,
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

  // Calculate current depth & dynamic color scale range
  const currentDepth = depthLevels[depthIndex];
  const currentTime = timeSteps[timeIndex];

  let colorScaleRange = '24,32';
  let legendMin = '24°C';
  let legendMid = '28°C';
  let legendMax = '32°C';
  if (currentDepth) {
    if (currentDepth.depthMeters >= 200) {
      colorScaleRange = '1,15';
      legendMin = '1°C';
      legendMid = '8°C';
      legendMax = '15°C';
    } else if (currentDepth.depthMeters >= 50) {
      colorScaleRange = '15,28';
      legendMin = '15°C';
      legendMid = '21.5°C';
      legendMax = '28°C';
    } else {
      colorScaleRange = '24,32';
      legendMin = '24°C';
      legendMid = '28°C';
      legendMax = '32°C';
    }
  }

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

    const provider = new Cesium.WebMapServiceImageryProvider({
      url: TDS_WMS_URL,
      layers: 'temperature',
      crs: 'CRS:84',
      enablePickFeatures: false,
      parameters: {
        service: 'WMS',
        version: '1.3.0',
        request: 'GetMap',
        styles: '',
        format: 'image/png',
        transparent: true,
        TIME: currentTime,
        ELEVATION: currentDepth.valueStr,
        COLORSCALERANGE: colorScaleRange,
      },
      rectangle: AMPHAN_RECTANGLE,
      tilingScheme: new Cesium.GeographicTilingScheme(),
    });

    layerRef.current = viewer.imageryLayers.addImageryProvider(provider);

    // Sync Cesium Clock with timeline
    try {
      viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(currentTime);
    } catch {
      // fallback
    }
  }, [currentDepth, currentTime, colorScaleRange, viewerReady, depthLevels.length, timeSteps.length]);

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

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Top Left WMS Panel (Stage 5 Real GLORYS12 Data) */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 9999,
          background: 'rgba(255, 255, 255, 0.96)',
          padding: '14px',
          border: '2px solid #222',
          borderRadius: '4px',
          color: '#000',
          width: '380px',
          boxShadow: '0 4px 10px rgba(0, 0, 0, 0.25)',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: '13px',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: 10, borderBottom: '1px solid #ddd', paddingBottom: 6 }}>
          Cyclone Amphan: GLORYS12 Real Ocean Data
        </div>

        {loadingCapabilities ? (
          <div style={{ padding: '8px 0', color: '#555' }}>
            Loading available depth levels & time steps from TDS...
          </div>
        ) : (
          <>
            {/* Task 2: Depth Control Slider */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <strong>Depth (ELEVATION):</strong>
                <span id="current-depth-label" style={{ fontWeight: 600, color: '#0055aa' }}>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666', marginTop: 2 }}>
                <span>Surface ({depthLevels[0]?.depthMeters.toFixed(1)}m)</span>
                <span>Deep ({depthLevels[depthLevels.length - 1]?.depthMeters.toFixed(1)}m)</span>
              </div>
              <div style={{ display: 'flex', gap: '4px', marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setDepthIndex(0)}
                  style={{ flex: 1, padding: '2px 4px', fontSize: '11px', fontWeight: depthIndex === 0 ? 700 : 400, cursor: 'pointer' }}
                >
                  Surface (0.5m)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const idx = depthLevels.findIndex((d) => d.depthMeters >= 90);
                    if (idx >= 0) setDepthIndex(idx);
                  }}
                  style={{ flex: 1, padding: '2px 4px', fontSize: '11px', fontWeight: depthLevels[depthIndex]?.depthMeters >= 90 && depthLevels[depthIndex]?.depthMeters < 150 ? 700 : 400, cursor: 'pointer' }}
                >
                  Thermocline (92m)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const idx = depthLevels.findIndex((d) => d.depthMeters >= 450);
                    if (idx >= 0) setDepthIndex(idx);
                  }}
                  style={{ flex: 1, padding: '2px 4px', fontSize: '11px', fontWeight: depthLevels[depthIndex]?.depthMeters >= 400 && depthLevels[depthIndex]?.depthMeters < 600 ? 700 : 400, cursor: 'pointer' }}
                >
                  Deep (454m)
                </button>
              </div>
            </div>

            {/* Task 3: Time Control Scrubber & Animation */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <strong>Time (TIME):</strong>
                <span id="current-time-label" style={{ fontWeight: 600, color: '#aa2200' }}>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666', marginTop: 2 }}>
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
                    padding: '4px 8px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: isPlaying ? '#ffeedd' : '#eef8ff',
                    border: '1px solid #888',
                    borderRadius: '3px',
                  }}
                >
                  {isPlaying ? '⏸ Pause Animation' : '▶ Play Animation'}
                </button>
                <button
                  id="prev-time-btn"
                  type="button"
                  onClick={() => setTimeIndex((prev) => (prev > 0 ? prev - 1 : timeSteps.length - 1))}
                  style={{ flex: 1, padding: '4px 6px', cursor: 'pointer' }}
                  title="Previous Day"
                >
                  ⏮ Prev
                </button>
                <button
                  id="next-time-btn"
                  type="button"
                  onClick={() => setTimeIndex((prev) => (prev < timeSteps.length - 1 ? prev + 1 : 0))}
                  style={{ flex: 1, padding: '4px 6px', cursor: 'pointer' }}
                  title="Next Day"
                >
                  Next ⏭
                </button>
              </div>
            </div>

            {/* Task 4: Temperature Color Scale Reference */}
            <div style={{ borderTop: '1px solid #eee', paddingTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: '12px' }}>Temperature Scale (ncWMS):</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#333' }}>
                  {legendMin} to {legendMax}
                </span>
              </div>
              <div
                style={{
                  height: '14px',
                  width: '100%',
                  borderRadius: '3px',
                  background: 'linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000)',
                  boxShadow: 'inset 0 0 2px rgba(0,0,0,0.4)',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#555', marginTop: 2 }}>
                <span>{legendMin}</span>
                <span>{legendMid}</span>
                <span>{legendMax}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Profile Popup */}
      {(selectedProfile || loadingProfile) && (
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            zIndex: 9999,
            background: 'white',
            padding: '16px',
            border: '2px solid #333',
            width: '400px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            maxHeight: '600px',
            overflowY: 'auto'
          }}
        >
          {loadingProfile ? (
            <div>Loading profile...</div>
          ) : selectedProfile ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>
                  {selectedProfile.instrument_type.toUpperCase()} - {selectedProfile.instrument_id}
                </h3>
                <button onClick={() => setSelectedProfile(null)}>X</button>
              </div>
              <div style={{ fontSize: '12px', marginBottom: 16 }}>
                Time: {selectedProfile.time}<br/>
                Location: {selectedProfile.lat.toFixed(4)}°N, {selectedProfile.lon.toFixed(4)}°E
              </div>
              
              <Plot
                data={[
                  {
                    x: selectedProfile.data.filter(d => d.temperature !== undefined).map(d => d.temperature!),
                    y: selectedProfile.data.filter(d => d.temperature !== undefined).map(d => d.depth),
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Temp (°C)',
                    line: { color: 'red' },
                  },
                  {
                    x: selectedProfile.data.filter(d => d.salinity !== undefined).map(d => d.salinity!),
                    y: selectedProfile.data.filter(d => d.salinity !== undefined).map(d => d.depth),
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Salinity (PSU)',
                    line: { color: 'blue' },
                    xaxis: 'x2', // Use a secondary x-axis for salinity since its scale differs
                  },
                  {
                    x: selectedProfile.data.filter(d => d.chlorophyll !== undefined).map(d => d.chlorophyll!),
                    y: selectedProfile.data.filter(d => d.chlorophyll !== undefined).map(d => d.depth),
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Chl-a (mg/m³)',
                    line: { color: 'green' },
                    xaxis: 'x3', // Use a tertiary x-axis for chlorophyll
                  }
                ].filter(trace => trace.x.length > 0)}
                layout={{
                  width: 360,
                  height: 400,
                  margin: { l: 50, r: 20, t: 30, b: 40 },
                  yaxis: { title: 'Depth (m)', autorange: 'reversed' },
                  xaxis: { title: 'Temperature', side: 'bottom', showgrid: false },
                  xaxis2: { title: 'Salinity', side: 'top', overlaying: 'x', showgrid: false },
                  xaxis3: { title: 'Chlorophyll', side: 'top', overlaying: 'x', showgrid: false, position: 0.85 },
                  showlegend: true,
                  legend: { orientation: 'h', y: -0.2 }
                }}
                config={{ displayModeBar: false }}
              />
            </div>
          ) : null}
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: 20,
          zIndex: 9999,
          background: 'rgba(255, 255, 255, 0.95)',
          padding: '12px',
          border: '2px solid #333',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Instruments</div>
        <div><span style={{ color: 'yellow', textShadow: '0 0 2px black' }}>●</span> Argo</div>
        <div><span style={{ color: 'cyan', textShadow: '0 0 2px black' }}>●</span> Glider</div>
        <div><span style={{ color: 'red', textShadow: '0 0 2px black' }}>●</span> Buoy</div>
      </div>

      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
