import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const JSZipFixture = require('../assets/vendor/jszip/jszip.min.js');
const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext();
  const page = await context.newPage();
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

  // Bundled exams start as metadata-only records. Validated labCount must expose
  // their free lab before dump.json loads, while packs without labs stay clean.
  for (const examId of ['az104', 'ab620']) {
    const labAction = page.locator(`.exam-card[data-exam="${examId}"] .exam-card-labs`);
    assert.equal(await labAction.count(), 1, `${examId} must advertise its free lab.`);
    assert.match(await labAction.innerText(), /1 free \/ 8 Complete/);
    assert.equal(await labAction.evaluate((element) => element.tagName), 'A');
  }
  assert.equal(
    await page.locator('.exam-card[data-exam="sc900"] .exam-card-labs').count(),
    0,
    'A pack without labs must not render a dead lab action.'
  );

  await page.locator('#library-filter-labs').evaluate((select) => {
    select.value = 'available';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelectorAll('#exam-selection .exam-card').length === 2);
  assert.deepEqual(
    await page.locator('#exam-selection .exam-card').evaluateAll((cards) => cards.map((card) => card.dataset.exam).sort()),
    ['ab620', 'az104'],
    'The hands-on labs filter must include only packs with accessible or advertised labs.'
  );
  await page.locator('#library-filter-labs').evaluate((select) => {
    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelectorAll('#exam-selection .exam-card').length >= 15);

  const atomicImageContract = await page.evaluate(async () => {
    const examId = 'security-atomic-images';
    const storage = window.imageStorage;
    if (!storage || typeof storage.replaceExamImages !== 'function') {
      return { supported: false };
    }
    const image = (fileName, marker) => ({
      fileName,
      blob: new Blob(
        [new Uint8Array([137, 80, 78, 71, marker])],
        { type: 'image/png' }
      ),
      mimeType: 'image/png'
    });
    await storage.replaceExamImages(examId, [
      image('old-one.png', 1),
      image('old-two.png', 2)
    ]);
    await storage.replaceExamImages(examId, [{
      fileName: 'new.png',
      buffer: new Uint8Array([137, 80, 78, 71, 3]).buffer
    }]);
    const fewer = (await storage.getAllExamImages(examId))
      .map((record) => record.fileName)
      .sort();
    await storage.replaceExamImages(examId, []);
    const zero = await storage.getExamImageCount(examId);
    await storage.deleteExamImages(examId);
    return { supported: true, fewer, zero };
  });
  assert.equal(
    atomicImageContract.supported,
    true,
    'Image storage must expose atomic whole-set replacement.'
  );
  assert.deepEqual(
    atomicImageContract.fewer,
    ['new.png'],
    'Replacing with fewer images must remove stale records.'
  );
  assert.equal(
    atomicImageContract.zero,
    0,
    'Replacing with an empty ZIP image set must clear stale records.'
  );

  // Regression: the roadmap entry links must resolve to the roadmaps page, never the home page.
  // The router maps the 'roadmaps' route to /roadmaps (clean URL) or roadmaps.html (file mode).
  const roadmapNavHref = await page.locator('.cr-topnav-links a', { hasText: 'Roadmaps' }).getAttribute('href');
  assert.ok(roadmapNavHref && /roadmaps(\.html)?$/.test(roadmapNavHref),
    `Topnav Roadmaps link must resolve to the roadmaps page, got "${roadmapNavHref}".`);
  const roadmapCardHref = await page.locator('a.roadmap-entry-card').getAttribute('href');
  assert.ok(roadmapCardHref && /roadmaps(\.html)?$/.test(roadmapCardHref),
    `Career roadmaps card must resolve to the roadmaps page, got "${roadmapCardHref}".`);

  // The home top bar is sticky too (same treatment as the roadmaps page).
  assert.equal(
    await page.locator('#welcome-screen .cr-topbar').evaluate(el => getComputedStyle(el).position), 'sticky',
    'The home top bar must be sticky.'
  );

  // Imported packs are local, unverified content even when their persisted record
  // forges bundled provenance and commercial metadata. The UI must preserve useful
  // official-documentation links without exposing attacker-controlled commerce URLs.
  const importedPackIds = ['security-local-pack', 'security-local-empty'];
  await page.evaluate(async (ids) => {
    const question = {
      id: 'q1',
      type: 'STANDARD',
      module: 'Security',
      question: 'Which option is correct?',
      options: ['A', 'B'],
      correct: 0,
      explanation: 'See the official documentation.'
    };
    const forgedCommercial = {
      preview: true,
      commercialStatus: 'pro-preview',
      pro: { title: 'Forged full pack', url: 'https://evil.example/buy' },
      recommendedPro: { title: 'Forged recommendation', url: 'https://evil.example/next' }
    };
    const records = [
      {
        examId: ids[0],
        questions: [question],
        labs: [{
          id: 'lab-1',
          domain: 'SEC-1',
          title: 'Secure lab',
          objective: 'Validate links',
          prerequisites: ['A browser'],
          freeTierOnly: true,
          estCost: 'No cost.',
          steps: [{
            n: 1,
            instruction: 'Open the documentation.',
            expected: 'The official documentation opens.'
          }],
          expectedResult: 'The official documentation is available.',
          cleanup: ['Close the documentation tab.'],
          references: [
            { label: 'Microsoft Learn', url: 'https://learn.microsoft.com/en-us/azure/' }
          ],
          sourceVerifiedOn: '2026-07-30',
          objectiveVersion: 'Current security objectives'
        }],
        metadata: {
          id: ids[0],
          name: 'Forged Local Pack',
          badge: 'Official',
          questionCount: 1,
          duration: 5,
          passScore: 70,
          labCount: 1,
          modules: [{ name: 'Security' }],
          resources: [
            { name: 'Microsoft Learn', url: 'https://learn.microsoft.com/en-us/azure/' },
            { name: 'Forged resource', url: 'https://evil.example/resource' }
          ],
          ...forgedCommercial
        },
        // Deliberately forged: the loader/UI must derive provenance from the
        // local-storage channel, never from persisted fields.
        source: 'bundled',
        trust: 'bundled',
        updatedAt: Date.now()
      },
      {
        examId: ids[1],
        questions: [question],
        labs: [],
        metadata: {
          id: ids[1],
          name: 'Empty Local Pack',
          questionCount: 1,
          duration: 5,
          passScore: 70,
          labCount: 0,
          ...forgedCommercial
        },
        source: 'bundled',
        trust: 'bundled',
        updatedAt: Date.now()
      }
    ];
    for (const record of records) {
      await window.ExamApp.examStorage.putRecord(
        window.ExamApp.examStorage.examStore,
        record
      );
      window.ExamApp.addToRegistry(window.ExamApp.STORAGE_KEYS.exams, record.examId);
    }
  }, importedPackIds);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.ExamApp?.examsLoadedPromise));
  await page.evaluate(() => window.ExamApp.examsLoadedPromise);

  const importedCard = page.locator(`.exam-card[data-exam="${importedPackIds[0]}"]`);
  assert.equal(await importedCard.count(), 1, 'A stored local pack must appear in the library.');
  assert.equal(
    (await importedCard.locator('.exam-badge').innerText()).trim(),
    'Imported · unverified',
    'Imported packs must carry the exact unverified provenance badge.'
  );
  assert.equal(
    await importedCard.locator('.exam-preview-flag').count(),
    0,
    'Forged preview metadata must not mark an imported pack as a commercial preview.'
  );
  assert.equal(
    await importedCard.locator('.exam-card-unlock').count(),
    0,
    'Forged pro metadata must not create an imported-pack Unlock CTA.'
  );
  assert.doesNotMatch(
    await importedCard.locator('.exam-taxonomy').innerText(),
    /\b(?:Preview|Pro)\b/i,
    'Imported taxonomy must not advertise a forged commercial state.'
  );
  assert.equal(
    await page.locator('.exam-card[data-exam="az104"] .exam-preview-flag').count(),
    1,
    'Trusted bundled preview treatment must remain unchanged.'
  );
  assert.equal(
    await page.locator('.exam-card[data-exam="az104"] .exam-card-unlock').count(),
    1,
    'Trusted bundled Unlock CTA must remain unchanged.'
  );

  await importedCard.click();
  await page.waitForSelector('#exam-details-placeholder.visible', { timeout: 5000 });
  const importedDetailHrefs = await page.locator('#details-resources-list a').evaluateAll(
    (links) => links.map((link) => link.href)
  );
  assert.ok(
    importedDetailHrefs.some((href) => href.startsWith('https://learn.microsoft.com/')),
    'Official documentation in an imported pack must remain clickable.'
  );
  assert.equal(
    importedDetailHrefs.some((href) => href.startsWith('https://evil.example/')),
    false,
    'Arbitrary imported resource URLs must not render as links.'
  );

  assert.equal(
    await page.evaluate((examId) => {
      window.homepage.showProModal(examId, window.userExams[examId]);
      return document.querySelectorAll('#pro-modal-overlay').length;
    }, importedPackIds[0]),
    0,
    'The pro modal sink must reject an imported record even if commercial fields are forged.'
  );

  const simulatorSinkResults = await page.evaluate(() => {
    const simulator = window.ExamApp?.examSimulator || window.examSimulator;
    const imported = {
      source: 'imported',
      trust: 'local-unverified',
      pro: { title: 'Forged', url: 'https://evil.example/buy' },
      recommendedPro: { title: 'Forged', url: 'https://evil.example/next' }
    };
    const bundled = {
      source: 'bundled',
      trust: 'bundled',
      pro: { title: 'Official', url: 'https://example.com/buy' },
      recommendedPro: { title: 'Official', url: 'https://example.com/next' }
    };
    return {
      importedPro: simulator.renderProUpsell(imported),
      importedRecommended: simulator.renderRecommendedPro(imported),
      bundledPro: simulator.renderProUpsell(bundled),
      bundledRecommended: simulator.renderRecommendedPro(bundled),
      credentialMarkdown: simulator.formatQuestionText(
        '[credential](https://user@learn.microsoft.com/en-us/azure/)'
      ),
      portMarkdown: simulator.formatQuestionText(
        '[port](https://learn.microsoft.com:444/en-us/azure/)'
      )
    };
  });
  assert.equal(simulatorSinkResults.importedPro, '', 'Results pro CTA must reject imported metadata.');
  assert.equal(simulatorSinkResults.importedRecommended, '', 'Results recommendation CTA must reject imported metadata.');
  assert.match(simulatorSinkResults.bundledPro, /results-pro-cta/, 'Trusted bundled pro CTA must remain available.');
  assert.match(simulatorSinkResults.bundledRecommended, /recommended-pro-cta/, 'Trusted bundled recommendation must remain available.');
  assert.doesNotMatch(
    simulatorSinkResults.credentialMarkdown,
    /href=/,
    'Documentation URLs containing credentials must remain plain text.'
  );
  assert.doesNotMatch(
    simulatorSinkResults.portMarkdown,
    /href=/,
    'Documentation URLs using a non-default port must remain plain text.'
  );

  const labsPage = await page.context().newPage();
  await labsPage.goto(`${baseUrl}/labs.html?exam=${importedPackIds[0]}`, { waitUntil: 'domcontentloaded' });
  await labsPage.waitForSelector('.lab-detail', { timeout: 8000 });
  const importedLabHrefs = await labsPage.locator('.lab-refs a').evaluateAll(
    (links) => links.map((link) => link.href)
  );
  assert.ok(
    importedLabHrefs.some((href) => href.startsWith('https://learn.microsoft.com/')),
    'Official imported lab references must remain clickable.'
  );
  assert.equal(
    importedLabHrefs.some((href) => href.startsWith('https://evil.example/')),
    false,
    'Forged imported lab references must not render as links.'
  );
  assert.doesNotMatch(
    await labsPage.locator('.lab-refs').innerText(),
    /evil\.example/i,
    'A forged imported URL must not be rendered as reference content.'
  );
  await labsPage.goto(`${baseUrl}/labs.html?exam=${importedPackIds[1]}`, { waitUntil: 'domcontentloaded' });
  await labsPage.waitForSelector('.labs-empty', { timeout: 8000 });
  assert.equal(
    await labsPage.locator('.labs-empty a').count(),
    0,
    'An imported empty-labs state must never expose a forged commercial CTA.'
  );
  await labsPage.close();

  for (const examId of importedPackIds) {
    await page.evaluate(async (id) => {
      await window.ExamApp.examStorage.deleteExamContent(id);
      window.ExamApp.removeFromRegistry(window.ExamApp.STORAGE_KEYS.exams, id);
      localStorage.removeItem(`custom_${id}_questions`);
      localStorage.removeItem(`exam_metadata_${id}`);
      localStorage.removeItem(`custom_${id}_labs`);
      delete window.userExams[id];
    }, examId);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.ExamApp?.examsLoadedPromise));
  await page.evaluate(() => window.ExamApp.examsLoadedPromise);

  // Collision handling belongs at the import boundary too: JSON and ZIP imports
  // ask once, cancellation has no success side effects, and confirmation retries
  // exactly once through the explicit fourth-argument overwrite capability.
  const collisionZip = new JSZipFixture();
  collisionZip.file('dump.json', JSON.stringify({
    questions: [{
      id: 'q1',
      type: 'STANDARD',
      module: 'Security',
      question: 'new-zip',
      options: ['A', 'B'],
      correct: 0,
      explanation: 'Explanation'
    }]
  }));
  collisionZip.file('metadata.json', JSON.stringify({
    id: 'security-preview-zip-cancel',
    name: 'security-preview-zip-cancel',
    questionCount: 1,
    duration: 5,
    passScore: 70
  }));
  collisionZip.file(
    'images/proof.png',
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
  );
  const collisionZipBytes = await collisionZip.generateAsync({ type: 'uint8array' });
  const collisionContract = await page.evaluate(async (zipBytes) => {
    const manager = window.examManager;
    const homepage = window.homepage;
    const imageStorage = window.ExamApp.imageStorage || window.imageStorage;
    const originalAnalytics = window.ExamApp.analytics;
    const originalImport = manager.importExam;
    const originalConfirm = window.showCustomConfirm;
    const originalNotification = homepage.showNotification;
    const originalStoreImage = imageStorage?.storeImageBlob;
    const originalReplaceImages = imageStorage?.replaceExamImages;
    const importCalls = [];
    const confirmations = [];
    const completed = [];
    const failed = [];
    const notifications = [];
    let imageWrites = 0;
    let decision = false;

    manager.importExam = async (...args) => {
      importCalls.push(args);
      return originalImport.apply(manager, args);
    };
    window.showCustomConfirm = async (...args) => {
      confirmations.push(args);
      return decision;
    };
    window.ExamApp.analytics = {
      ...originalAnalytics,
      trackImportCompleted: (file) => completed.push(file.name),
      trackImportFailed: (file) => failed.push(file.name)
    };
    homepage.showNotification = (message) => notifications.push(message);
    if (imageStorage) {
      if (typeof originalStoreImage === 'function') {
        imageStorage.storeImageBlob = async () => {
          imageWrites += 1;
          return true;
        };
      }
      if (typeof originalReplaceImages === 'function') {
        imageStorage.replaceExamImages = async () => {
          imageWrites += 1;
          return true;
        };
      }
    }

    const question = (text) => ({
      id: 'q1',
      type: 'STANDARD',
      module: 'Security',
      question: text,
      options: ['A', 'B'],
      correct: 0,
      explanation: 'Explanation'
    });
    const makePreview = (id, text) => {
      window.userExams[id] = {
        source: 'bundled',
        trust: 'bundled',
        loaded: true,
        questions: [question(text)],
        labs: [],
        metadata: {
          id,
          name: id,
          questionCount: 1,
          duration: 5,
          passScore: 70,
          preview: true,
          pro: { url: 'https://example.com/full' }
        }
      };
    };
    const makeJson = (id, text) => new File([
      JSON.stringify({
        id,
        questions: [question(text)],
        metadata: { id, name: id, questionCount: 1, duration: 5, passScore: 70 }
      })
    ], `${id}.json`, { type: 'application/json' });

    const cancelId = 'security-preview-cancel';
    const confirmId = 'security-preview-confirm';
    const zipCancelId = 'security-preview-zip-cancel';
    const seededIds = [cancelId, confirmId, zipCancelId];

    try {
      makePreview(cancelId, 'old-cancel');
      makePreview(confirmId, 'old-confirm');
      makePreview(zipCancelId, 'old-zip');

      decision = false;
      await homepage.handleFiles([makeJson(cancelId, 'new-cancel')]);

      decision = true;
      await homepage.handleFiles([makeJson(confirmId, 'new-confirm')]);

      decision = false;
      await homepage.handleFiles([
        new File(
          [new Uint8Array(zipBytes)],
          `${zipCancelId}.zip`,
          { type: 'application/zip' }
        )
      ]);

      return {
        importCalls: importCalls.map((args) => ({
          examId: args[0],
          argumentCount: args.length,
          imageFiles: args[2],
          options: args[3] || null
        })),
        confirmations: confirmations.length,
        completed: completed.slice(),
        failed: failed.slice(),
        notifications: notifications.slice(),
        imageWrites,
        cancelQuestion: window.userExams[cancelId]?.questions?.[0]?.question,
        confirmQuestion: window.userExams[confirmId]?.questions?.[0]?.question,
        confirmSource: window.userExams[confirmId]?.source,
        confirmTrust: window.userExams[confirmId]?.trust,
        zipQuestion: window.userExams[zipCancelId]?.questions?.[0]?.question
      };
    } finally {
      manager.importExam = originalImport;
      window.showCustomConfirm = originalConfirm;
      window.ExamApp.analytics = originalAnalytics;
      homepage.showNotification = originalNotification;
      if (imageStorage && typeof originalStoreImage === 'function') {
        imageStorage.storeImageBlob = originalStoreImage;
      }
      if (imageStorage && typeof originalReplaceImages === 'function') {
        imageStorage.replaceExamImages = originalReplaceImages;
      }
      await Promise.allSettled(seededIds.map(async (id) => {
        try {
          await window.ExamApp.examStorage.deleteExamContent(id);
        } finally {
          window.ExamApp.removeFromRegistry(window.ExamApp.STORAGE_KEYS.exams, id);
          localStorage.removeItem(`custom_${id}_questions`);
          localStorage.removeItem(`exam_metadata_${id}`);
          localStorage.removeItem(`custom_${id}_labs`);
          delete window.userExams[id];
        }
      }));
      homepage.hideImportProgress();
    }
  }, Array.from(collisionZipBytes));
  assert.equal(collisionContract.confirmations, 3, 'Each JSON/ZIP collision must ask exactly once.');
  assert.equal(collisionContract.cancelQuestion, 'old-cancel', 'Cancelling JSON replacement must keep the existing pack.');
  assert.equal(collisionContract.zipQuestion, 'old-zip', 'Cancelling ZIP replacement must keep the existing pack.');
  assert.equal(collisionContract.confirmQuestion, 'new-confirm', 'Confirmation must replace a bundled preview with the imported complete pack.');
  assert.equal(collisionContract.confirmSource, 'imported', 'A confirmed replacement must retain imported provenance.');
  assert.equal(collisionContract.confirmTrust, 'local-unverified', 'A confirmed replacement must remain unverified.');
  assert.deepEqual(
    collisionContract.completed.sort(),
    ['security-preview-confirm.json'],
    'Only a completed replacement may emit import-completed analytics.'
  );
  assert.deepEqual(collisionContract.failed, [], 'User cancellation is not an import failure.');
  assert.equal(collisionContract.notifications.length, 1, 'Only the confirmed import may show a success notification.');
  assert.equal(collisionContract.imageWrites, 0, 'Cancelling a ZIP conflict must happen before any image write.');
  const callsByExam = collisionContract.importCalls.reduce((groups, call) => {
    (groups[call.examId] ||= []).push(call);
    return groups;
  }, {});
  assert.equal(callsByExam['security-preview-cancel'].length, 1, 'Cancelled JSON import must not retry.');
  assert.equal(callsByExam['security-preview-zip-cancel'].length, 1, 'Cancelled ZIP import must not retry.');
  assert.equal(callsByExam['security-preview-confirm'].length, 2, 'Confirmed JSON import must retry exactly once.');
  assert.deepEqual(
    callsByExam['security-preview-confirm'][1].options,
    { overwrite: true },
    'The single retry must use only the explicit overwrite capability.'
  );
  assert.equal(
    callsByExam['security-preview-confirm'][1].argumentCount,
    4,
    'The overwrite capability must be passed as importExam fourth argument.'
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

  // SEO landing conversion: the primary CTA launches a fixed diagnostic, and
  // the secondary CTA preserves the normal full-practice behavior.
  await page.goto(`${baseUrl}/exams/az900/index.html`, { waitUntil: 'domcontentloaded' });
  const diagnosticCta = page.locator(
    'a[data-analytics-event="landing_cta_clicked"][data-analytics-action="diagnostic"]'
  );
  assert.equal(await diagnosticCta.count(), 1, 'AZ-900 landing must expose one tracked diagnostic CTA.');
  assert.match(
    await diagnosticCta.getAttribute('href'),
    /exam\.html\?exam=az900&session=diagnostic&count=10$/,
    'Diagnostic CTA must request the fixed diagnostic session.'
  );
  await diagnosticCta.click();
  await page.waitForFunction(() => {
    const sim = window.ExamApp?.examSimulator || window.examSimulator;
    return sim?.getCurrentQuestions?.().length === 10;
  }, null, { timeout: 15000 });
  const diagnosticRuntime = await page.evaluate(() => {
    const sim = window.ExamApp?.examSimulator || window.examSimulator;
    const config = sim.examData.az900;
    return {
      activeCount: sim.getCurrentQuestions().length,
      sessionType: sim.getSessionType(),
      configuredCount: config.questionCount,
      duration: config.duration
    };
  });
  assert.deepEqual(
    diagnosticRuntime,
    { activeCount: 10, sessionType: 'diagnostic', configuredCount: 10, duration: 11 },
    'Diagnostic runtime must use ten questions and proportional AZ-900 duration.'
  );

  await page.evaluate(() => {
    const sim = window.ExamApp?.examSimulator || window.examSimulator;
    sim.finishExam(true);
  });
  await page.waitForFunction(() => {
    const progress = JSON.parse(localStorage.getItem('az900_progress') || '{"attempts":[]}');
    return progress.attempts.at(-1)?.sessionType === 'diagnostic';
  }, null, { timeout: 5000 });
  assert.equal(
    await page.evaluate(() => {
      const progress = JSON.parse(localStorage.getItem('az900_progress'));
      return progress.attempts.at(-1).sessionType;
    }),
    'diagnostic',
    'Persisted diagnostic attempts must retain their session type.'
  );

  // A high diagnostic score remains visible as an attempt, but it is not a
  // certification-completion signal. Completion metrics and roadmaps only use
  // full, study, and legacy attempts.
  await page.evaluate(() => {
    const sim = window.ExamApp?.examSimulator || window.examSimulator;
    sim.saveProgress(100, true, 1);
  });
  const diagnosticProgress = await page.evaluate(() => {
    const progress = JSON.parse(localStorage.getItem('az900_progress'));
    return {
      totalAttempts: progress.attempts.length,
      latestSessionType: progress.attempts.at(-1)?.sessionType,
      latestScore: progress.attempts.at(-1)?.score,
      bestScore: progress.bestScore,
      totalPassed: progress.totalPassed
    };
  });
  assert.deepEqual(
    diagnosticProgress,
    {
      totalAttempts: 2,
      latestSessionType: 'diagnostic',
      latestScore: 100,
      bestScore: 0,
      totalPassed: 0
    },
    'Diagnostic history must remain visible without changing completion metrics or pass-rate denominators.'
  );
  await page.waitForFunction(async () => {
    const progress = await window.ExamApp?.examStorage?.getProgress?.('az900');
    return progress?.attempts?.length === 2 && progress.attempts.at(-1)?.score === 100;
  }, null, { timeout: 5000 });

  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.ExamApp?.examsLoadedPromise));
  await page.evaluate(() => window.ExamApp.examsLoadedPromise);
  await page.waitForFunction(
    () => document.querySelector('.exam-card[data-exam="az900"]'),
    null,
    { timeout: 8000 }
  );
  await page.locator('.exam-card[data-exam="az900"]').click();
  await page.waitForFunction(
    () => window.homepage?.selectedExamId === 'az900',
    null,
    { timeout: 8000 }
  );
  assert.deepEqual(
    await page.evaluate(() => ({
      stats: (() => {
        const stats = window.homepage.getProgressStats('az900');
        return {
          attempts: stats?.attempts,
          completionAttempts: stats?.completionAttempts,
          bestScore: stats?.bestScore,
          passRate: stats?.passRate,
          lastScore: stats?.lastScore
        };
      })(),
      detailsReadiness: document.getElementById('details-readiness')?.textContent,
      detailsBest: document.getElementById('details-best-score')?.textContent,
      detailsLast: document.getElementById('details-last-attempt')?.textContent
    })),
    {
      stats: {
        attempts: 2,
        completionAttempts: 0,
        bestScore: null,
        passRate: null,
        lastScore: 100
      },
      detailsReadiness: 'Diagnostic suggests on track',
      detailsBest: '—',
      detailsLast: '100% · today'
    },
    'The dashboard must count diagnostic history while leaving completion metrics unset.'
  );

  await page.goto(`${baseUrl}/roadmaps.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.Roadmaps?.ready === true,
    null,
    { timeout: 8000 }
  );
  assert.equal(
    await page.locator('.roadmap-node[data-pack="az900"].is-passed').count(),
    0,
    'A passing diagnostic alone must not mark the AZ-900 roadmap node as passed.'
  );
  assert.equal(
    await page.locator('.roadmap-node[data-pack="az900"].is-started').count(),
    1,
    'A completed diagnostic still counts as starting the AZ-900 roadmap node.'
  );

  await page.goto(`${baseUrl}/exams/az900/index.html`, { waitUntil: 'domcontentloaded' });
  const fullCta = page.locator(
    'a[data-analytics-event="landing_cta_clicked"][data-analytics-action="full"]'
  );
  assert.equal(await fullCta.count(), 1, 'AZ-900 landing must expose one tracked full-practice CTA.');
  assert.match(
    await fullCta.getAttribute('href'),
    /exam\.html\?exam=az900$/,
    'Full CTA must retain the backward-compatible exam URL.'
  );
  await fullCta.click();
  await page.waitForFunction(() => {
    const sim = window.ExamApp?.examSimulator || window.examSimulator;
    return sim?.getCurrentQuestions?.().length > 0;
  }, null, { timeout: 15000 });
  const fullRuntime = await page.evaluate(() => {
    const sim = window.ExamApp?.examSimulator || window.examSimulator;
    const config = sim.examData.az900;
    return {
      activeCount: sim.getCurrentQuestions().length,
      sessionType: sim.getSessionType(),
      configuredCount: config.questionCount,
      duration: config.duration
    };
  });
  assert.deepEqual(
    fullRuntime,
    { activeCount: 40, sessionType: 'full', configuredCount: 40, duration: 45 },
    'Full practice must keep the normal AZ-900 count, type, and duration.'
  );

  // The fixed privacy control must clear both navigation actions on mobile.
  // Localhost does not inject the public-site control, so add the same class
  // that analytics.js uses and verify the real computed layout.
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileControlBoxes = await page.evaluate(() => {
    const privacy = document.createElement('button');
    privacy.type = 'button';
    privacy.className = 'analytics-privacy-button';
    privacy.textContent = 'Privacy settings';
    document.body.appendChild(privacy);
    document.querySelector('.navigation-buttons')?.scrollIntoView({ block: 'end' });

    const rect = (element) => {
      const { left, top, right, bottom } = element.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    return {
      privacy: rect(privacy),
      previous: rect(document.getElementById('prev-btn')),
      next: rect(document.getElementById('next-btn'))
    };
  });
  const overlaps = (first, second) => first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;
  assert.equal(
    overlaps(mobileControlBoxes.privacy, mobileControlBoxes.previous),
    false,
    `Mobile Privacy settings must not overlap Previous: ${JSON.stringify(mobileControlBoxes)}`
  );
  assert.equal(
    overlaps(mobileControlBoxes.privacy, mobileControlBoxes.next),
    false,
    `Mobile Privacy settings must not overlap Next: ${JSON.stringify(mobileControlBoxes)}`
  );
  await page.evaluate(() => document.querySelector('.analytics-privacy-button')?.remove());
  await page.setViewportSize({ width: 1280, height: 720 });

  // Exam runtime regressions:
  //  - the results "Questions answered" stat must report answered/total, not the bank size;
  //  - "Show Answer" before attempting a question must read as a neutral reveal, not "Incorrect".
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

  // The editor shares the control-room sticky top bar: logo links home, theme toggle works.
  assert.equal(
    await page.locator('.cr-topbar').evaluate(el => getComputedStyle(el).position), 'sticky',
    'The editor top bar must be sticky.'
  );
  const editorBrandHref = await page.locator('a.cr-topnav-brand').getAttribute('href');
  const editorHomeNavHref = await page.locator('.cr-topnav-links a', { hasText: 'Home' }).getAttribute('href');
  assert.ok(editorBrandHref, 'The editor logo must be a link to home.');
  assert.equal(editorBrandHref, editorHomeNavHref, 'Editor logo must link to the same home target as the Home nav link.');
  const editorWasDark = await page.evaluate(() => document.body.classList.contains('dark-mode'));
  await page.locator('#editorThemeToggle').click();
  assert.notEqual(
    await page.evaluate(() => document.body.classList.contains('dark-mode')), editorWasDark,
    'Editor theme toggle must flip dark mode.'
  );
  await page.locator('#editorThemeToggle').click(); // restore

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
  await page.locator('#qExplanation').click();
  await page.locator('#qExplanation').type(' (edit)');
  await page.waitForFunction(
    () => !/no unsaved/i.test(document.querySelector('#editorSaveState span')?.textContent || ''),
    null,
    { timeout: 5000 }
  );
  assert.match(
    (await page.locator('#editorSaveState span').innerText()).trim(),
    /saves as a copy/i,
    'Changing only the explanation of a built-in question must be tracked as an edit.'
  );

  // Career roadmaps: seed local progress, then verify node states + up-next + structure.
  await page.goto(`${baseUrl}/roadmaps.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const az900 = { attempts: [{ score: 92, passed: true }], bestScore: 92, totalPassed: 1 };
    const az104 = { attempts: [{ score: 40, passed: false }], bestScore: 40, totalPassed: 0 };
    localStorage.setItem('az900_progress', JSON.stringify(az900));
    localStorage.setItem('az104_progress', JSON.stringify(az104));
    // Roadmaps hydrates the local mirror from IndexedDB on startup, so seed both
    // layers to keep this cross-page regression deterministic.
    await window.ExamApp.examStorage.putProgress('az900', az900);
    await window.ExamApp.examStorage.putProgress('az104', az104);
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.Roadmaps && window.Roadmaps.ready === true, null, { timeout: 8000 });

  assert.equal(await page.locator('.roadmap-track-card').count(), 6, 'Six career tracks must render.');

  // The Examplar logo links to the home (same target as the Home nav link), and the
  // top bar is sticky so the nav stays put while the stepper scrolls.
  const brandHref = await page.locator('a.cr-topnav-brand').getAttribute('href');
  const homeNavHref = await page.locator('.cr-topnav-links a', { hasText: 'Home' }).getAttribute('href');
  assert.ok(brandHref, 'The Examplar logo must be a link.');
  assert.equal(brandHref, homeNavHref, 'Logo must link to the same home target as the Home nav link.');
  assert.equal(
    await page.locator('.cr-topbar').evaluate(el => getComputedStyle(el).position), 'sticky',
    'The roadmaps top bar must be sticky.'
  );

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

  // Manual completion: a learner can tick off a cert they passed elsewhere. A node passed
  // in-app has no toggle; a not-passed node does, and ticking it fills the checkpoint.
  assert.equal(
    await page.locator('.roadmap-node[data-pack="az900"] .rn-done-toggle').count(), 0,
    'A node passed in-app must not offer the manual mark-complete toggle.'
  );
  assert.equal(
    await page.locator('.roadmap-node[data-pack="az305"] .rn-done-toggle').count(), 1,
    'A not-passed node must offer the manual mark-complete toggle.'
  );
  await page.locator('.roadmap-node[data-pack="az305"] .rn-done-toggle').click();
  await page.waitForSelector('.roadmap-node[data-pack="az305"].is-done', { timeout: 2000 });
  assert.equal(
    await page.locator('.roadmap-node[data-pack="az305"].is-done .rn-dot .fa-check').count(), 1,
    'Marking a node complete must fill its checkpoint with a check.'
  );
  // Toggling off clears it again (roadmap-local; never touches the exam engine).
  await page.locator('.roadmap-node[data-pack="az305"] .rn-done-toggle').click();
  await page.waitForFunction(
    () => !document.querySelector('.roadmap-node[data-pack="az305"].is-done'), null, { timeout: 2000 }
  );

  // Owned pack: when the full pack is imported its stored metadata drops the preview flag,
  // so the roadmap shows it Unlocked with no "Unlock full", mirroring the home.
  await page.evaluate(async () => {
    await window.ExamApp.examStorage.putExam('saac03', [{ id: 'q1' }],
      { name: 'SAA-C03', preview: false, commercialStatus: 'pro' });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.Roadmaps && window.Roadmaps.ready === true, null, { timeout: 8000 });
  assert.equal(
    await page.locator('.roadmap-node[data-pack="saac03"] .rn-pill.is-owned').count(), 1,
    'An imported full pack must show the Unlocked pill on the roadmap.'
  );
  assert.equal(
    await page.locator('.roadmap-node[data-pack="saac03"] .rn-unlock').count(), 0,
    'An owned pack must not show the "Unlock full" button.'
  );

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

  // Privacy page wears the same control-room sticky top bar (logo links home, nav links present).
  await page.goto(`${baseUrl}/privacy-and-storage.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(
    await page.locator('.cr-topbar').evaluate(el => getComputedStyle(el).position), 'sticky',
    'The privacy page top bar must be sticky.'
  );
  assert.equal(
    await page.locator('.cr-topnav-links a', { hasText: 'Roadmaps' }).count(), 1,
    'Privacy top bar must include the control-room nav links.'
  );
  const privacyBrandHref = await page.locator('a.cr-topnav-brand').getAttribute('href');
  const privacyHomeNavHref = await page.locator('.cr-topnav-links a', { hasText: 'Home' }).getAttribute('href');
  assert.ok(privacyBrandHref, 'The privacy logo must be a link to home.');
  assert.equal(privacyBrandHref, privacyHomeNavHref, 'Privacy logo must link to the same home target as the Home nav link.');

  // SEO landing pages (hub + a generated exam page) wear the same control-room sticky bar.
  for (const path of ['/exams/index.html', '/exams/az900/index.html']) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
    assert.equal(
      await page.locator('.cr-topbar').evaluate(el => getComputedStyle(el).position), 'sticky',
      `The ${path} top bar must be sticky.`
    );
    assert.equal(
      await page.locator('.cr-topnav-links a', { hasText: 'Roadmaps' }).count(), 1,
      `${path} top bar must include the control-room nav links.`
    );
  }

  console.log('Browser smoke passed.');
} finally {
  await browser.close();
}
