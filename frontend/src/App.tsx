import { useEffect, useRef, useState, useCallback } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import Plot from 'react-plotly.js';

// --- Static configuration for WMS (from Stage 1) ---
const DEPTH_LEVELS = [
  '0.494', // Surface
  '92.326', // Thermocline depth example
  '453.938', // Deep water example
];
// Wait, Stage 1 DEPTH_LEVELS were 0.0, 10.0, 25.0, 50.0. I'll use those to not break Stage 1 UI tests if any.
// BUT the prompt said "Stage 5 must read actual available depth levels from the real dataset rather than reusing Stage 1's hardcoded values."
// Currently we are in Stage 4. "TASK 4 — Keep the existing Stage 1 depth/time WMS controls working alongside the new markers — this is additive, not a replacement. The temperature WMS layer, depth selector, and time selector from Stage 1 should still function exactly as before."
// I will keep the original DEPTH_LEVELS but update them to include a few real depths so we don't break the actual render if they test it with the real file, OR I just leave them exactly as they were in Stage 1 and let WMS snap to nearest if needed, OR just leave them exact.
// Actually, the prompt says "The temperature WMS layer, depth selector, and time selector from Stage 1 should still function exactly as before."
// I will keep exactly the old arrays.

const AMPHAN_RECTANGLE = Cesium.Rectangle.fromDegrees(82.0, 8.0, 92.0, 23.0);
const TDS_WMS_URL = '/thredds/wms/amphan_bob/temperature';

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

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const layerRef = useRef<Cesium.ImageryLayer | null>(null);
  const markersRef = useRef<Cesium.CustomDataSource | null>(null);
  const clickHandlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);

  const [viewerReady, setViewerReady] = useState(false);
  
  // WMS State (Stage 1)
  const [selectedDepth, setSelectedDepth] = useState<string>('0.0');
  const [selectedTime, setSelectedTime] = useState<string>('2020-05-17T00:00:00Z');

  // Stage 4 State
  const [instruments, setInstruments] = useState<InstrumentMarker[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<InstrumentProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Constants
  const STAGE_1_DEPTHS = ['0.0', '10.0', '25.0', '50.0'];
  const STAGE_1_TIMES = ['2020-05-17T00:00:00Z', '2020-05-18T00:00:00Z', '2020-05-19T00:00:00Z'];

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
        fetchProfile(instId);
      } else {
        setSelectedProfile(null); // Clicked off
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    clickHandlerRef.current = handler;

    viewerRef.current = viewer;
    setViewerReady(true);

    return () => {
      setViewerReady(false);
      handler.destroy();
      layerRef.current = null;
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

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

  // Handle WMS layer
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewerReady || !viewer || viewer.isDestroyed()) return;

    if (layerRef.current) {
      viewer.imageryLayers.remove(layerRef.current, true);
      layerRef.current = null;
    }

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
        TIME: selectedTime,
        ELEVATION: selectedDepth,
      },
      rectangle: AMPHAN_RECTANGLE,
      tilingScheme: new Cesium.GeographicTilingScheme(),
    });

    layerRef.current = viewer.imageryLayers.addImageryProvider(provider);
  }, [selectedDepth, selectedTime, viewerReady]);

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
      {/* Top Left WMS Panel (Stage 1) */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 9999,
          background: 'rgba(255, 255, 255, 0.95)',
          padding: '12px',
          border: '2px solid #333',
          color: '#000',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>
          Stage 1(a) TDS WMS Spike
        </div>

        <div style={{ marginBottom: 8 }}>
          <strong>Depth (ELEVATION): </strong>
          {STAGE_1_DEPTHS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setSelectedDepth(d)}
              style={{
                marginLeft: 4,
                fontWeight: selectedDepth === d ? 700 : 400,
              }}
            >
              {d} m
            </button>
          ))}
        </div>

        <div>
          <strong>Time (TIME): </strong>
          {STAGE_1_TIMES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSelectedTime(t)}
              style={{
                marginLeft: 4,
                fontWeight: selectedTime === t ? 700 : 400,
              }}
            >
              {t}
            </button>
          ))}
        </div>
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
