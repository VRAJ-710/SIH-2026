import { chromium } from 'playwright';
import path from 'path';

const REPO_ROOT = 'c:/Users/Vraj/OneDrive/Attachments/SIH-2026';

async function captureCTD() {
  console.log('Starting CTD Verification Capture...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`[BROWSER ERROR] ${msg.text()}`);
    }
  });

  console.log('Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#wms-panel', { timeout: 15000 });
  await page.waitForTimeout(3000);

  // Verify instruments legend has CTD
  const legendHtml = await page.innerHTML('#instruments-legend');
  console.log('Instruments Legend HTML verified containing CTD:', legendHtml.includes('CTD'));
  if (!legendHtml.includes('CTD')) {
    throw new Error('CTD missing from instruments legend!');
  }

  // Check instrument count loaded in frontend state
  const instrumentCount = await page.evaluate(() => {
    return window.cesiumViewer ? 'Cesium Viewer Ready' : 'Cesium Viewer Not Found';
  });
  console.log('Status:', instrumentCount);

  // Capture map view showing CTD markers and updated 5-instrument legend
  const mapPath = path.join(REPO_ROOT, 'stage_gap_closure_map_ctd.png');
  await page.screenshot({ path: mapPath });
  console.log('Saved map overview screenshot:', mapPath);

  // Click / fetch CTD profile: CTD_BOB_01
  console.log('Opening CTD profile: CTD_BOB_01 ...');
  await page.evaluate(() => {
    if (window.fetchProfile) {
      window.fetchProfile('CTD_BOB_01');
    }
  });

  await page.waitForSelector('#profile-popup', { timeout: 8000 });
  await page.waitForTimeout(2500); // Allow Plotly chart traces & MAE banner to render

  const popupHeader = await page.textContent('#profile-popup');
  console.log('Popup Header includes CTD:', popupHeader.includes('CTD_BOB_01') || popupHeader.includes('ctd'));

  const profilePath = path.join(REPO_ROOT, 'stage_gap_closure_ctd_profile.png');
  await page.screenshot({ path: profilePath });
  console.log('Saved CTD profile screenshot:', profilePath);

  await browser.close();
  console.log('✓ CTD verification screenshot successfully captured!');
}

captureCTD().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
