import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR = 'C:/Users/Vraj/.gemini/antigravity/brain/bb601694-a616-44d3-b2e7-6e67809cc75c';
const LOCAL_DIR = 'c:/Users/Vraj/OneDrive/Attachments/SIH-2026/frontend/tests/screenshots';

if (!fs.existsSync(LOCAL_DIR)) {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
}

async function captureTrimmedReview() {
  console.log('Capturing trimmed UI review screenshot...');

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#wms-panel', { timeout: 12000 });
  await page.waitForTimeout(3500); // Globe render

  // Hover over collapsed tab to open sidebar
  console.log('Hovering to open sidebar...');
  await page.hover('#sidebar-collapsed-tab');
  await page.waitForTimeout(1000);

  const localPath = path.join(LOCAL_DIR, 'stage_ui_polish_20260920_trimmed_review.png');
  const artPath = path.join(ARTIFACT_DIR, 'stage_ui_polish_20260920_trimmed_review.png');
  await page.screenshot({ path: localPath });
  fs.copyFileSync(localPath, artPath);
  console.log('✓ Saved screenshot: stage_ui_polish_20260920_trimmed_review.png');

  // Verify full_ci_walkthrough compatibility
  const varLabel = await page.textContent('#active-variable-label');
  const depthLabel = await page.textContent('#current-depth-label');
  const legendLabel = await page.textContent('#legend-range-label');
  console.log(`DOM accessibility test:`);
  console.log(`  active-variable-label: "${varLabel.trim()}"`);
  console.log(`  current-depth-label: "${depthLabel.trim()}"`);
  console.log(`  legend-range-label: "${legendLabel.trim()}"`);

  await browser.close();
}

captureTrimmedReview().catch((err) => {
  console.error('Failed to capture review screenshot:', err);
  process.exit(1);
});
