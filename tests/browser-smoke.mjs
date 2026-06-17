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

  // Regression: the roadmap entry links must resolve to the roadmaps page, never the home page.
  // The router maps the 'roadmaps' route to /roadmaps (clean URL) or roadmaps.html (file mode).
  const roadmapNavHref = await page.locator('.cr-topnav-links a', { hasText: 'Roadmaps' }).getAttribute('href');
  assert.ok(roadmapNavHref && /roadmaps(\.html)?$/.test(roadmapNavHref),
    `Topnav Roadmaps link must resolve to the roadmaps page, got "${roadmapNavHref}".`);
  const roadmapCardHref = await page.locator('a.roadmap-entry-card').getAttribute('href');
  assert.ok(roadmapCardHref && /roadmaps(\.html)?$/.test(roadmapCardHref),
    `Career roadmaps card must resolve to the roadmaps page, got "${roadmapCardHref}".`);

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
  // The first question may be any schema (the order is randomized), so wait on
  // the loaded question set rather than on `.option`, which only STANDARD/MULTI
  // render. We navigate to a STANDARD/MULTI question explicitly below.
  await page.waitForFunction(() => {
    const sim = window.ExamApp?.examSimulator || window.examSimulator;
    return Boolean(sim) && typeof sim.getCurrentQuestions === 'function'
      && sim.getCurrentQuestions().length > 0;
  }, null, { timeout: 15000 });
  const examTotal = await page.evaluate(() => {
    const sim = window.ExamApp?.examSimulator || window.examSimulator;
    return sim.getCurrentQuestions().length;
  });

  // Drive a STANDARD/MULTI question so the visible option label exists regardless
  // of the randomized question order.
  const idx = await page.evaluate(() => {
    const sim = window.ExamApp?.examSimulator || window.examSimulator;
    const qs = sim.getCurrentQuestions();
    const gradeIdx = qs.findIndex((q) => {
      const t = window.ExamApp.normalizeQuestionType(q);
      return t === 'STANDARD' || t === 'MULTI';
    });
    const revealIdx = qs.findIndex((_, i) => i !== gradeIdx);
    sim.showQuestion(gradeIdx);
    return { gradeIdx, revealIdx };
  });
  assert.ok(idx.gradeIdx >= 0, 'Expected at least one STANDARD/MULTI question to drive.');

  // Answer it (the label is the visible control; the native input is hidden).
  await page.locator('.option label').first().click();
  await page.locator('#show-answer-btn').click();
  await page.waitForSelector('#answer-feedback:not([hidden])', { timeout: 5000 });
  const gradedStatus = (await page.locator('#answer-feedback .feedback-status').innerText()).trim();
  assert.ok(/correct!?|incorrect/i.test(gradedStatus), 'Revealing an answered question must show a graded result.');

  // Reveal a different, untouched question -> neutral state, not "Incorrect".
  await page.evaluate((i) => {
    const sim = window.ExamApp?.examSimulator || window.examSimulator;
    sim.showQuestion(i);
  }, idx.revealIdx);
  await page.waitForTimeout(150);
  await page.locator('#show-answer-btn').click();
  await page.waitForSelector('#answer-feedback:not([hidden])', { timeout: 5000 });
  const revealedStatus = (await page.locator('#answer-feedback .feedback-status').innerText()).trim();
  assert.ok(/revealed/i.test(revealedStatus), 'Show Answer before attempting must read as a neutral reveal.');
  assert.ok(!/incorrect/i.test(revealedStatus), 'Show Answer before attempting must not be labelled Incorrect.');

  // SEQUENCE answers auto-initialize on render, so a non-empty array alone is not
  // an attempt: an untouched sequence must not count, a touched one must.
  const seq = await page.evaluate(() => {
    const sim = window.ExamApp?.examSimulator || window.examSimulator;
    const qs = sim.getCurrentQuestions();
    const i = qs.findIndex((q) => window.ExamApp.normalizeQuestionType(q) === 'SEQUENCE');
    if (i < 0) return { found: false };
    const priorAnswer = sim.selectedAnswers[i];
    const priorTouched = sim.touchedQuestions.has(i);
    sim.selectedAnswers[i] = qs[i].options.map((_, k) => k); // simulate the auto-init order
    sim.touchedQuestions.delete(i);
    const untouched = sim.wasAttempted(i);
    sim.touchedQuestions.add(i);
    const touched = sim.wasAttempted(i);
    if (priorAnswer === undefined) delete sim.selectedAnswers[i];
    else sim.selectedAnswers[i] = priorAnswer;
    if (priorTouched) sim.touchedQuestions.add(i);
    else sim.touchedQuestions.delete(i);
    return { found: true, untouched, touched };
  });
  if (seq.found) {
    assert.equal(seq.untouched, false, 'An untouched SEQUENCE question must not count as attempted.');
    assert.equal(seq.touched, true, 'A touched SEQUENCE question must count as attempted.');
  }

  // YES_NO_MATRIX rows start undefined: an empty matrix is skipped, but a
  // partially answered one is a real (incorrect) attempt, not skipped.
  const matrix = await page.evaluate(() => {
    const sim = window.ExamApp?.examSimulator || window.examSimulator;
    const qs = sim.getCurrentQuestions();
    const i = qs.findIndex((q) => window.ExamApp.normalizeQuestionType(q) === 'YES_NO_MATRIX');
    if (i < 0) return { found: false };
    const rows = Array.isArray(qs[i].statements) ? qs[i].statements.length : 2;
    const prior = sim.selectedAnswers[i];
    sim.selectedAnswers[i] = new Array(rows).fill(undefined);
    const empty = sim.wasAttempted(i);
    const partial = new Array(rows).fill(undefined);
    partial[0] = 0;
    sim.selectedAnswers[i] = partial;
    const partialAttempted = sim.wasAttempted(i);
    if (prior === undefined) delete sim.selectedAnswers[i];
    else sim.selectedAnswers[i] = prior;
    return { found: true, empty, partialAttempted };
  });
  if (matrix.found) {
    assert.equal(matrix.empty, false, 'An unanswered YES/NO matrix must not count as attempted.');
    assert.equal(matrix.partialAttempted, true, 'A partially answered YES/NO matrix must count as attempted.');
  }

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

  // Career roadmaps: seed local progress, then verify node states + up-next + structure.
  await page.goto(`${baseUrl}/roadmaps.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('az900_progress', JSON.stringify({ attempts: [{ score: 92, passed: true }], bestScore: 92, totalPassed: 1 }));
    localStorage.setItem('az104_progress', JSON.stringify({ attempts: [{ score: 40, passed: false }], bestScore: 40, totalPassed: 0 }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.Roadmaps && window.Roadmaps.ready === true, null, { timeout: 8000 });

  assert.equal(await page.locator('.roadmap-track-card').count(), 6, 'Six career tracks must render.');

  // Cloud Administrator is first: az900 passed (92%), az104 started (40%), az305 not started.
  // Up-next is the FIRST non-passed node in track order, which is az104 (started), not az305.
  assert.equal(await page.locator('.roadmap-node[data-pack="az900"].is-passed').count(), 1, 'az900 must render as passed.');
  assert.match(
    await page.locator('.roadmap-node[data-pack="az900"] .rn-best').innerText(),
    /92%/, 'Passed node must show the same Best% the home reads from the shared progress record.'
  );
  assert.equal(await page.locator('.roadmap-node[data-pack="az104"].is-started').count(), 1, 'az104 must render as started.');
  assert.equal(await page.locator('.roadmap-node[data-pack="az104"].is-next').count(), 1, 'First non-passed node (az104) must be marked up-next.');
  assert.equal(await page.locator('.roadmap-node[data-pack="az305"].is-next').count(), 0, 'A node after the first non-passed must not be up-next.');

  // DevOps track: az104 carries the prerequisite pill before az400.
  await page.locator('.roadmap-track-card[data-track="devops"]').click();
  await page.waitForFunction(() => document.querySelector('.roadmap-node[data-pack="az400"]'));
  assert.equal(
    await page.locator('.roadmap-node[data-pack="az104"] .rn-pill.is-prereq').count(), 1,
    'AZ-104 must show the Prerequisite pill in the DevOps track.'
  );

  // Expanding a node reveals the exam details panel (mirrors the home exam-details content).
  await page.locator('.roadmap-node[data-pack="az104"] .rn-expand').click();
  await page.waitForSelector('.roadmap-node[data-pack="az104"] .rn-details:not([hidden])', { timeout: 2000 });
  assert.match(
    await page.locator('.roadmap-node[data-pack="az104"] .rn-details').innerText(),
    /Exam information/i, 'Expanding a node must reveal the exam details panel.'
  );

  // Pro node: "Unlock full" opens the pro modal (highlights + Gumroad + import/license
  // instruction), instead of jumping straight to Gumroad.
  await page.locator('.roadmap-node[data-pack="az400"] .rn-unlock').click();
  await page.waitForSelector('#pro-modal-overlay', { timeout: 2000 });
  const proBuyHref = await page.locator('#pro-modal-overlay .pro-modal-buy').getAttribute('href');
  assert.ok(proBuyHref && proBuyHref.includes('gumroad'), `Pro modal must link to Gumroad, got "${proBuyHref}".`);
  assert.equal(
    await page.locator('#pro-modal-overlay .pro-modal-activate-text').count(), 1,
    'Pro modal must include the import/license-key instruction (not a bare Gumroad jump).'
  );
  await page.locator('#pro-modal-overlay .pro-modal-close').click();

  // Dark mode toggle works on the roadmaps page.
  const wasDark = await page.evaluate(() => document.body.classList.contains('dark-mode'));
  await page.locator('#theme-toggle').click();
  assert.notEqual(
    await page.evaluate(() => document.body.classList.contains('dark-mode')), wasDark,
    'Theme toggle must flip dark mode on the roadmaps page.'
  );

  // Pure-function contract: deriveNodeState uses a flat 70% on bestScore (matches the app).
  const states = await page.evaluate(() => [
    window.Roadmaps.deriveNodeState({ attempts: [], bestScore: 0 }),
    window.Roadmaps.deriveNodeState({ attempts: [{}], bestScore: 55 }),
    window.Roadmaps.deriveNodeState({ attempts: [{}], bestScore: 80 })
  ]);
  assert.deepEqual(states, ['not-started', 'started', 'passed'], 'deriveNodeState must map progress to state.');

  console.log('Browser smoke passed.');
} finally {
  await browser.close();
}
