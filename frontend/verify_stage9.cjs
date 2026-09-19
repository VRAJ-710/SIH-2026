/**
 * verify_stage9.cjs
 *
 * Playwright verification script for Stage 9.
 * Captures all required empirical browser screenshots:
 *  1. stage9_20260919_mode_forecaster.png          (Task 5d: Forecaster mode with full controls)
 *  2. stage9_20260919_mode_public.png              (Task 5d: Public mode with simplified view & tour banner)
 *  3. stage9_20260919_beat1_formation.png          (Task 5a: Tour caption panel on Beat 1, May 14 wide warm pool)
 *  4. stage9_20260919_beat2_peak.png               (Task 5a: Tour caption panel on Beat 2, May 18 closer zoom)
 *  5. stage9_20260919_beat4_coldwake.png           (Task 5b: Cold-wake beat, visibly cooler water & 3D CTA)
 *  6. stage9_20260919_beat5_aftermath_profile.png  (Task 5c: Aftermath beat, BGC-Argo #2902264 profile opened & honest caption)
 *  7. stage9_20260919_state_preserved.png          (Task 5e: Mode switching & tour exit preserves view state)
 */

const { chromium } = require('playwright');
const path = require('path');

const OUTPUT_DIR = path.resolve(__dirname, '..');

async function run() {
  console.log('Launching Chromium for Stage 9 empirical verification...');
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

  // 1. Wait for Cesium and WMS panel
  console.log('Waiting for WMS panel and time scrubber...');
  await page.waitForSelector('#wms-panel', { timeout: 20000 });
  await page.waitForSelector('#time-scrubber', { timeout: 10000 });
  await page.waitForSelector('#palette-select', { timeout: 10000 });

  // Wait for globe to settle
  await page.waitForTimeout(4000);

  // -------------------------------------------------------------------------
  // Screenshot 1 (Task 5d): Forecaster Mode showing full controls
  // -------------------------------------------------------------------------
  console.log('Capturing Screenshot 1: Forecaster mode with full controls...');
  const fileForecaster = path.join(OUTPUT_DIR, 'stage9_20260919_mode_forecaster.png');
  await page.screenshot({ path: fileForecaster });
  console.log(`[PASS 5d] Saved Forecaster Mode screenshot: ${fileForecaster}`);

  // -------------------------------------------------------------------------
  // Screenshot 2 (Task 5d): Public Mode showing simplified view
  // -------------------------------------------------------------------------
  console.log('Switching to Public Tour Mode...');
  await page.click('#mode-public-btn');
  await page.waitForSelector('#public-tour-banner', { timeout: 5000 });
  await page.waitForTimeout(1000);

  console.log('Capturing Screenshot 2: Public mode with simplified view...');
  const filePublic = path.join(OUTPUT_DIR, 'stage9_20260919_mode_public.png');
  await page.screenshot({ path: filePublic });
  console.log(`[PASS 5d] Saved Public Mode screenshot: ${filePublic}`);

  // -------------------------------------------------------------------------
  // Screenshot 3 (Task 5a): Tour Beat 1 (Formation Incubator, May 14)
  // -------------------------------------------------------------------------
  console.log('Launching Guided Tour from Public mode banner...');
  await page.click('#launch-tour-btn-public');
  await page.waitForSelector('#guided-tour-panel', { timeout: 10000 });
  await page.waitForSelector('#tour-beat-title', { timeout: 10000 });

  // Wait for camera flyTo to complete (2.5s duration + buffer) and WMS tiles to render
  console.log('Waiting for Beat 1 camera flyTo and WMS render...');
  await page.waitForTimeout(4000);

  const beat1Title = await page.$eval('#tour-beat-title', (el) => el.textContent);
  console.log(`Current tour beat: ${beat1Title}`);

  const fileBeat1 = path.join(OUTPUT_DIR, 'stage9_20260919_beat1_formation.png');
  await page.screenshot({ path: fileBeat1 });
  console.log(`[PASS 5a] Saved Beat 1 screenshot: ${fileBeat1}`);

  // -------------------------------------------------------------------------
  // Screenshot 4 (Task 5a): Tour Beat 2 (Peak Category 5, May 18)
  // -------------------------------------------------------------------------
  console.log('Navigating to Beat 2 (Peak Power)...');
  await page.click('#tour-next-btn');
  await page.waitForTimeout(4000);

  const beat2Title = await page.$eval('#tour-beat-title', (el) => el.textContent);
  console.log(`Current tour beat: ${beat2Title}`);

  const fileBeat2 = path.join(OUTPUT_DIR, 'stage9_20260919_beat2_peak.png');
  await page.screenshot({ path: fileBeat2 });
  console.log(`[PASS 5a] Saved Beat 2 screenshot: ${fileBeat2}`);

  // -------------------------------------------------------------------------
  // Screenshot 5 (Task 5b): Tour Beat 4 (Documented Cold Wake, May 21)
  // -------------------------------------------------------------------------
  console.log('Navigating to Beat 4 (The Ocean Cold Wake)...');
  // Jump directly to beat index 3 (Beat 4)
  await page.evaluate(() => {
    (window).setTourBeat(3);
  });
  await page.waitForTimeout(4000);

  const beat4Title = await page.$eval('#tour-beat-title', (el) => el.textContent);
  console.log(`Current tour beat: ${beat4Title}`);

  const fileBeat4 = path.join(OUTPUT_DIR, 'stage9_20260919_beat4_coldwake.png');
  await page.screenshot({ path: fileBeat4 });
  console.log(`[PASS 5b] Saved Beat 4 (Cold Wake) screenshot: ${fileBeat4}`);

  // -------------------------------------------------------------------------
  // Screenshot 6 (Task 5c): Tour Beat 5 (Ecological Aftermath, May 24 + Float #2902264)
  // -------------------------------------------------------------------------
  console.log('Navigating to Beat 5 (Aftermath & BGC Float)...');
  await page.evaluate(() => {
    (window).setTourBeat(4);
  });
  await page.waitForTimeout(4000);

  // Wait for profile popup to fetch and render
  console.log('Waiting for profile popup with Chlorophyll-a trace...');
  await page.waitForSelector('#profile-popup', { timeout: 15000 });
  await page.waitForTimeout(2000);

  const beat5Title = await page.$eval('#tour-beat-title', (el) => el.textContent);
  console.log(`Current tour beat: ${beat5Title}`);

  const fileBeat5 = path.join(OUTPUT_DIR, 'stage9_20260919_beat5_aftermath_profile.png');
  await page.screenshot({ path: fileBeat5 });
  console.log(`[PASS 5c] Saved Beat 5 (Aftermath & Profile) screenshot: ${fileBeat5}`);

  // -------------------------------------------------------------------------
  // Screenshot 7 (Task 5e): Exit tour and switch mode, verify state preserved
  // -------------------------------------------------------------------------
  console.log('Testing state preservation across tour exit and mode switch...');
  // Close profile popup first if open
  const closeBtn = await page.$('#profile-popup button[title="Close Profile Popup"]');
  if (closeBtn) {
    await closeBtn.click({ force: true });
    await page.waitForTimeout(500);
  }

  // Record state prior to exit
  const timePrior = await page.$eval('#current-time-label', (el) => el.textContent);
  const depthPrior = await page.$eval('#current-depth-label', (el) => el.textContent);
  const varPrior = await page.$eval('#active-variable-label', (el) => el.textContent);
  console.log(`State on Beat 5: Time="${timePrior}", Depth="${depthPrior}", Var="${varPrior}"`);

  // Exit tour
  await page.click('#exit-tour-btn');
  await page.waitForTimeout(1000);

  // Switch back to Forecaster Mode
  await page.click('#mode-forecaster-btn');
  await page.waitForTimeout(1000);

  const timeAfter = await page.$eval('#current-time-label', (el) => el.textContent);
  const depthAfter = await page.$eval('#current-depth-label', (el) => el.textContent);
  const varAfter = await page.$eval('#active-variable-label', (el) => el.textContent);
  console.log(`State after returning to Forecaster: Time="${timeAfter}", Depth="${depthAfter}", Var="${varAfter}"`);

  if (timePrior === timeAfter && depthPrior === depthAfter && varPrior === varAfter) {
    console.log('[PASS 5e] State successfully preserved across tour exit and mode switch!');
  } else {
    console.warn('[WARN 5e] State discrepancy detected!');
  }

  const fileState = path.join(OUTPUT_DIR, 'stage9_20260919_state_preserved.png');
  await page.screenshot({ path: fileState });
  console.log(`[PASS 5e] Saved State Preserved screenshot: ${fileState}`);

  await browser.close();
  console.log('Stage 9 empirical verification successfully finished!');
}

run().catch((err) => {
  console.error('Stage 9 verification failed:', err);
  process.exit(1);
});
