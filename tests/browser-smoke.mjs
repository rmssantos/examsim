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

  await page.evaluate(() => {
    const ensureExamLoaded = window.ExamApp.ensureExamLoaded.bind(window.ExamApp);
    let releaseLoad;
    const loadGate = new Promise((resolve) => {
      releaseLoad = resolve;
    });
    window.__popupTest = {
      calls: [],
      windows: [],
      loadStarted: false,
      releaseLoad
    };
    window.ExamApp.ensureExamLoaded = async (...args) => {
      window.__popupTest.loadStarted = true;
      await loadGate;
      return ensureExamLoaded(...args);
    };
    window.open = (url, target) => {
      const popup = {
        location: { href: url },
        closed: false,
        close() { this.closed = true; }
      };
      window.__popupTest.calls.push({ url, target });
      window.__popupTest.windows.push(popup);
      return popup;
    };
  });

  const sc900Start = page.locator('.exam-card[data-exam="sc900"] .exam-card-start');
  await sc900Start.click();
  await page.waitForFunction(() => window.__popupTest.calls.length === 1, null, { timeout: 1500 });
  assert.equal(
    await page.evaluate(() => window.__popupTest.calls[0].url),
    '',
    'Start must reserve a blank tab before awaiting the question dump.'
  );
  assert.equal(
    await page.evaluate(() => window.__popupTest.loadStarted),
    true,
    'Exam loading must start after the popup is reserved.'
  );
  await page.evaluate(() => window.__popupTest.releaseLoad());
  await page.waitForFunction(() => window.userExams?.sc900?.loaded === true);
  await page.waitForFunction(() => window.__popupTest.windows[0].location.href.includes('exam=sc900'));

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
