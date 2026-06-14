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

  // Regression guard: the expanded "Exam coverage" section was populated but hidden by
  // `is-hidden` (display:none !important) while JS only toggled inline style.display.
  // Assert it actually renders Covered Modules + Study Resources for a pack that lists them.
  const coverage = await page.evaluate(() => {
    const section = document.getElementById('details-modules-section');
    const resources = document.getElementById('details-resources-list');
    return {
      sectionExists: Boolean(section),
      resourcesExists: Boolean(resources),
      display: section ? getComputedStyle(section).display : 'missing',
      resourceLinks: resources ? resources.querySelectorAll('a').length : 0,
    };
  });
  // Assert the elements exist first, so a removed/renamed id fails loudly instead of
  // silently passing (a missing element would report display 'missing', still != 'none').
  assert.ok(coverage.sectionExists, 'Expanded exam coverage section (#details-modules-section) must exist.');
  assert.ok(coverage.resourcesExists, 'Study resources list (#details-resources-list) must exist.');
  assert.notEqual(coverage.display, 'none', 'Expanded exam coverage (modules + study resources) must be visible.');
  assert.ok(coverage.resourceLinks >= 1, 'Study Resources must render links when the exam metadata lists resources.');

  // Exam runtime regressions:
  //  - the results "Questions answered" stat must report answered/total, not the bank size;
  //  - "Show Answer" before attempting a question must read as a neutral reveal, not "Incorrect".
  await page.goto(`${baseUrl}/exam.html?exam=az900`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const sim = window.ExamApp?.examSimulator || window.examSimulator;
    return sim && typeof sim.getCurrentQuestions === 'function'
      && sim.getCurrentQuestions().length > 0
      && document.querySelectorAll('.option').length > 0;
  }, null, { timeout: 15000 });
  const examTotal = await page.evaluate(() => {
    const sim = window.ExamApp?.examSimulator || window.examSimulator;
    return sim.getCurrentQuestions().length;
  });

  // Answer one question (the label is the visible control; the native input is hidden).
  await page.locator('.option label').first().click();
  await page.locator('#show-answer-btn').click();
  await page.waitForSelector('#answer-feedback:not([hidden])', { timeout: 5000 });
  const gradedStatus = (await page.locator('#answer-feedback .feedback-status').innerText()).trim();
  assert.ok(/correct!?|incorrect/i.test(gradedStatus), 'Revealing an answered question must show a graded result.');

  // Reveal a fresh question without answering -> neutral state, not "Incorrect".
  await page.locator('#next-btn').click();
  await page.waitForTimeout(200);
  await page.locator('#show-answer-btn').click();
  await page.waitForSelector('#answer-feedback:not([hidden])', { timeout: 5000 });
  const revealedStatus = (await page.locator('#answer-feedback .feedback-status').innerText()).trim();
  assert.ok(/revealed/i.test(revealedStatus), 'Show Answer before attempting must read as a neutral reveal.');
  assert.ok(!/incorrect/i.test(revealedStatus), 'Show Answer before attempting must not be labelled Incorrect.');

  // Finish with exactly one answered -> "Questions answered" reads answered/total.
  await page.evaluate(() => {
    const sim = window.ExamApp?.examSimulator || window.examSimulator;
    sim.finishExam(true);
  });
  await page.waitForFunction(() => {
    const s = document.getElementById('results-screen');
    return s && !s.hidden;
  }, null, { timeout: 8000 });
  const answeredText = await page.evaluate(() => document.getElementById('total-questions-result')?.textContent);
  assert.equal(answeredText, `1/${examTotal}`, 'Results "Questions answered" must show answered/total, not the bank size.');

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

  // Built-in pack edits must not contradict the read-only banner: viewing is clean,
  // and editing reports an "unsaved (saves as a copy)" state, not a plain warning.
  const builtinId = await page.evaluate(() => {
    const select = document.querySelector('#examSelect');
    const values = Array.from(select.options).map((o) => o.value);
    return values.includes('az900') ? 'az900' : values.find((v) => v && v !== 'custom');
  });
  await page.selectOption('#examSelect', builtinId);
  await page.waitForFunction(() => {
    const banner = document.getElementById('builtin-readonly-banner');
    return banner && getComputedStyle(banner).display !== 'none';
  }, null, { timeout: 5000 });
  assert.match(
    (await page.locator('#editorSaveState span').innerText()).trim(),
    /no unsaved/i,
    'Viewing a built-in pack must not report unsaved edits.'
  );
  await page.locator('#qText').click();
  await page.locator('#qText').type(' (edit)');
  await page.waitForFunction(
    () => /saves as a copy/i.test(document.querySelector('#editorSaveState span')?.textContent || ''),
    null,
    { timeout: 5000 }
  );

  console.log('Browser smoke passed.');
} finally {
  await browser.close();
}
