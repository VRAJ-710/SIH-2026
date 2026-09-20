import { chromium } from 'playwright';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/Vraj/.gemini/antigravity/brain/bb601694-a616-44d3-b2e7-6e67809cc75c';

async function capture() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#wms-panel', { timeout: 12000 });
  await page.waitForTimeout(2000);

  // 1. Ensure sidebar is open and pinned
  await page.evaluate(() => {
    if (window.setSidebarOpen) {
      window.setSidebarOpen(true, true);
    }
  });
  await page.waitForTimeout(1000);

  // 2. Capture Live Data Stub toggle in Forecaster Mode
  console.log('Capturing Live Data Stub toggle...');
  await page.waitForSelector('#live-data-stub-card', { timeout: 5000 });
  const liveStubPath = path.join(ARTIFACT_DIR, 'stage_differentiators_live_stub.png');
  await page.screenshot({ path: liveStubPath });
  console.log('Saved:', liveStubPath);

  // 3. Open Argo float profile (2901892)
  console.log('Opening Argo Float 2901892 profile...');
  await page.evaluate(() => {
    if (window.fetchProfile) {
      window.fetchProfile('2901892');
    }
  });

  await page.waitForSelector('#profile-popup', { timeout: 8000 });
  await page.waitForSelector('#profile-model-mae-banner', { timeout: 8000 });
  await page.waitForTimeout(2000); // Allow Plotly to finish rendering traces

  const modelValidationPath = path.join(ARTIFACT_DIR, 'stage_differentiators_model_validation.png');
  await page.screenshot({ path: modelValidationPath });
  console.log('Saved:', modelValidationPath);

  // 4. Also capture deep float (2902235) to verify partial availability rendering
  console.log('Opening Deep Argo Float 2902235 profile...');
  await page.evaluate(() => {
    if (window.fetchProfile) {
      window.fetchProfile('2902235');
    }
  });
  await page.waitForTimeout(2500);

  const deepFloatValidationPath = path.join(ARTIFACT_DIR, 'stage_differentiators_deep_float_validation.png');
  await page.screenshot({ path: deepFloatValidationPath });
  console.log('Saved:', deepFloatValidationPath);

  await browser.close();
  console.log('All differentiator screenshots captured successfully.');
}

capture().catch((err) => {
  console.error('Error capturing screenshots:', err);
  process.exit(1);
});
