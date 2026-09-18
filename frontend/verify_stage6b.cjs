/**
 * verify_stage6b.cjs
 *
 * Playwright verification script for Stage 6b.
 * Captures all 5 required empirical browser screenshots:
 *  1. stage6b_20260918_start.png      (Task 6a: 3D overlay at start date 2020-05-13)
 *  2. stage6b_20260918_coldwake.png   (Task 6b: time changed to 2020-05-21 cold wake WHILE overlay open)
 *  3. stage6b_20260918_landmask.png   (Task 6c: land areas transparent in coastline test bbox)
 *  4. stage6b_20260918_isosurface.png (Task 6d: Marching Cubes mode with dynamic threshold)
 *  5. stage6b_20260918_return_map.png (Task 6e: closing overlay returns to map with time intact)
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.resolve(__dirname, '..');

async function run() {
  console.log('Launching Chromium for Stage 6b empirical verification...');
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

  // Log console errors for diagnosis
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`[Browser ERROR]: ${msg.text()}`);
    }
  });

  console.log('Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 1. Wait for Cesium and WMS panel
  console.log('Waiting for WMS panel and time scrubber...');
  await page.waitForSelector('#drill-3d-button:not([disabled])', { timeout: 20000 });
  await page.waitForSelector('#time-scrubber', { timeout: 10000 });

  // Wait for initial Cesium render
  await page.waitForTimeout(2000);

  // Set time scrubber to start date (index 0 = 2020-05-13)
  console.log('Setting time scrubber to start date (index 0)...');
  await page.$eval('#time-scrubber', (el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '0');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(1000);

  const startTimeLabel = await page.$eval('#current-time-label', (el) => el.textContent);
  console.log(`Current map time: ${startTimeLabel}`);

  // -------------------------------------------------------------------------
  // Screenshot 1 (Task 6a): Open 3D overlay at start date (2020-05-13)
  // -------------------------------------------------------------------------
  console.log('Clicking "Drill into 3D" button to open overlay...');
  await page.click('#drill-3d-button');

  await page.waitForSelector('#volumetric-overlay', { timeout: 10000 });
  await page.waitForSelector('#overlay-date-label', { timeout: 10000 });

  // Wait for volume data to fetch and Three.js to render
  console.log('Waiting for 3D volume fetch and render...');
  await page.waitForFunction(() => {
    const el = document.querySelector('#overlay-date-label');
    return el && el.textContent.includes('2020-05-13');
  }, { timeout: 15000 });

  await page.waitForTimeout(2000); // Allow Three.js multiple animation frames

  const file1 = path.join(OUTPUT_DIR, 'stage6b_20260918_start.png');
  await page.screenshot({ path: file1 });
  console.log(`[PASS 6a] Saved Screenshot 1: ${file1}`);

  // -------------------------------------------------------------------------
  // Screenshot 2 (Task 6b): Change time to 2020-05-21 WHILE overlay is open
  // -------------------------------------------------------------------------
  console.log('Changing main app time scrubber to 2020-05-21 WHILE overlay is open...');
  // Find index for 2020-05-21: 2020-05-13 is index 0, so 2020-05-21 is index 8
  await page.$eval('#time-scrubber', (el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '8');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const updatedMapTime = await page.$eval('#current-time-label', (el) => el.textContent);
  console.log(`Updated map time label: ${updatedMapTime}`);

  // Wait for debounced fetch (300ms) + network request + 3D update
  console.log('Waiting for volumetric overlay to refetch and update to 2020-05-21...');
  await page.waitForFunction(() => {
    const el = document.querySelector('#overlay-date-label');
    return el && el.textContent.includes('2020-05-21');
  }, { timeout: 15000 });

  await page.waitForTimeout(2500); // Let Three.js render new temperature field

  const file2 = path.join(OUTPUT_DIR, 'stage6b_20260918_coldwake.png');
  await page.screenshot({ path: file2 });
  console.log(`[PASS 6b] Saved Screenshot 2: ${file2}`);

  // -------------------------------------------------------------------------
  // Screenshot 3 (Task 6c): Confirm land areas show as transparent in raymarch
  // Test with Coastline Test bbox (86–91°E, 20–23°N) which has 83.2% land cells
  // -------------------------------------------------------------------------
  console.log('Switching region to Coastline (Land Mask Test: 86-91E, 20-23N)...');
  await page.click('#region-select-coastline');

  await page.waitForFunction(() => {
    const el = document.querySelector('#overlay-region-label');
    return el && el.textContent.includes('Coastline');
  }, { timeout: 10000 });

  console.log('Waiting for coastline volume data with land sentinels...');
  await page.waitForFunction(() => {
    const el = document.querySelector('#overlay-mask-status');
    return el && el.textContent.includes('sentinel cells transparent');
  }, { timeout: 15000 });

  await page.waitForTimeout(2500);

  const maskStatus = await page.$eval('#overlay-mask-status', (el) => el.textContent);
  console.log(`Mask status confirmed: ${maskStatus}`);

  const file3 = path.join(OUTPUT_DIR, 'stage6b_20260918_landmask.png');
  await page.screenshot({ path: file3 });
  console.log(`[PASS 6c] Saved Screenshot 3: ${file3}`);

  // -------------------------------------------------------------------------
  // Screenshot 4 (Task 6d): Marching Cubes isosurface mode with real data & dynamic bounds
  // Switch back to cold-wake bbox, activate Marching Cubes mode
  // -------------------------------------------------------------------------
  console.log('Switching to Marching Cubes isosurface mode on Cold-Wake Box...');
  await page.click('#region-select-coldwake');
  await page.waitForTimeout(1000);

  await page.click('#render-mode-isosurface');

  await page.waitForFunction(() => {
    const slider = document.querySelector('#threshold-slider');
    const minLabel = document.querySelector('#slider-min-label');
    return slider && minLabel && !minLabel.textContent.includes('26.0');
  }, { timeout: 10000 });

  // Adjust threshold slider to show nice isosurface
  await page.$eval('#threshold-slider', (el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '28.0');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await page.waitForTimeout(2500);

  const threshLabel = await page.$eval('#current-threshold-label', (el) => el.textContent);
  const minLabel = await page.$eval('#slider-min-label', (el) => el.textContent);
  const maxLabel = await page.$eval('#slider-max-label', (el) => el.textContent);
  console.log(`Isosurface threshold: ${threshLabel}, range: ${minLabel} to ${maxLabel}`);

  const file4 = path.join(OUTPUT_DIR, 'stage6b_20260918_isosurface.png');
  await page.screenshot({ path: file4 });
  console.log(`[PASS 6d] Saved Screenshot 4: ${file4}`);

  // -------------------------------------------------------------------------
  // Screenshot 5 (Task 6e): Close overlay and confirm map returns with time intact
  // -------------------------------------------------------------------------
  console.log('Closing 3D overlay via close button...');
  await page.click('#close-3d-btn');

  // Verify overlay is detached/removed
  await page.waitForSelector('#volumetric-overlay', { state: 'detached', timeout: 5000 });

  // Confirm map time is still 2020-05-21 (not reset)
  const finalMapTime = await page.$eval('#current-time-label', (el) => el.textContent);
  console.log(`Final map time after closing overlay: ${finalMapTime}`);

  if (!finalMapTime.includes('2020-05-21')) {
    throw new Error(`Map time was reset! Expected 2020-05-21, got: ${finalMapTime}`);
  }

  await page.waitForTimeout(1500);

  const file5 = path.join(OUTPUT_DIR, 'stage6b_20260918_return_map.png');
  await page.screenshot({ path: file5 });
  console.log(`[PASS 6e] Saved Screenshot 5: ${file5}`);

  await browser.close();
  console.log('\nAll 5 Stage 6b empirical browser verifications PASSED successfully!');
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
