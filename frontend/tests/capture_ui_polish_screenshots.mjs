import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR = 'C:/Users/Vraj/.gemini/antigravity/brain/bb601694-a616-44d3-b2e7-6e67809cc75c';
const LOCAL_DIR = 'c:/Users/Vraj/OneDrive/Attachments/SIH-2026/frontend/tests/screenshots';

if (!fs.existsSync(LOCAL_DIR)) {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
}

async function captureScreenshots() {
  console.log('===============================================================');
  console.log('CAPTURING 5 SESSION-DATED UI POLISH SCREENSHOTS');
  console.log('===============================================================');

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  console.log('\nNavigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#wms-panel', { timeout: 12000 });
  await page.waitForTimeout(4000); // Allow globe to render

  const saveShot = async (name) => {
    const localPath = path.join(LOCAL_DIR, `${name}.png`);
    const artPath = path.join(ARTIFACT_DIR, `${name}.png`);
    await page.screenshot({ path: localPath });
    fs.copyFileSync(localPath, artPath);
    console.log(`✓ Saved screenshot: ${name}.png`);
  };

  // 1. Sidebar Collapsed View
  console.log('1. Capturing Sidebar Collapsed state...');
  await page.evaluate(() => {
    if (window.setSidebarOpen) {
      window.setSidebarOpen(false);
    }
  });
  await page.waitForTimeout(1000);
  await saveShot('stage_ui_polish_20260920_sidebar_collapsed');

  // 2. Sidebar Expanded View (Hover to open)
  console.log('2. Hovering over #sidebar-collapsed-tab to open sidebar...');
  await page.hover('#sidebar-collapsed-tab');
  await page.waitForTimeout(1000);
  await saveShot('stage_ui_polish_20260920_sidebar_expanded');

  // Test closing via X button
  console.log('Testing close via #collapse-sidebar-btn...');
  await page.click('#collapse-sidebar-btn');
  await page.waitForTimeout(800);
  const isTabVisibleAfterClose = await page.isVisible('#sidebar-collapsed-tab');
  console.log(`  Sidebar collapsed successfully, tab visible: ${isTabVisibleAfterClose}`);

  // Re-open by hover
  console.log('Re-opening sidebar by hover...');
  await page.hover('#sidebar-collapsed-tab');
  await page.waitForTimeout(800);

  // 3. Guided Tour View
  console.log('3. Capturing Guided Tour panel...');
  await page.click('#launch-tour-btn-forecaster');
  await page.waitForSelector('#guided-tour-panel', { timeout: 5000 });
  await page.waitForTimeout(2000);
  await saveShot('stage_ui_polish_20260920_guided_tour');
  await page.click('#exit-tour-btn');
  await page.waitForTimeout(1000);

  // 4. 3D Volumetric Overlay View
  console.log('4. Capturing 3D Volumetric Overlay view...');
  // Ensure sidebar is open before clicking drill
  await page.evaluate(() => {
    if (window.setSidebarOpen) {
      window.setSidebarOpen(true, true);
    }
  });
  await page.waitForTimeout(500);
  await page.click('#drill-3d-button');
  await page.waitForSelector('#volume-info-panel', { timeout: 10000 });
  await page.waitForTimeout(2500);
  await saveShot('stage_ui_polish_20260920_volumetric_overlay');
  await page.click('#close-3d-btn');
  await page.waitForTimeout(1000);

  // 5. Instrument Profile View
  console.log('5. Capturing Instrument Profile popup with custom external legend...');
  const instruments = await page.evaluate(async () => {
    const res = await fetch('/api/instruments');
    return res.json();
  });
  const argo = instruments.find((i) => i.instrument_type === 'argo');
  if (argo) {
    await page.evaluate((id) => window.fetchProfile(id), argo.instrument_id);
    await page.waitForSelector('#profile-popup', { timeout: 6000 });
    await page.waitForTimeout(1500);
    await saveShot('stage_ui_polish_20260920_instrument_profile');
    await page.click('#profile-close-btn');
  }

  await browser.close();
  console.log('\nAll 5 screenshots captured and archived successfully.');
}

captureScreenshots().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
