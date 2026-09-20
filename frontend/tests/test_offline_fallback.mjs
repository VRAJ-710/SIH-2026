import { chromium } from 'playwright';

async function testOfflineFallback() {
  console.log('=== TEST 1: COLD START IN COMPLETELY OFFLINE / BLOCKED STATE ===');
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']
  });

  // Create context where all external non-localhost requests are blocked / aborted
  const context = await browser.newContext();
  const page = await context.newPage();

  let blockedCount = 0;
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      blockedCount++;
      // Abort external network request to simulate offline / no Wi-Fi
      route.abort('internetdisconnected');
    } else {
      route.continue();
    }
  });

  page.on('response', (res) => {
    if (res.status() >= 400) {
      console.log(`[HTTP ${res.status()}] ${res.request().method()} ${res.url()}`);
    }
  });

  const consoleMessages = [];
  page.on('console', (msg) => {
    const text = msg.text();
    consoleMessages.push({ type: msg.type(), text });
    if (text.includes('[Cesium]') || msg.type() === 'error' || msg.type() === 'warn') {
      console.log(`[BROWSER ${msg.type().toUpperCase()}] ${text}`);
    }
  });

  console.log('Navigating to http://localhost:5173/ with all external traffic blocked...');
  const startTime = Date.now();
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });

  // Wait for the WMS panel and viewer to mount
  await page.waitForSelector('#wms-panel', { timeout: 12000 });
  await page.waitForTimeout(4000);

  const loadDuration = (Date.now() - startTime) / 1000;
  console.log(`Page reached ready state in ${loadDuration.toFixed(1)}s (Blocked external calls: ${blockedCount})`);

  // Verify basemap status badge
  const badgeText = await page.textContent('#basemap-status-badge');
  console.log(`Basemap status badge: "${badgeText.trim()}"`);

  // Inspect Cesium Viewer internal state directly via window.cesiumViewer
  const viewerDiagnostics = await page.evaluate(() => {
    const v = window.cesiumViewer;
    const Cesium = window.Cesium;
    if (!v) return { error: 'cesiumViewer not found' };

    const layers = v.imageryLayers;
    const baseLayer = layers.get(0);
    const provider = baseLayer ? baseLayer.imageryProvider : null;
    const providerName = provider ? provider.constructor.name : 'none';
    const isTileMapService = provider instanceof Cesium.TileMapServiceImageryProvider;

    const terrain = v.scene.terrainProvider;
    const terrainName = terrain ? terrain.constructor.name : 'none';
    const isEllipsoid = terrain instanceof Cesium.EllipsoidTerrainProvider;

    return {
      layerCount: layers.length,
      providerName,
      isTileMapService,
      terrainName,
      isEllipsoid,
      canvasWidth: v.scene.canvas.width,
      canvasHeight: v.scene.canvas.height,
    };
  });

  console.log('Cesium Viewer diagnostics:', JSON.stringify(viewerDiagnostics, null, 2));

  if (!viewerDiagnostics.isTileMapService) {
    throw new Error(`Expected TileMapServiceImageryProvider for offline fallback, got ${viewerDiagnostics.providerName}`);
  }
  if (!viewerDiagnostics.isEllipsoid) {
    throw new Error(`Expected EllipsoidTerrainProvider for offline fallback, got ${viewerDiagnostics.terrainName}`);
  }
  console.log('✓ VERIFIED: NaturalEarthII and EllipsoidTerrainProvider successfully active in offline state!');

  // Now test that the app works normally in offline fallback:
  console.log('\nTesting feature interactions in offline mode:');

  // 1. Variable switching
  console.log('1. Testing variable switching (salinity, current_u, current_v, temperature)...');
  for (const v of ['salinity', 'current_u', 'current_v', 'temperature']) {
    await page.click(`#var-btn-${v}`);
    await page.waitForTimeout(500);
  }
  console.log('✓ Variable switching functional');

  // 2. Instrument profile
  console.log('2. Testing instrument profile popup...');
  await page.evaluate(() => window.fetchProfile('2901892'));
  await page.waitForSelector('#profile-popup', { timeout: 5000 });
  const popupText = await page.textContent('#profile-popup');
  console.log(`✓ Profile popup loaded successfully (contains: "${popupText.substring(0, 40)}...")`);

  // 3. Drill into 3D
  console.log('3. Testing 3D Volumetric Modal...');
  await page.click('#drill-3d-button');
  await page.waitForSelector('#volume-info-panel', { timeout: 8000 });
  await page.click('#render-mode-isosurface');
  await page.waitForTimeout(1000);
  await page.click('#render-mode-raymarch');
  await page.waitForTimeout(1000);
  await page.click('#close-3d-btn');
  console.log('✓ 3D Volumetric Modal functional in offline mode');

  // 4. Guided Tour
  console.log('4. Testing Guided Tour...');
  await page.click('#launch-tour-btn-forecaster');
  await page.waitForSelector('#guided-tour-panel', { timeout: 5000 });
  await page.click('#tour-next-btn');
  await page.waitForTimeout(1000);
  await page.click('#tour-prev-btn');
  await page.waitForTimeout(1000);
  await page.click('#exit-tour-btn');
  console.log('✓ Guided Tour functional in offline mode');

  // 5. Mode toggle
  console.log('5. Testing mode toggle...');
  await page.click('#mode-public-btn');
  await page.waitForTimeout(500);
  await page.click('#mode-forecaster-btn');
  console.log('✓ Mode toggle functional in offline mode');

  await browser.close();
  console.log('\n=== ALL OFFLINE FALLBACK TESTS PASSED CLEANLY! ===');
}

testOfflineFallback().catch((err) => {
  console.error('Offline test failed:', err);
  process.exit(1);
});
