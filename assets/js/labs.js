/**
 * Labs reader - renders the `labs` array of an exam pack as read-only, hands-on
 * lab guides on the Control Room shell (rail list + workspace). Works for bundled
 * packs (fetched dump.json) and imported pro packs (decrypted into browser storage);
 * both expose labs via window.userExams[id].labs.
 *
 * Labs are non-graded content. This page never touches the exam engine or scoring.
 */
(function () {
  'use strict';

  const workspace = document.getElementById('labs-workspace');
  const nav = document.getElementById('labs-nav');
  const packBadge = document.getElementById('labs-pack-badge');
  const packSub = document.getElementById('labs-pack-sub');

  // --- theme (mirrors the exam/home behavior: body.dark-mode + localStorage) ---
  function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-mode', isDark);
    const icon = document.querySelector('#labs-theme-toggle .theme-icon');
    if (icon) {
      icon.classList.toggle('fa-sun', isDark);
      icon.classList.toggle('fa-moon', !isDark);
    }
  }
  // Match the rest of the UI (editor-init.js / legal-page.js): honor a saved choice,
  // otherwise follow the OS via prefers-color-scheme.
  function preferredTheme() {
    let saved = null;
    try { saved = localStorage.getItem('theme'); } catch (_) { saved = null; }
    if (saved === 'dark' || saved === 'light') return saved;
    // matchMedia can be absent and can return null (e.g. file://), so guard the deref.
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
  }
  applyTheme(preferredTheme());
  document.getElementById('labs-theme-toggle')?.addEventListener('click', () => {
    const next = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    try { localStorage.setItem('theme', next); } catch (_) { /* storage blocked - non-fatal */ }
    applyTheme(next);
  });

  // --- safe rendering helpers ---
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Escape first, then turn `inline code` into <code> and newlines into <br>.
  function formatInline(value) {
    return escapeHtml(value)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  const SAFE_IMAGE_RE = /^[A-Za-z0-9_. -]{1,128}\.(?:jpg|jpeg|png|gif|webp)$/i;

  // Only allow https in hrefs (matches the validator's official-doc gate). escapeHtml
  // stops HTML injection but not a javascript:/data: scheme, and imported packs are not
  // re-validated at runtime, so a crafted lab reference or pro URL could otherwise
  // execute on click or downgrade the link to plain HTTP.
  function safeHref(url) {
    try {
      const parsed = new URL(String(url), window.location.origin);
      return parsed.protocol === 'https:' ? parsed.href : '#';
    } catch (_) {
      return '#';
    }
  }

  function getQueryExamId() {
    return new URLSearchParams(window.location.search).get('exam') || '';
  }

  // --- mark-as-done persistence (isolated from exam progress) ---
  function doneKey(examId) { return `examplar_labs_done_${examId}`; }
  function getDone(examId) {
    try {
      const raw = JSON.parse(localStorage.getItem(doneKey(examId)) || '[]');
      return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : [];
    } catch (_) { return []; }
  }
  function setDone(examId, ids) {
    try { localStorage.setItem(doneKey(examId), JSON.stringify(Array.from(new Set(ids)).slice(0, 200))); }
    catch (_) { /* storage full or blocked - non-fatal */ }
  }
  function isDone(examId, labId) { return getDone(examId).includes(labId); }
  function toggleDone(examId, labId) {
    const ids = getDone(examId);
    const next = ids.includes(labId) ? ids.filter((id) => id !== labId) : ids.concat(labId);
    setDone(examId, next);
    return next.includes(labId);
  }

  function emptyState(message, metadata) {
    if (nav) nav.innerHTML = '<span class="cr-palette-label">Labs</span>';
    if (packSub) packSub.textContent = '';
    const proUrl = metadata && metadata.pro && metadata.pro.url;
    const upsell = proUrl
      ? `<a class="btn btn-primary" href="${escapeHtml(safeHref(proUrl))}" target="_blank" rel="noopener noreferrer">Get the full pack</a>`
      : '';
    workspace.innerHTML = `<div class="labs-empty"><p>${escapeHtml(message)}</p>${upsell}</div>`;
  }

  function navMarkup(labs, examId, selectedId) {
    const byDomain = new Map();
    labs.forEach((lab) => {
      const key = lab.domain || 'Labs';
      if (!byDomain.has(key)) byDomain.set(key, []);
      byDomain.get(key).push(lab);
    });
    // Read the done list once per render instead of re-parsing localStorage per lab.
    const doneSet = new Set(getDone(examId));
    let html = '<span class="cr-palette-label">Labs</span>';
    let index = 0;
    for (const [domain, group] of byDomain) {
      html += `<div class="labs-nav-group-label">${escapeHtml(domain)}</div>`;
      group.forEach((lab) => {
        index += 1;
        const active = lab.id === selectedId ? ' active' : '';
        const tick = doneSet.has(lab.id)
          ? '<i class="fas fa-circle-check labs-nav-tick" aria-hidden="true"></i>' : '';
        html += `<button type="button" class="labs-nav-item${active}" data-lab-id="${escapeHtml(lab.id)}">`
          + `<span class="labs-nav-index">${index}</span>`
          + `<span>${escapeHtml(lab.title)}</span>${tick}</button>`;
      });
    }
    return html;
  }

  function stepMarkup(step, examId, isBundled) {
    let imageHtml = '';
    if (step.image && typeof step.image.filename === 'string') {
      const filename = step.image.filename.trim();
      if (SAFE_IMAGE_RE.test(filename) && isBundled) {
        const src = `user-content/exams/${encodeURIComponent(examId)}/images/${encodeURIComponent(filename)}`;
        imageHtml = `<img class="lab-step-image" src="${src}" alt="${escapeHtml(step.expected || 'Lab step diagram')}" loading="lazy">`;
      } else if (SAFE_IMAGE_RE.test(filename)) {
        imageHtml = '<div class="lab-image-missing">Diagram available in the full pack.</div>';
      }
    }
    return '<li class="lab-step">'
      + `<div class="lab-step-instruction">${formatInline(step.instruction)}</div>`
      + (step.expected ? `<div class="lab-step-expected">${formatInline(step.expected)}</div>` : '')
      + imageHtml
      + '</li>';
  }

  function workspaceMarkup(lab, examId, isBundled) {
    const prereqs = Array.isArray(lab.prerequisites) ? lab.prerequisites : [];
    const steps = Array.isArray(lab.steps) ? lab.steps : [];
    const cleanup = Array.isArray(lab.cleanup) ? lab.cleanup : [];
    const refs = Array.isArray(lab.references) ? lab.references : [];
    const done = isDone(examId, lab.id);
    const costLine = `${lab.estCost ? formatInline(lab.estCost) + ' ' : ''}Your account, your cost: Examplar is not responsible for any cloud charges.`;

    return `
      <article class="lab-detail">
        <header class="lab-head">
          ${lab.domain ? `<span class="lab-domain-chip"><i class="fas fa-flask" aria-hidden="true"></i> ${escapeHtml(lab.domain)}</span>` : ''}
          <h1 class="lab-title">${escapeHtml(lab.title)}</h1>
          <p class="lab-objective">${formatInline(lab.objective)}</p>
          <div class="lab-cost-note"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> <span>${costLine}</span></div>
        </header>

        ${prereqs.length ? `<section class="lab-section"><h2 class="lab-section-title">Prerequisites</h2><ul class="lab-list">${prereqs.map((p) => `<li>${formatInline(p)}</li>`).join('')}</ul></section>` : ''}

        <section class="lab-section">
          <h2 class="lab-section-title">Steps</h2>
          <ol class="lab-steps">${steps.map((s) => stepMarkup(s, examId, isBundled)).join('')}</ol>
        </section>

        ${lab.expectedResult ? `<section class="lab-section"><h2 class="lab-section-title">Expected result</h2><p class="lab-objective">${formatInline(lab.expectedResult)}</p></section>` : ''}

        ${cleanup.length ? `<section class="lab-section lab-cleanup"><h2 class="lab-section-title"><i class="fas fa-broom" aria-hidden="true"></i> Clean up (avoid charges)</h2><ul class="lab-list">${cleanup.map((c) => `<li>${formatInline(c)}</li>`).join('')}</ul></section>` : ''}

        ${refs.length ? `<section class="lab-section lab-refs"><h2 class="lab-section-title">Official references</h2><ul class="lab-list">${refs.map((r) => `<li><a href="${escapeHtml(safeHref(r.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.label || r.url)}</a></li>`).join('')}</ul></section>` : ''}

        <div class="lab-actions">
          <button type="button" class="btn btn-primary" id="lab-done-btn" data-lab-id="${escapeHtml(lab.id)}">
            <i class="fas ${done ? 'fa-rotate-left' : 'fa-check'}" aria-hidden="true"></i>
            <span>${done ? 'Mark as not done' : 'Mark as done'}</span>
          </button>
          ${done ? '<span class="lab-done-state"><i class="fas fa-circle-check" aria-hidden="true"></i> Completed</span>' : ''}
        </div>
      </article>`;
  }

  function render(examId, metadata, labs, selectedId, isBundled) {
    const selected = labs.find((l) => l.id === selectedId) || labs[0];
    const name = (metadata && (metadata.name || metadata.certificationCode)) || examId.toUpperCase();
    if (packBadge) packBadge.textContent = `${name} hands-on labs`;
    if (packSub) packSub.textContent = `${labs.length} lab${labs.length === 1 ? '' : 's'} in your own free-tier account`;

    nav.innerHTML = navMarkup(labs, examId, selected.id);
    workspace.innerHTML = workspaceMarkup(selected, examId, isBundled);

    nav.querySelectorAll('.labs-nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        render(examId, metadata, labs, btn.dataset.labId, isBundled);
        workspace.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    });
    const doneBtn = document.getElementById('lab-done-btn');
    doneBtn?.addEventListener('click', () => {
      toggleDone(examId, doneBtn.dataset.labId);
      render(examId, metadata, labs, selected.id, isBundled);
    });
  }

  async function main() {
    if (window.examsLoadedPromise) {
      try { await window.examsLoadedPromise; } catch (_) { /* continue with whatever loaded */ }
    }

    const examId = getQueryExamId();
    if (!window.ExamApp || !window.ExamApp.isSafeExamId(examId)) {
      emptyState('Invalid or missing exam id. Open this page from an exam in your library.');
      return;
    }

    try {
      await window.ExamApp.ensureExamLoaded(examId);
    } catch (_) {
      emptyState(`The "${examId}" pack is not available. Import or open it from the homepage first.`);
      return;
    }

    const exam = (window.userExams && window.userExams[examId]) || {};
    const metadata = exam.metadata || null;
    const labs = Array.isArray(exam.labs) ? exam.labs : [];
    const isBundled = exam.source === 'bundled';

    const name = (metadata && (metadata.fullName || metadata.name)) || examId.toUpperCase();
    document.title = `${name} labs | Examplar`;

    if (!labs.length) {
      emptyState('This pack does not include hands-on labs yet.', metadata);
      return;
    }
    render(examId, metadata, labs, labs[0].id, isBundled);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
