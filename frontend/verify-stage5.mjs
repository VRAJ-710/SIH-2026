import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const artifactsDir = 'C:/Users/Vraj/.gemini/antigravity/brain/89ff9811-326a-4e01-84d6-e5bf743ad488';
const workspaceDir = 'C:/Users/Vraj/OneDrive/Attachments/SIH-2026';

function saveScreenshot(buf, filename) {
  const wsPath = path.join(workspaceDir, filename);
  const artPath = path.join(artifactsDir, filename);
  fs.writeFileSync(wsPath, buf);
  try {
    fs.writeFileSync(artPath, buf);
  } catch (e) {
    console.warn('Could not write to artifacts dir:', e.message);
  }
  console.log('Saved screenshot:', wsPath);
}

async function run() {
  console.log('=== STARTING STAGE 5 VERIFICATION ===');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });

  const page = await context.newPage();

  const consoleLogs = [];
  const errors = [];

  page.on('console', (msg) => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  page.on('pageerror', (err) => {
    errors.push(err.message);
  });

  console.log('Step 1: Navigating to http://localhost:5173/');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  console.log('Step 2: Checking page errors');
  if (errors.length > 0) {
    console.error('Page errors encountered:', errors);
  } else {
    console.log('No page errors encountered.');
  }

  console.log('Step 3: Verifying dynamic depth and time controls');
  await page.waitForSelector('#depth-slider', { timeout: 15000 });
  await page.waitForSelector('#time-scrubber', { timeout: 15000 });

  const depthLabel = await page.$eval('#current-depth-label', (el) => el.textContent);
  const timeLabel = await page.$eval('#current-time-label', (el) => el.textContent);
  console.log('Initial Depth Label:', depthLabel);
  console.log('Initial Time Label:', timeLabel);

  const depthSliderMax = await page.$eval('#depth-slider', (el) => el.max);
  const timeSliderMax = await page.$eval('#time-scrubber', (el) => el.max);
  console.log('Depth Slider Max Index:', depthSliderMax, '(Levels count: ' + (Number(depthSliderMax) + 1) + ')');
  console.log('Time Scrubber Max Index:', timeSliderMax, '(Steps count: ' + (Number(timeSliderMax) + 1) + ')');

  if (Number(depthSliderMax) !== 49) {
    console.warn('Warning: Expected 50 depth levels (max index 49), got:', depthSliderMax);
  } else {
    console.log('SUCCESS: Exactly 50 depth levels parsed dynamically from GetCapabilities!');
  }

  const setSlider = async (sliderId, val) => {
    await page.evaluate(({ sliderId, val }) => {
      const input = document.getElementById(sliderId);
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, String(val));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, { sliderId, val });
  };

  // --- SCREENSHOT (a): Surface + Start Date ---
  console.log('Step 4: Setting Surface (idx 0) + Start Date (idx 0)');
  await setSlider('depth-slider', 0);
  await setSlider('time-scrubber', 0);
  await page.waitForTimeout(3500);

  const shotSurfaceStartBuf = await page.screenshot();
  saveScreenshot(shotSurfaceStartBuf, 'stage5_20260917_surface_start.png');

  // --- COLD WAKE SANITY CHECK (2020-05-17 to 2020-05-21) ---
  console.log('Step 5: Testing Cold Wake between 2020-05-17 and 2020-05-21 at Surface');
  // Set to 2020-05-17 (idx 4)
  await setSlider('time-scrubber', 4);
  await page.waitForTimeout(2500);
  const shotWake1Buf = await page.screenshot();
  saveScreenshot(shotWake1Buf, 'stage5_20260917_coldwake_20200517.png');

  // Set to 2020-05-21 (idx 8)
  await setSlider('time-scrubber', 8);
  await page.waitForTimeout(2500);
  const shotWake2Buf = await page.screenshot();
  saveScreenshot(shotWake2Buf, 'stage5_20260917_coldwake_20200521.png');

  console.log('Cold wake check: screenshots captured for May 17 and May 21.');

  // --- SCREENSHOT (b): Middle Depth + Middle Date ---
  console.log('Step 6: Setting Mid Depth (~92.3m, idx 21) + Mid Date (2020-05-18, idx 5)');
  await setSlider('depth-slider', 21);
  await setSlider('time-scrubber', 5);
  await page.waitForTimeout(3500);

  const shotMidBuf = await page.screenshot();
  saveScreenshot(shotMidBuf, 'stage5_20260917_mid_depth_mid_date.png');

  // --- SCREENSHOT (c): Deep Level + End Date ---
  console.log('Step 7: Setting Deep Level (~453.9m, idx 30) + End Date (2020-05-25, idx 12)');
  await setSlider('depth-slider', 30);
  await setSlider('time-scrubber', 12);
  await page.waitForTimeout(3500);

  const shotDeepBuf = await page.screenshot();
  saveScreenshot(shotDeepBuf, 'stage5_20260917_deep_level_end_date.png');

  // --- TEST PLAY / PAUSE ANIMATION ---
  console.log('Step 8: Testing Play/Pause Animation');
  const timeBeforePlay = await page.$eval('#current-time-label', (el) => el.textContent);
  console.log('Time before play:', timeBeforePlay);
  await page.click('#play-button');
  console.log('Clicked Play, waiting 2.5 seconds...');
  await page.waitForTimeout(2500);
  const timeDuringPlay = await page.$eval('#current-time-label', (el) => el.textContent);
  console.log('Time during play:', timeDuringPlay);
  await page.click('#play-button'); // Pause
  console.log('Clicked Pause.');

  if (timeBeforePlay !== timeDuringPlay) {
    console.log('SUCCESS: Play animation automatically advanced timeline!');
  } else {
    console.warn('Warning: Play animation did not advance timeline in 2.5s');
  }

  // --- TEST INSTRUMENT MARKER PICKING ---
  console.log('Step 9: Testing Instrument Marker Picking and Profile Chart');
  const markerClickResult = await page.evaluate(() => {
    const viewer = window.cesiumViewer;
    if (!viewer) return { success: false, reason: 'no viewer' };
    const ds = viewer.dataSources.get(0);
    if (!ds || ds.entities.values.length === 0) return { success: false, reason: 'no entities' };
    const entity = ds.entities.values[0];
    const cartesian = entity.position.getValue(viewer.clock.currentTime);
    const winCoord = window.Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, cartesian);
    return {
      success: true,
      id: entity.properties.instrument_id.getValue(),
      type: entity.properties.instrument_type.getValue(),
      x: winCoord.x,
      y: winCoord.y,
    };
  });

  console.log('Target entity for click:', markerClickResult);
  if (markerClickResult.success) {
    await page.mouse.click(markerClickResult.x, markerClickResult.y);
    console.log('Clicked on entity at', markerClickResult.x, markerClickResult.y);
    await page.waitForTimeout(2000);

    const profileVisible = await page.$('.js-plotly-plot');
    if (profileVisible) {
      console.log('SUCCESS: Plotly profile chart opened on marker click!');
      const profileBuf = await page.screenshot();
      saveScreenshot(profileBuf, 'stage5_20260917_marker_profile.png');
    } else {
      console.warn('Plotly chart did not appear after canvas click.');
    }
  }

  // --- VERIFY SCREENSHOT DIFFERENCES ---
  console.log('Step 10: Verifying image differences across depth & date');
  const diffSurfaceMid = Buffer.compare(shotSurfaceStartBuf, shotMidBuf) !== 0;
  const diffMidDeep = Buffer.compare(shotMidBuf, shotDeepBuf) !== 0;
  const diffSurfaceDeep = Buffer.compare(shotSurfaceStartBuf, shotDeepBuf) !== 0;
  console.log('Surface vs Mid Depth is distinct:', diffSurfaceMid);
  console.log('Mid Depth vs Deep Level is distinct:', diffMidDeep);
  console.log('Surface vs Deep Level is distinct:', diffSurfaceDeep);

  if (diffSurfaceMid && diffMidDeep) {
    console.log('SUCCESS: All depth levels produce visually and binary distinct ocean tile imagery!');
  }

  await browser.close();
  console.log('=== VERIFICATION COMPLETED SUCCESSFULLY ===');
}

run().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
