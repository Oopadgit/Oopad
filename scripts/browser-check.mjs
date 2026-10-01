import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const base = process.env.CHECK_URL || 'http://localhost:5572';
const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
  ? { executablePath: process.env.BROWSER_EXECUTABLE }
  : {});
mkdirSync('artifacts/browser', { recursive: true });
try {
  for (const width of [1366, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const route of ['/', '/agent', '/launch', '/markets', '/docs']) {
      await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      await page.locator('h1').waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width} ${route} overflow`);
      if (route === '/') {
        assert.equal(await page.locator('.opening-token b').innerText(), '$OOPAD');
        await page.getByRole('button', { name: 'Connect wallet', exact: true }).first().click();
        await page.getByRole('dialog').waitFor();
        await page.keyboard.press('Escape');
      }
      await page.screenshot({ path: `artifacts/browser/${width}-${route === '/' ? 'home' : route.slice(1)}.png` });
      assert.deepEqual(errors, [], `${width} ${route} runtime errors`);
      console.log(`PASS ${width} ${route}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
