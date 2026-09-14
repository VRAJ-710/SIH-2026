import { chromium } from 'playwright';
import path from 'path';

const artifactsDir = 'C:/Users/Vraj/.gemini/antigravity-ide/brain/bb7e9d2b-6f6f-40f2-b78e-dc0a1cc9daf5';

async function run() {
  console.log('--- STARTING COMPREHENSIVE SPIKE VERIFICATION ---');

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
    viewport: { width: 1280, height: 800 },
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

  // 1. Open /dev/volumetric-spike
  console.log('Step 1: Navigating to http://localhost:5173/dev/volumetric-spike');
  await page.goto('http://localhost:5173/dev/volumetric-spike', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 2. Report console logs & errors
  console.log('Step 2: Checking console logs');
  console.log('Page Errors:', JSON.stringify(errors));
  console.log('Console Logs count:', consoleLogs.length);
  console.log('Console Logs:', JSON.stringify(consoleLogs));

  // Screenshot initial raymarch
  const shot1 = path.join(artifactsDir, 'raymarch-initial.png');
  await page.screenshot({ path: shot1 });
  console.log('Screenshot 1 saved:', shot1);

  // 3. OrbitControls rotation test
  console.log('Step 3: OrbitControls rotation');
  const canvas = await page.$('canvas');
  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      const startX = box.x + box.width / 2;
      const startY = box.y + box.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 180, startY - 80, { steps: 15 });
      await page.mouse.up();
      await page.waitForTimeout(600);
    }
  }
  const shot2 = path.join(artifactsDir, 'raymarch-rotated.png');
  await page.screenshot({ path: shot2 });
  console.log('Screenshot 2 saved (rotated):', shot2);

  // 4. OrbitControls zoom test
  console.log('Step 4: OrbitControls zoom test');
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(600);
  const shot3 = path.join(artifactsDir, 'raymarch-zoomed.png');
  await page.screenshot({ path: shot3 });
  console.log('Screenshot 3 saved (zoomed):', shot3);

  // 8. FPS Counter check (read multiple times)
  console.log('Step 8: Reading FPS counter across time');
  const getFpsText = async () => {
    return await page.evaluate(() => {
      const el = document.querySelector('body');
      return el ? el.innerText : '';
    });
  };

  const text1 = await getFpsText();
  await page.waitForTimeout(600);
  const text2 = await getFpsText();
  await page.waitForTimeout(600);
  const text3 = await getFpsText();
  console.log('Text snapshot 1:\n', text1);
  console.log('Text snapshot 2:\n', text2);
  console.log('Text snapshot 3:\n', text3);

  // 6. Raymarch slider move
  console.log('Step 6: Move slider in Raymarch mode');
  const slider = await page.$('input[type="range"]');
  if (slider) {
    await slider.fill('29.2');
    await slider.dispatchEvent('input');
    await slider.dispatchEvent('change');
    await page.waitForTimeout(600);
  }
  const shot4 = path.join(artifactsDir, 'raymarch-slider-29_2.png');
  await page.screenshot({ path: shot4 });
  console.log('Screenshot 4 saved (raymarch slider 29.2):', shot4);

  // 5. Toggle to Isosurface mode
  console.log('Step 5: Toggle to Isosurface mode');
  const mcButton = await page.getByRole('button', { name: 'Marching Cubes' });
  if (mcButton) {
    await mcButton.click();
    await page.waitForTimeout(1000);
  }
  const shot5 = path.join(artifactsDir, 'isosurface-initial.png');
  await page.screenshot({ path: shot5 });
  console.log('Screenshot 5 saved (isosurface):', shot5);

  // 7. Isosurface slider adjustment
  console.log('Step 7: Adjust threshold slider in Isosurface mode');
  if (slider) {
    await slider.fill('28.5');
    await slider.dispatchEvent('input');
    await slider.dispatchEvent('change');
    await page.waitForTimeout(800);
  }
  const shot6 = path.join(artifactsDir, 'isosurface-threshold-28_5.png');
  await page.screenshot({ path: shot6 });
  console.log('Screenshot 6 saved (isosurface threshold 28.5):', shot6);

  if (slider) {
    await slider.fill('29.4');
    await slider.dispatchEvent('input');
    await slider.dispatchEvent('change');
    await page.waitForTimeout(800);
  }
  const shot7 = path.join(artifactsDir, 'isosurface-threshold-29_4.png');
  await page.screenshot({ path: shot7 });
  console.log('Screenshot 7 saved (isosurface threshold 29.4):', shot7);

  // 9. Navigate to default route http://localhost:5173/
  console.log('Step 9: Navigate to http://localhost:5173/');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const shot8 = path.join(artifactsDir, 'default-route.png');
  await page.screenshot({ path: shot8 });
  console.log('Screenshot 8 saved (default route):', shot8);

  await browser.close();
  console.log('--- VERIFICATION COMPLETED SUCCESSFULLY ---');
}

run().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
