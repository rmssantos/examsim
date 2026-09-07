// Serve the built local edition at its former approved HTTPS origin entirely
// inside Playwright. No request may reach the real hosted service or telemetry.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '_site');
const origin = 'https://examplar.app';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const external = [], posts = [], errors = [];
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { external.push(url.href); return route.abort(); }
    if (request.method() !== 'GET') { posts.push(url.pathname); return route.abort(); }
    let pathname = decodeURIComponent(url.pathname);
    if (['/exam', '/study', '/editor', '/roadmaps'].includes(pathname)) {
      pathname = pathname === '/study' ? '/exam.html' : `${pathname}.html`;
    }
    let file = path.resolve(root, `.${pathname}`);
    assert.ok(file.startsWith(root + path.sep) || file === root);
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      return route.fulfill({ status: 200, contentType: types[path.extname(file)] || 'application/octet-stream', body: await readFile(file) });
    } catch { return route.fulfill({ status: 404, body: 'Not found' }); }
  });
  // A previously opted-in browser and incoming ad identifiers must not activate
  // a hidden client or propagate attribution into a deliberate external link.
  await context.addInitScript(() => localStorage.setItem('exam_analytics_opt_out', 'false'));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/?utm_source=google_ads&gclid=Privacy_Regression-123`);
  await page.waitForFunction(() => Boolean(window.ExamApp?.examsLoadedPromise));
  await page.evaluate(() => window.ExamApp.examsLoadedPromise);
  const telemetryRuntime = await page.evaluate(() => ({
    client: typeof window.ExamApp.analytics,
    sources: [...document.scripts].map(script => script.src),
    stored: Object.keys(sessionStorage)
  }));
  assert.equal(telemetryRuntime.client, 'undefined', 'The local edition must not install a dormant telemetry client, even at a formerly approved HTTPS host.');
  assert.ok(telemetryRuntime.sources.every(src => !/analytics/i.test(src)));
  assert.ok(telemetryRuntime.stored.every(key => !/analytics|google_ads/i.test(key)));
  await page.locator('.exam-card[data-exam="ai103"] .exam-card-unlock').click();
  assert.equal(await page.locator('.pro-modal-buy').getAttribute('href'), `${origin}/exams/ai103/`);
  await page.locator('.pro-modal-close').click();

  const fixture = JSON.parse(await readFile(path.join(root, 'user-content/exams/sc900/dump.json'), 'utf8'));
  const questions = Array.isArray(fixture) ? fixture : fixture.questions;
  await page.evaluate(async question => {
    await window.homepage.handleFiles([new File([JSON.stringify([question])], 'local-privacy.json', { type: 'application/json' })]);
  }, questions[0]);
  assert.equal(await page.locator('.exam-card[data-exam="local-privacy"]').count(), 1);
  await page.goto(`${origin}/exam.html?exam=az900&session=diagnostic&count=10`);
  await page.waitForFunction(() => (window.ExamApp?.examSimulator || window.examSimulator)?.getCurrentQuestions?.().length === 10);
  await page.evaluate(() => {
    const sim = window.ExamApp.examSimulator || window.examSimulator;
    sim.handleAnswerChanged();
    if (!sim.touchedQuestions.has(0)) throw new Error('Answer interaction was lost');
    sim.finishExam(true);
  });
  assert.equal(await page.locator('#results-screen.active').count(), 1);
  await page.goto(`${origin}/exam.html?exam=az900&mode=study`);
  await page.waitForFunction(() => (window.ExamApp?.examSimulator || window.examSimulator)?.getCurrentQuestions?.().length > 0);
  await page.evaluate(async () => {
    const sim = window.ExamApp.examSimulator || window.examSimulator;
    if (!sim.isStudyMode()) throw new Error('Study mode did not start');
    sim.handleAnswerChanged();
    await sim.finishStudySession();
  });
  await page.goto(`${origin}/editor.html?exam=sc900`);
  await page.locator('#exportJson').waitFor();
  await page.locator('#importJson').click();
  await page.locator('#fileInput').setInputFiles({ name: 'local-editor.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([questions[0]])) });
  const exported = page.waitForEvent('download');
  await page.locator('#exportJson').click();
  assert.match((await exported).suggestedFilename(), /\.json$/);
  await page.goto(`${origin}/roadmaps.html`);
  await page.waitForFunction(() => window.Roadmaps?.ready === true);
  assert.deepEqual(external, [], 'Local practice/import/editor/study must emit no cross-origin requests.');
  assert.deepEqual(posts, [], 'Local practice must emit no network POSTs.');
  assert.deepEqual(errors, [], 'Removing instrumentation must preserve runtime execution.');
  console.log('Local privacy browser: HTTPS practice/import/study/editor/roadmaps emit no telemetry; external links stay clean.');
  await context.close();
} finally { await browser.close(); }
