import { chromium } from 'playwright';

async function testRuntimeRecovery() {
  console.log('=== TEST 2: RUNTIME NETWORK LOSS & AUTOMATIC RECOVERY ===');
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[Cesium]') || msg.type() === 'error' || msg.type() === 'warn') {
      console.log(`[BROWSER ${msg.type().toUpperCase()}] ${text}`);
    }
  });

  console.log('1. Loading app online with Cesium Ion...');
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#wms-panel', { timeout: 10000 });
  await page.waitForTimeout(4000);

  const initialDiagnostics = await page.evaluate(() => {
    const v = window.cesiumViewer;
    const Cesium = window.Cesium;
    const baseLayer = v.imageryLayers.get(0);
    return {
      provider: baseLayer?.imageryProvider?.constructor?.name,
      terrain: v.scene.terrainProvider?.constructor?.name,
    };
  });
  console.log('Initial online diagnostics:', initialDiagnostics);

  // 2. Simulate browser going offline mid-session
  console.log('\n2. Simulating browser going offline mid-session...');
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
  });
  await page.waitForTimeout(2000);

  const recoveredDiagnostics = await page.evaluate(() => {
    const v = window.cesiumViewer;
    const Cesium = window.Cesium;
    const baseLayer = v.imageryLayers.get(0);
    return {
      provider: baseLayer?.imageryProvider?.constructor?.name,
      isTileMapService: baseLayer?.imageryProvider instanceof Cesium.TileMapServiceImageryProvider,
      terrain: v.scene.terrainProvider?.constructor?.name,
      isEllipsoid: v.scene.terrainProvider instanceof Cesium.EllipsoidTerrainProvider,
      badgeText: document.getElementById('basemap-status-badge')?.textContent?.trim(),
    };
  });
  console.log('Recovered offline diagnostics:', recoveredDiagnostics);

  if (!recoveredDiagnostics.isTileMapService) {
    throw new Error(`Expected TileMapServiceImageryProvider after recovery, got ${recoveredDiagnostics.provider}`);
  }
  if (!recoveredDiagnostics.isEllipsoid) {
    throw new Error(`Expected EllipsoidTerrainProvider after recovery, got ${recoveredDiagnostics.terrain}`);
  }
  console.log('✓ VERIFIED: Automatic recovery to NaturalEarthII and EllipsoidTerrainProvider succeeded without reload!');

  await browser.close();
  console.log('\n=== TEST 2 PASSED CLEANLY! ===');
}

testRuntimeRecovery().catch((err) => {
  console.error('Test 2 failed:', err);
  process.exit(1);
});
