import { chromium } from 'playwright';
import path from 'path';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 } // 9:16 portrait
  });
  const page = await context.newPage();

  console.log('🚀 [E2E] Navigating to Cocos Web Preview...');
  // Ensure your Cocos Creator preview is running on port 7456
  await page.goto('http://localhost:7456');

  console.log('⏳ [E2E] Waiting for Cocos Engine to Boot...');
  await page.waitForTimeout(5000);

  // Take screenshot of boot
  await page.screenshot({ path: 'e2e_boot.png' });

  console.log('✅ [E2E] QA Hook Injected. Testing Gameplay...');
  const state = await page.evaluate(() => {
    return window.__BHR_QA__ ? window.__BHR_QA__.snapshot() : null;
  });
  console.log('Snapshot:', state);

  console.log('🎯 [E2E] Simulating Drag (Suction)...');
  await page.mouse.move(180, 500);
  await page.mouse.down();
  await page.mouse.move(180, 400, { steps: 10 });
  await page.waitForTimeout(1000);
  await page.mouse.move(100, 400, { steps: 10 });
  await page.waitForTimeout(1000);
  await page.mouse.up();

  await page.screenshot({ path: 'e2e_drag_suction.png' });

  console.log('🔄 [E2E] Triggering Evolution...');
  await page.evaluate(() => {
    if (window.__BHR_QA__) {
      window.__BHR_QA__.triggerEvolve();
    }
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'e2e_evolve.png' });

  console.log('✅ [E2E] Test Suite Completed Successfully.');
  await browser.close();
})();
