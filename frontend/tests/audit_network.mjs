import { chromium } from 'playwright';

async function runAudit() {
  console.log('Starting Network Audit with Chromium...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  const networkRequests = [];
  const externalRequests = [];
  const localRequests = [];

  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    const parsed = new URL(url);
    const item = {
      url,
      method,
      hostname: parsed.hostname,
      pathname: parsed.pathname,
      search: parsed.search,
      isLocal: parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1',
    };
    networkRequests.push(item);
    if (item.isLocal) {
      localRequests.push(item);
    } else {
      externalRequests.push(item);
      console.log(`[EXTERNAL NETWORK CALL] ${method} ${url}`);
    }
  });

  page.on('response', (res) => {
    if (res.status() >= 400) {
      console.log(`[HTTP ${res.status()}] ${res.request().method()} ${res.url()}`);
    }
  });

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error' || text.includes('Error') || text.includes('Failed')) {
      console.log(`[BROWSER ${msg.type().toUpperCase()}] ${text}`);
    }
  });

  console.log('Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // 1. Check Initial State
  console.log('--- Step 1: Initial Load Verification ---');
  await page.waitForSelector('#wms-panel', { timeout: 10000 });
  await page.waitForTimeout(3000);

  // 2. Variable Switching
  console.log('--- Step 2: Variable Switching ---');
  for (const v of ['salinity', 'current_u', 'current_v', 'temperature']) {
    console.log(`Switching to variable: ${v}`);
    await page.click(`#var-btn-${v}`);
    await page.waitForTimeout(1000);
  }

  // 3. Depth Scrubber / Buttons
  console.log('--- Step 3: Depth Scrubber & Buttons ---');
  await page.fill('#depth-slider', '5');
  await page.waitForTimeout(800);
  await page.fill('#depth-slider', '15');
  await page.waitForTimeout(800);
  await page.fill('#depth-slider', '0');
  await page.waitForTimeout(800);

  // 4. Time Scrubber & Animation
  console.log('--- Step 4: Time Scrubber & Animation ---');
  await page.fill('#time-scrubber', '3');
  await page.waitForTimeout(800);
  await page.click('#next-time-btn');
  await page.waitForTimeout(800);
  await page.click('#prev-time-btn');
  await page.waitForTimeout(800);
  await page.click('#play-button'); // Play
  await page.waitForTimeout(2500);
  await page.click('#play-button'); // Pause
  await page.waitForTimeout(500);

  // 5. Colorbar, Palette, Custom Range, Opacity, Vertical Exaggeration
  console.log('--- Step 5: Colorbar, Palette, Custom Range, Opacity, Exaggeration ---');
  await page.selectOption('#palette-select', 'psu-viridis');
  await page.waitForTimeout(800);
  await page.selectOption('#palette-select', 'psu-magma');
  await page.waitForTimeout(800);
  await page.fill('#range-min-input', '22');
  await page.waitForTimeout(500);
  await page.fill('#range-max-input', '34');
  await page.waitForTimeout(800);
  await page.click('#reset-range-btn');
  await page.waitForTimeout(800);
  await page.fill('#opacity-slider', '0.75');
  await page.waitForTimeout(500);
  await page.fill('#vertical-exaggeration-slider', '3.5');
  await page.waitForTimeout(800);

  // 6. Instrument Marker Click-to-Profile (one of each type: argo, buoy, glider, adcp)
  console.log('--- Step 6: Instrument Profile Fetching ---');
  const instruments = await page.evaluate(async () => {
    const res = await fetch('/api/instruments');
    return res.json();
  });
  console.log(`Found ${instruments.length} instruments`);
  const types = ['argo', 'buoy', 'glider', 'adcp'];
  for (const t of types) {
    const match = instruments.find((i) => i.instrument_type === t);
    if (match) {
      console.log(`Opening profile for ${t}: ${match.instrument_id}`);
      await page.evaluate((id) => window.fetchProfile(id), match.instrument_id);
      await page.waitForSelector('#profile-popup', { timeout: 5000 });
      await page.waitForTimeout(1000);
    } else {
      console.warn(`No instrument found for type: ${t}`);
    }
  }

  // 7. Drill into 3D Volumetric Modal
  console.log('--- Step 7: Drill into 3D Modal ---');
  await page.click('#drill-3d-button');
  await page.waitForSelector('#volume-info-panel', { timeout: 10000 });
  await page.waitForTimeout(2000);

  // Switch to isosurface mode
  console.log('Switching 3D to Isosurface mode...');
  await page.click('#render-mode-isosurface');
  await page.waitForTimeout(2000);

  // Switch back to raymarch
  console.log('Switching 3D back to Raymarch mode...');
  await page.click('#render-mode-raymarch');
  await page.waitForTimeout(2000);

  // Close 3D Modal
  console.log('Closing 3D Modal...');
  await page.click('#close-3d-btn');
  await page.waitForTimeout(1000);

  // 8. Guided Tour (all 5 beats, both directions)
  console.log('--- Step 8: Guided Tour ---');
  await page.click('#launch-tour-btn-forecaster');
  await page.waitForSelector('#guided-tour-panel', { timeout: 5000 });
  await page.waitForTimeout(1500);

  for (let i = 1; i <= 4; i++) {
    console.log(`Guided Tour -> Next to Beat ${i + 1}`);
    await page.click('#tour-next-btn');
    await page.waitForTimeout(1500);
  }

  for (let i = 4; i >= 1; i--) {
    console.log(`Guided Tour -> Prev to Beat ${i}`);
    await page.click('#tour-prev-btn');
    await page.waitForTimeout(1000);
  }

  console.log('Exiting Guided Tour...');
  await page.click('#exit-tour-btn');
  await page.waitForTimeout(1000);

  // 9. Forecaster / Public Mode Toggle
  console.log('--- Step 9: Forecaster / Public Mode Toggle ---');
  await page.click('#mode-public-btn');
  await page.waitForTimeout(1000);
  await page.click('#mode-forecaster-btn');
  await page.waitForTimeout(1000);

  console.log('=== NETWORK AUDIT SUMMARY ===');
  console.log(`Total Requests: ${networkRequests.length}`);
  console.log(`Local Requests: ${localRequests.length}`);
  console.log(`External Requests: ${externalRequests.length}`);

  const localHostEndpoints = new Set();
  for (const req of localRequests) {
    localHostEndpoints.add(`${req.method} ${req.pathname}`);
  }
  console.log('\n--- Local / Already Cached Endpoints ---');
  for (const ep of Array.from(localHostEndpoints).sort()) {
    console.log(`  - ${ep}`);
  }

  const externalHosts = new Map();
  for (const req of externalRequests) {
    const count = (externalHosts.get(req.hostname) || 0) + 1;
    externalHosts.set(req.hostname, count);
  }
  console.log('\n--- External / Live Internet Hosts ---');
  for (const [host, count] of externalHosts.entries()) {
    console.log(`  - ${host} (${count} requests)`);
  }

  console.log('\n--- Sample External Request URLs ---');
  for (const req of externalRequests.slice(0, 15)) {
    console.log(`  ${req.method} ${req.url}`);
  }

  await browser.close();
  console.log('Audit completed successfully.');
}

runAudit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
