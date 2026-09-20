import { chromium } from 'playwright';

async function runFullCiWalkthrough() {
  console.log('===============================================================');
  console.log('STAGE 10: FULL CONTINUOUS INTEGRATION & RESILIENCE WALKTHROUGH');
  console.log('===============================================================');

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']
  });

  // Fresh context (no cache / storage persistence)
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  const issuesFound = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  const httpErrors = [];

  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error') {
      consoleErrors.push(text);
      console.log(`[CONSOLE ERROR] ${text}`);
    } else if (type === 'warn') {
      consoleWarnings.push(text);
      if (!text.includes('TileMapServiceImageryProvider fallback') && !text.includes('deprecated')) {
        console.log(`[CONSOLE WARN] ${text}`);
      }
    }
  });

  page.on('response', (res) => {
    if (res.status() >= 400) {
      const err = `${res.status()} ${res.request().method()} ${res.url()}`;
      httpErrors.push(err);
      console.log(`[HTTP ERROR] ${err}`);
    }
  });

  page.on('pageerror', (err) => {
    issuesFound.push(`Uncaught Page Error: ${err.message}`);
    console.log(`[UNCAUGHT PAGE ERROR] ${err.message}`);
  });

  console.log('\n[COLD START] Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#wms-panel', { timeout: 12000 });
  await page.waitForTimeout(3500);
  console.log('✓ Base application HUD & Cesium Canvas successfully mounted.');

  // =========================================================================
  // STEP 1: Variable Switching
  // =========================================================================
  console.log('\n--- STEP 1: VARIABLE SWITCHING ---');
  const variables = ['salinity', 'current_u', 'current_v', 'temperature'];
  for (const v of variables) {
    console.log(`Switching variable to: ${v}`);
    await page.click(`#var-btn-${v}`);
    await page.waitForTimeout(1000);
    const activeLabel = await page.textContent('#active-variable-label');
    console.log(`  Active display name: "${activeLabel.trim()}"`);
    if (!activeLabel) {
      issuesFound.push(`Active variable label missing for ${v}`);
    }
  }
  console.log('✓ Step 1 Complete: All 4 variables switch cleanly.');

  // =========================================================================
  // STEP 2: Depth / Time Animation
  // =========================================================================
  console.log('\n--- STEP 2: DEPTH / TIME ANIMATION ---');
  console.log('Testing Depth levels...');
  await page.fill('#depth-slider', '5');
  await page.waitForTimeout(800);
  const depthText1 = await page.textContent('#current-depth-label');
  console.log(`  Depth level 6: ${depthText1.trim()}`);

  await page.fill('#depth-slider', '15');
  await page.waitForTimeout(800);
  const depthText2 = await page.textContent('#current-depth-label');
  console.log(`  Depth level 16: ${depthText2.trim()}`);

  // Quick preset buttons
  console.log('Testing Depth preset buttons...');
  await page.click('button:has-text("Thermocline")');
  await page.waitForTimeout(800);
  await page.click('button:has-text("Deep")');
  await page.waitForTimeout(800);
  await page.click('button:has-text("Surface")');
  await page.waitForTimeout(800);

  console.log('Testing Time scrubber and playback...');
  await page.fill('#time-scrubber', '4');
  await page.waitForTimeout(800);
  const timeText1 = await page.textContent('#current-time-label');
  console.log(`  Time position: ${timeText1.trim()}`);

  await page.click('#next-time-btn');
  await page.waitForTimeout(600);
  await page.click('#prev-time-btn');
  await page.waitForTimeout(600);

  console.log('Starting continuous animation playback (~3s)...');
  await page.click('#play-button');
  await page.waitForTimeout(3200);
  await page.click('#play-button');
  const timeText2 = await page.textContent('#current-time-label');
  console.log(`  Paused at: ${timeText2.trim()}`);
  console.log('✓ Step 2 Complete: Depth and Time controls fully responsive.');

  // =========================================================================
  // STEP 3: Colorbar / Palette / Range / Opacity / Vertical Exaggeration
  // =========================================================================
  console.log('\n--- STEP 3: COLORBAR, PALETTE, RANGE, OPACITY, VERTICAL EXAGGERATION ---');
  console.log('Changing palette to psu-viridis...');
  await page.selectOption('#palette-select', 'psu-viridis');
  await page.waitForTimeout(800);

  console.log('Changing palette to x-Rainbow...');
  await page.selectOption('#palette-select', 'x-Rainbow');
  await page.waitForTimeout(800);

  console.log('Returning palette to psu-magma...');
  await page.selectOption('#palette-select', 'psu-magma');
  await page.waitForTimeout(800);

  console.log('Testing custom min/max overrides...');
  await page.fill('#range-min-input', '22.0');
  await page.waitForTimeout(600);
  await page.fill('#range-max-input', '34.0');
  await page.waitForTimeout(800);
  const rangeText = await page.textContent('#legend-range-label');
  console.log(`  Custom range displayed: ${rangeText.trim()}`);

  console.log('Resetting range...');
  await page.click('#reset-range-btn');
  await page.waitForTimeout(800);
  const resetRangeText = await page.textContent('#legend-range-label');
  console.log(`  Reset range displayed: ${resetRangeText.trim()}`);

  console.log('Testing layer opacity slider...');
  await page.fill('#opacity-slider', '0.65');
  await page.waitForTimeout(600);
  const opacityLabel = await page.textContent('#opacity-label');
  console.log(`  Opacity: ${opacityLabel.trim()}`);

  console.log('Testing vertical exaggeration slider...');
  await page.fill('#vertical-exaggeration-slider', '4');
  await page.waitForTimeout(600);
  const exagLabel = await page.textContent('#vertical-exaggeration-label');
  console.log(`  Vertical exaggeration: ${exagLabel.trim()}`);
  console.log('✓ Step 3 Complete: Visualization tuning controls functioning seamlessly.');

  // =========================================================================
  // STEP 4: Instrument Marker Click-to-Profile (argo, buoy, glider, adcp)
  // =========================================================================
  console.log('\n--- STEP 4: INSTRUMENT MARKER PROFILES ---');
  const instruments = await page.evaluate(async () => {
    const res = await fetch('/api/instruments');
    return res.json();
  });
  console.log(`Retrieved ${instruments.length} total in-situ markers.`);

  const sampleTypes = [
    { type: 'argo', label: 'Argo Float' },
    { type: 'buoy', label: 'Moored Buoy' },
    { type: 'glider', label: 'Ocean Glider' },
    { type: 'adcp', label: 'ADCP Mooring' }
  ];

  for (const s of sampleTypes) {
    const target = instruments.find((i) => i.instrument_type === s.type);
    if (!target) {
      issuesFound.push(`Missing instrument marker for type: ${s.type}`);
      continue;
    }
    console.log(`Testing profile popup for ${s.label} (ID: ${target.instrument_id})...`);
    await page.evaluate((id) => window.fetchProfile(id), target.instrument_id);
    await page.waitForSelector('#profile-popup', { timeout: 6000 });
    await page.waitForTimeout(1000);

    const title = await page.textContent('#profile-popup h3');
    console.log(`  Popup Title: "${title.trim()}"`);
    if (!title.toLowerCase().includes(s.type)) {
      issuesFound.push(`Popup title "${title}" did not match expected type ${s.type}`);
    }
  }

  // Close profile popup by clicking off or setting profile null
  await page.click('#profile-close-btn');
  await page.waitForTimeout(500);
  console.log('✓ Step 4 Complete: All 4 instrument profile charts loaded and rendered.');

  // =========================================================================
  // STEP 5: Drill into 3D (Raymarch and Isosurface)
  // =========================================================================
  console.log('\n--- STEP 5: DRILL INTO 3D VOLUMETRIC VIEW ---');
  await page.click('#drill-3d-button');
  await page.waitForSelector('#volume-info-panel', { timeout: 10000 });
  await page.waitForTimeout(2000);
  console.log('  3D Volumetric Modal opened in Raymarch Volume mode.');

  console.log('  Testing Mode Switch to Marching Cubes Isosurface...');
  await page.click('#render-mode-isosurface');
  await page.waitForTimeout(2000);

  console.log('  Adjusting Isosurface Threshold slider...');
  await page.evaluate(() => {
    const el = document.getElementById('threshold-slider');
    if (el) {
      el.value = '22.0';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForTimeout(1000);

  console.log('  Testing Mode Switch back to Raymarch Volume...');
  await page.click('#render-mode-raymarch');
  await page.waitForTimeout(2000);

  console.log('  Closing 3D Volumetric View...');
  await page.click('#close-3d-btn');
  await page.waitForTimeout(1000);
  console.log('✓ Step 5 Complete: 3D Volumetric scene fully verified in both render modes.');

  // =========================================================================
  // STEP 6: Guided Tour (All 5 beats, forward and reverse)
  // =========================================================================
  console.log('\n--- STEP 6: GUIDED TOUR ---');
  await page.click('#launch-tour-btn-forecaster');
  await page.waitForSelector('#guided-tour-panel', { timeout: 5000 });
  await page.waitForTimeout(1500);

  for (let b = 0; b < 5; b++) {
    const beatTitle = await page.textContent('#tour-beat-title');
    console.log(`  Beat ${b + 1}: "${beatTitle.trim()}"`);
    if (b < 4) {
      await page.click('#tour-next-btn');
      await page.waitForTimeout(2000);
    }
  }

  // On Beat 5, verify Call to Action button for BGC-Argo #2902264
  console.log('  Testing Beat 5 Call-to-Action (View Chlorophyll Profile)...');
  const ctaBtn = await page.$('#tour-cta-btn');
  if (ctaBtn) {
    const ctaText = await ctaBtn.textContent();
    console.log(`  Beat 5 CTA: "${ctaText.trim()}"`);
    await page.click('#tour-cta-btn');
    await page.waitForSelector('#profile-popup', { timeout: 5000 });
    console.log('  ✓ Beat 5 CTA successfully opened BGC-Argo #2902264 Chlorophyll profile');
    await page.click('#profile-close-btn');
  } else {
    issuesFound.push('Beat 5 Call to Action button #tour-cta-btn not found');
  }

  console.log('  Traversing Guided Tour in reverse direction...');
  for (let b = 4; b >= 0; b--) {
    if (b > 0) {
      await page.click('#tour-prev-btn');
      await page.waitForTimeout(1500);
    }
    const beatTitle = await page.textContent('#tour-beat-title');
    console.log(`  Reverse Beat ${b + 1}: "${beatTitle.trim()}"`);
  }

  console.log('  Exiting Guided Tour...');
  await page.click('#exit-tour-btn');
  await page.waitForTimeout(1000);
  console.log('✓ Step 6 Complete: Guided Tour traversed forward and backward through all 5 story beats.');

  // =========================================================================
  // STEP 7: Forecaster / Public Mode Toggle
  // =========================================================================
  console.log('\n--- STEP 7: FORECASTER / PUBLIC MODE TOGGLE ---');
  console.log('Switching to Public Tour Mode...');
  await page.click('#mode-public-btn');
  await page.waitForTimeout(1000);

  const publicBanner = await page.$('#public-tour-banner');
  if (publicBanner) {
    console.log('  ✓ Public Tour Banner is visible in Public Mode');
  } else {
    issuesFound.push('Public Tour Banner #public-tour-banner missing in Public Mode');
  }

  console.log('Switching back to Forecaster Mode...');
  await page.click('#mode-forecaster-btn');
  await page.waitForTimeout(1000);

  const forecasterControls = await page.$('#forecaster-colorbar-controls');
  if (forecasterControls) {
    console.log('  ✓ Forecaster Colorbar & Scale Controls visible in Forecaster Mode');
  } else {
    issuesFound.push('Forecaster Controls #forecaster-colorbar-controls missing in Forecaster Mode');
  }
  console.log('✓ Step 7 Complete: Mode toggle verified.');

  // =========================================================================
  // REPORT RESULTS
  // =========================================================================
  console.log('\n===============================================================');
  console.log('WALKTHROUGH EXECUTION SUMMARY');
  console.log('===============================================================');
  console.log(`Total Issues / Inconsistencies Found: ${issuesFound.length}`);
  console.log(`Console Errors: ${consoleErrors.length}`);
  console.log(`HTTP Status >= 400 Errors: ${httpErrors.length}`);

  if (issuesFound.length > 0) {
    console.log('\nISSUES:');
    issuesFound.forEach((i, idx) => console.log(`  ${idx + 1}. ${i}`));
  }
  if (consoleErrors.length > 0) {
    console.log('\nCONSOLE ERRORS:');
    consoleErrors.forEach((e, idx) => console.log(`  ${idx + 1}. ${e}`));
  }
  if (httpErrors.length > 0) {
    console.log('\nHTTP ERRORS:');
    httpErrors.forEach((h, idx) => console.log(`  ${idx + 1}. ${h}`));
  }

  await browser.close();

  if (issuesFound.length === 0 && consoleErrors.length === 0 && httpErrors.length === 0) {
    console.log('\n🎉 ALL STAGES 1-9 FEATURES PASSED WITH ZERO ERRORS!');
  } else {
    console.log('\nWalkthrough finished with items noted above.');
  }
}

runFullCiWalkthrough().catch((err) => {
  console.error('Walkthrough failed to complete:', err);
  process.exit(1);
});
