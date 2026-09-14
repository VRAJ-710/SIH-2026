import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

const DEPTH_LEVELS = ['0.0', '10.0', '25.0', '50.0'];
const TIME_STEPS = [
  '2020-05-17T00:00:00Z',
  '2020-05-18T00:00:00Z',
  '2020-05-19T00:00:00Z',
];

const AMPHAN_RECTANGLE = Cesium.Rectangle.fromDegrees(82.0, 8.0, 92.0, 23.0);
const TDS_WMS_URL = 'http://localhost:8080/thredds/wms/amphan_bob/temperature';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const layerRef = useRef<Cesium.ImageryLayer | null>(null);
  const [viewerReady, setViewerReady] = useState(false);

  const [selectedDepth, setSelectedDepth] = useState<string>(DEPTH_LEVELS[0]);
  const [selectedTime, setSelectedTime] = useState<string>(TIME_STEPS[0]);

  useEffect(() => {
    if (!containerRef.current) return;

    const viewer = new Cesium.Viewer(containerRef.current, {
      // Bundled Natural Earth tiles: no Cesium ion token, works offline.
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

    viewerRef.current = viewer;
    setViewerReady(true);

    return () => {
      setViewerReady(false);
      layerRef.current = null;
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

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
    console.log(
      `[Cesium Spike] WMS layer TIME=${selectedTime} ELEVATION=${selectedDepth}`,
    );
  }, [selectedDepth, selectedTime, viewerReady]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
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
          {DEPTH_LEVELS.map((d) => (
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
          {TIME_STEPS.map((t) => (
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

      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
