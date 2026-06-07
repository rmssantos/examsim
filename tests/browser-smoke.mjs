import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  const requests = [];
  page.on('request', (request) => {
    requests.push(new URL(request.url()).pathname);
  });

  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.ExamApp?.examsLoadedPromise));
  await page.evaluate(() => window.ExamApp.examsLoadedPromise);

  assert.equal(await page.locator('main#main-content').count(), 1);
  assert.equal(await page.locator('a.skip-link[href="#main-content"]').count(), 1);
  assert.ok(await page.locator('.exam-card').count() >= 6);
  assert.equal(
    requests.filter((path) => path.endsWith('/dump.json')).length,
    0,
    'Homepage startup must not download question dumps.'
  );

  const az900Card = page.locator('.exam-card[data-exam="az900"]');
  assert.equal(await az900Card.count(), 1);
  await az900Card.click();
  await page.waitForFunction(() => window.userExams?.az900?.loaded === true);
  assert.equal(
    requests.filter((path) => path.endsWith('/az900/dump.json')).length,
    1,
    'Selecting a bundled exam must load its dump exactly once.'
  );
  assert.equal(await page.locator('#exam-details-placeholder.visible').count(), 1);

  await page.goto(`${baseUrl}/editor.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const select = document.querySelector('#examSelect');
    return select && select.options.length >= 6 && !select.disabled;
  });
  assert.equal(await page.locator('main#main-content').count(), 1);
  assert.equal(await page.locator('#examSelect').count(), 1);
  const editorSkipLink = page.locator('a.skip-link[href="#main-content"]');
  const hiddenSkipBox = await editorSkipLink.boundingBox();
  assert.ok(hiddenSkipBox && hiddenSkipBox.y < 0, 'Editor skip link must be hidden until focused.');
  await editorSkipLink.focus();
  const focusedSkipBox = await editorSkipLink.boundingBox();
  assert.ok(focusedSkipBox && focusedSkipBox.y >= 0, 'Focused skip link must be visible.');

  console.log('Browser smoke passed.');
} finally {
  await browser.close();
}
