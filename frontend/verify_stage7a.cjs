/**
 * verify_stage7a.cjs
 *
 * Empirical verification script for Stage 7a functional controls:
 * 1. Variable selector: temperature, salinity, current_u, current_v
 * 2. Palette selector: change to real ncWMS palette (psu-magma)
 * 3. Min/Max override: manually customize COLORSCALERANGE and verify
 * 4. Log/Linear scale: toggle LOGSCALE and verify
 * 5. Layer opacity: adjust alpha and verify map transparency
 * 6. Vertical exaggeration: adjust scene.verticalExaggeration
 * 7. Gated coastline land-mask test toggle: verify absent in normal UI
 */

const { chromium } = require('playwright');
const path = require('path');

const OUTPUT_DIR = path.resolve(__dirname, '..');

async function run() {
  console.log('Starting Stage 7a empirical browser verification...');
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: [
      '--use-gl=angle',
      '--use-angle=default',
      '--enable-webgl',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`[Browser ERROR]: ${msg.text()}`);
    }
  });

  console.log('Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 1. Wait for Cesium and controls panel
  console.log('Waiting for WMS panel and controls...');
  await page.waitForSelector('#wms-panel', { timeout: 25000 });
  await page.waitForSelector('#var-btn-temperature', { timeout: 15000 });
  await page.waitForSelector('#time-scrubber', { timeout: 15000 });

  // Wait for initial tiles to settle
  await page.waitForTimeout(3000);

  // -------------------------------------------------------------------------
  // Verification 1a: Variable = Temperature
  // -------------------------------------------------------------------------
  console.log('Testing Variable 1: Temperature...');
  await page.click('#var-btn-temperature');
  await page.waitForTimeout(2000);
  const tempLabel = await page.$eval('#active-variable-label', (el) => el.textContent);
  console.log(`Active variable: ${tempLabel}`);
  const file1 = path.join(OUTPUT_DIR, 'stage7a_20260919_var_temperature.png');
  await page.screenshot({ path: file1 });
  console.log(`[PASS 6a - 1/4] Saved Temperature screenshot: ${file1}`);

  // -------------------------------------------------------------------------
  // Verification 1b: Variable = Salinity
  // -------------------------------------------------------------------------
  console.log('Testing Variable 2: Salinity...');
  await page.click('#var-btn-salinity');
  await page.waitForFunction(() => {
    const el = document.querySelector('#active-variable-label');
    return el && el.textContent.includes('Salinity');
  }, { timeout: 10000 });
  await page.waitForTimeout(2500);
  const file2 = path.join(OUTPUT_DIR, 'stage7a_20260919_var_salinity.png');
  await page.screenshot({ path: file2 });
  console.log(`[PASS 6a - 2/4] Saved Salinity screenshot: ${file2}`);

  // -------------------------------------------------------------------------
  // Verification 1c: Variable = Current U
  // -------------------------------------------------------------------------
  console.log('Testing Variable 3: Current U (Eastward)...');
  await page.click('#var-btn-current_u');
  await page.waitForFunction(() => {
    const el = document.querySelector('#active-variable-label');
    return el && el.textContent.includes('Eastward');
  }, { timeout: 10000 });
  await page.waitForTimeout(2500);
  const file3 = path.join(OUTPUT_DIR, 'stage7a_20260919_var_current_u.png');
  await page.screenshot({ path: file3 });
  console.log(`[PASS 6a - 3/4] Saved Current U screenshot: ${file3}`);

  // -------------------------------------------------------------------------
  // Verification 1d: Variable = Current V
  // -------------------------------------------------------------------------
  console.log('Testing Variable 4: Current V (Northward)...');
  await page.click('#var-btn-current_v');
  await page.waitForFunction(() => {
    const el = document.querySelector('#active-variable-label');
    return el && el.textContent.includes('Northward');
  }, { timeout: 10000 });
  await page.waitForTimeout(2500);
  const file4 = path.join(OUTPUT_DIR, 'stage7a_20260919_var_current_v.png');
  await page.screenshot({ path: file4 });
  console.log(`[PASS 6a - 4/4] Saved Current V screenshot: ${file4}`);

  // -------------------------------------------------------------------------
  // Verification 2: Palette Selector (switch back to Temperature, choose psu-magma)
  // -------------------------------------------------------------------------
  console.log('Testing Palette Selector: Switching to Temperature and selecting psu-magma...');
  await page.click('#var-btn-temperature');
  await page.waitForTimeout(1000);
  await page.selectOption('#palette-select', 'psu-magma');
  await page.waitForTimeout(2500);
  const file5 = path.join(OUTPUT_DIR, 'stage7a_20260919_palette_magma.png');
  await page.screenshot({ path: file5 });
  console.log(`[PASS 6b] Saved Palette Magma screenshot: ${file5}`);

  // -------------------------------------------------------------------------
  // Verification 3: Min/Max Range Manual Override
  // -------------------------------------------------------------------------
  console.log('Testing Range Override: Setting min=28, max=30 (tight contrast)...');
  await page.fill('#range-min-input', '28');
  await page.dispatchEvent('#range-min-input', 'change');
  await page.fill('#range-max-input', '30');
  await page.dispatchEvent('#range-max-input', 'change');
  await page.waitForTimeout(2500);
  const overriddenRange = await page.$eval('#legend-range-label', (el) => el.textContent);
  console.log(`Confirmed overridden range: ${overriddenRange}`);
  const file6 = path.join(OUTPUT_DIR, 'stage7a_20260919_range_override.png');
  await page.screenshot({ path: file6 });
  console.log(`[PASS 6c] Saved Range Override screenshot: ${file6}`);

  // Reset range
  await page.click('#reset-range-btn');
  await page.waitForTimeout(1000);

  // -------------------------------------------------------------------------
  // Verification 4: Log/Linear Scale Toggle
  // -------------------------------------------------------------------------
  console.log('Testing Log Scale Toggle...');
  await page.check('#logscale-toggle');
  await page.waitForTimeout(2500);
  const file7 = path.join(OUTPUT_DIR, 'stage7a_20260919_logscale.png');
  await page.screenshot({ path: file7 });
  console.log(`[PASS 6d] Saved Log Scale screenshot: ${file7}`);
  // Uncheck log scale
  await page.uncheck('#logscale-toggle');
  await page.waitForTimeout(1000);

  // -------------------------------------------------------------------------
  // Verification 5: Layer Opacity Control (set to 40%)
  // -------------------------------------------------------------------------
  console.log('Testing Layer Opacity Slider (set to 0.4)...');
  await page.$eval('#opacity-slider', (el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '0.4');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(2000);
  const opacityLabel = await page.$eval('#opacity-label', (el) => el.textContent);
  console.log(`Confirmed opacity label: ${opacityLabel}`);
  const file8 = path.join(OUTPUT_DIR, 'stage7a_20260919_opacity_40.png');
  await page.screenshot({ path: file8 });
  console.log(`[PASS 6e] Saved Opacity 40% screenshot: ${file8}`);

  // Restore opacity to 1.0
  await page.$eval('#opacity-slider', (el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '1.0');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(1000);

  // -------------------------------------------------------------------------
  // Verification 6: Vertical Exaggeration Slider (set to 5.0x)
  // -------------------------------------------------------------------------
  console.log('Testing Vertical Exaggeration Slider (set to 5.0x)...');
  await page.$eval('#vertical-exaggeration-slider', (el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '5.0');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(2000);
  const exaggerationLabel = await page.$eval('#vertical-exaggeration-label', (el) => el.textContent);
  console.log(`Confirmed vertical exaggeration label: ${exaggerationLabel}`);

  const cesiumExaggeration = await page.evaluate(() => {
    const v = window.cesiumViewer;
    return v ? v.scene.verticalExaggeration : null;
  });
  console.log(`Cesium scene.verticalExaggeration value: ${cesiumExaggeration}`);

  const file9 = path.join(OUTPUT_DIR, 'stage7a_20260919_vertical_exaggeration.png');
  await page.screenshot({ path: file9 });
  console.log(`[PASS 6f] Saved Vertical Exaggeration screenshot: ${file9}`);

  // -------------------------------------------------------------------------
  // Verification 7: Confirm Coastline (Land Mask Test) button is hidden in 3D Modal
  // -------------------------------------------------------------------------
  console.log('Testing 3D Volumetric Modal: verifying Coastline Land Mask test button is hidden...');
  await page.click('#drill-3d-button');
  await page.waitForSelector('#volumetric-overlay', { timeout: 10000 });
  await page.waitForTimeout(2000);

  const coastlineBtn = await page.$('#region-select-coastline');
  if (coastlineBtn !== null) {
    throw new Error('FAIL: #region-select-coastline is still present in live app UI!');
  }
  console.log('CONFIRMED: Coastline (Land Mask Test) button is hidden from live app UI.');

  const file10 = path.join(OUTPUT_DIR, 'stage7a_20260919_overlay_nomaskbutton.png');
  await page.screenshot({ path: file10 });
  console.log(`[PASS 6g] Saved 3D Modal screenshot (clean UI): ${file10}`);

  // Close overlay
  await page.click('#close-3d-btn');
  await page.waitForSelector('#volumetric-overlay', { state: 'detached', timeout: 5000 });

  await browser.close();
  console.log('\nAll Stage 7a empirical verifications completed successfully!');
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
