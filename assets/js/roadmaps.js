/**
 * Career roadmaps - renders the catalog as ordered career tracks (vertical stepper)
 * crossed with the learner's LOCAL progress. Reads the SAME localStorage progress
 * record the home cards read and uses the SAME flat 70% pass threshold, so the
 * roadmap status never diverges from the home. Additive: never touches the exam engine.
 */
(function () {
	'use strict';

	// The app shows passed/failed using a flat 70% on bestScore (script-multi-exam.js
	// progress modal + homepage readiness). Match it EXACTLY so the roadmap status
	// always agrees with the home cards, including AWS (real pass mark 72%).
	const PASS_THRESHOLD = 70;
	const STATE_LABEL = { 'passed': 'Review', 'started': 'Continue', 'not-started': 'Start' };
	const PRO_LABEL = { 'passed': 'Review', 'started': 'Continue', 'not-started': 'Open preview' };

	// --- theme (mirrors labs.js / the rest of the UI: body.dark-mode + localStorage) ---
	function applyTheme(theme) {
		const isDark = theme === 'dark';
		document.body.classList.toggle('dark-mode', isDark);
		const icon = document.querySelector('#theme-toggle .theme-icon');
		if (icon) {
			icon.classList.toggle('fa-sun', isDark);
			icon.classList.toggle('fa-moon', !isDark);
		}
	}
	function preferredTheme() {
		let saved = null;
		try { saved = localStorage.getItem('theme'); } catch (_) { saved = null; }
		if (saved === 'dark' || saved === 'light') return saved;
		return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
	}
	applyTheme(preferredTheme());
	document.getElementById('theme-toggle')?.addEventListener('click', () => {
		const next = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
		try { localStorage.setItem('theme', next); } catch (_) { /* storage blocked - non-fatal */ }
		applyTheme(next);
	});

	// --- safe rendering helpers (mirror labs.js) ---
	function escapeHtml(value) {
		return String(value == null ? '' : value)
			.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}
	// https-only hrefs (matches labs.js): escapeHtml stops HTML injection but not a
	// javascript:/data: scheme on a crafted pro URL or resource link.
	function safeHref(url) {
		try {
			const parsed = new URL(String(url), window.location.origin);
			return parsed.protocol === 'https:' ? parsed.href : '#';
		} catch (_) { return '#'; }
	}
	// Allowlist icon class strings (Font Awesome tokens only) before injecting them
	// into a class attribute, per the repo guideline for JSON-derived class names.
	function safeIconClass(raw, fallback) {
		const normalized = String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ');
		return /^[a-z0-9 -]{1,64}$/.test(normalized) ? normalized : fallback;
	}

	function resolveEntry(entry) {
		if (typeof entry === 'string') return { id: entry, role: 'core' };
		return { id: entry.id, role: entry.role || 'core' };
	}

	function readProgress(id) {
		try { return JSON.parse(localStorage.getItem(id + '_progress')); }
		catch (_) { return null; }
	}

	function deriveNodeState(progress) {
		const attempts = progress && Array.isArray(progress.attempts) ? progress.attempts : [];
		if (!attempts.length) return 'not-started';
		const best = Number(progress && progress.bestScore) || 0;
		return best >= PASS_THRESHOLD ? 'passed' : 'started';
	}

	function progressStats(progress) {
		const attempts = progress && Array.isArray(progress.attempts) ? progress.attempts : [];
		if (!attempts.length) return null;
		const last = attempts[attempts.length - 1];
		let lastDate = '';
		try { lastDate = last.date ? new Date(last.date).toLocaleDateString() : ''; } catch (_) { lastDate = ''; }
		return { best: Number(progress.bestScore) || 0, attempts: attempts.length, lastScore: Number(last.score) || 0, lastDate };
	}

	async function fetchJson(url) {
		const res = await fetch(url, { credentials: 'same-origin' });
		if (!res.ok) throw new Error('Failed to load ' + url);
		return res.json();
	}

	const state = { tracks: [], metaById: {}, selectedTrackId: null };

	function examHref(id) {
		const built = window.ExamApp?.router?.buildUrl?.('exam', { exam: id });
		return built || ('exam.html?exam=' + encodeURIComponent(id));
	}

	function nodeModel(entry) {
		const { id, role } = resolveEntry(entry);
		const meta = state.metaById[id] || {};
		const progress = readProgress(id);
		const isPro = meta.commercialStatus === 'pro-preview';
		const attemptCount = progress && Array.isArray(progress.attempts) ? progress.attempts.length : 0;
		const best = attemptCount ? (Number(progress.bestScore) || 0) : null;
		return {
			id, role, isPro, best, meta, progress,
			code: meta.certificationCode || meta.name || id.toUpperCase(),
			name: meta.fullName || meta.name || id,
			level: meta.level || meta.badge || '',
			nodeState: deriveNodeState(progress)
		};
	}

	function trackModels(track) {
		const nodes = track.packs.map(nodeModel);
		const nextIndex = nodes.findIndex(n => n.nodeState !== 'passed');
		const passedCount = nodes.filter(n => n.nodeState === 'passed').length;
		return { nodes, nextIndex, passedCount, total: nodes.length };
	}

	function renderIndex() {
		const host = document.getElementById('roadmap-track-index');
		host.innerHTML = '';
		let totalPassed = 0, totalNodes = 0;
		state.tracks.forEach(track => {
			const m = trackModels(track);
			totalPassed += m.passedCount; totalNodes += m.total;
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'roadmap-track-card';
			btn.setAttribute('data-track', track.id);
			btn.setAttribute('aria-current', String(track.id === state.selectedTrackId));
			btn.innerHTML =
				'<i aria-hidden="true" class="rt-icon ' + safeIconClass(track.icon, 'fas fa-list-check') + '"></i>' +
				'<span><span class="rt-name">' + escapeHtml(track.name) + '</span>' +
				'<span class="rt-count">' + m.passedCount + '/' + m.total + ' done</span></span>';
			btn.addEventListener('click', () => selectTrack(track.id));
			host.appendChild(btn);
		});
		const gp = document.getElementById('roadmap-global-progress');
		if (gp) gp.textContent = totalPassed + ' of ' + totalNodes + ' packs passed';
	}

	function detailsMarkup(node) {
		const m = node.meta || {};
		const info = [
			['Duration', (m.duration || 45) + ' min'],
			['Questions', String(m.questionCount || m.totalQuestions || '—')],
			['Pass score', (m.passScore || 70) + '%']
		];
		const s = progressStats(node.progress);
		const progressHtml = s
			? '<div class="rn-d-grid">' +
				'<div><span>Best</span><strong>' + s.best + '%</strong></div>' +
				'<div><span>Last</span><strong>' + s.lastScore + '%</strong></div>' +
				'<div><span>Attempts</span><strong>' + s.attempts + '</strong></div>' +
				(s.lastDate ? '<div><span>Last attempt</span><strong>' + escapeHtml(s.lastDate) + '</strong></div>' : '') +
			'</div>'
			: '<p class="rn-d-muted">No attempts yet on this device.</p>';
		const modules = Array.isArray(m.modules) ? m.modules : [];
		const resources = Array.isArray(m.resources) ? m.resources : [];
		const modulesHtml = modules.length
			? '<div class="rn-d-block"><h4>Covered modules</h4><ul class="rn-d-modules">' +
				modules.map(mod => {
					const icon = typeof mod === 'string' ? 'fas fa-check-circle' : (mod.icon || 'fas fa-check-circle');
					const name = typeof mod === 'string' ? mod : (mod.name || '');
					return '<li><i class="' + safeIconClass(icon, 'fas fa-check-circle') + '" aria-hidden="true"></i> ' + escapeHtml(name) + '</li>';
				}).join('') + '</ul></div>'
			: '';
		const resourcesHtml = resources.length
			? '<div class="rn-d-block"><h4>Study resources</h4><div class="rn-d-resources">' +
				resources.map(r => '<a href="' + escapeHtml(safeHref(r.url)) + '" target="_blank" rel="noopener noreferrer">' +
					'<i class="' + safeIconClass(r.icon, 'fas fa-link') + '" aria-hidden="true"></i> ' + escapeHtml(r.name || 'Reference') + '</a>').join('') +
				'</div></div>'
			: '';
		return '<div class="rn-d-block"><h4>Exam information</h4><div class="rn-d-grid">' +
				info.map(kv => '<div><span>' + escapeHtml(kv[0]) + '</span><strong>' + escapeHtml(kv[1]) + '</strong></div>').join('') +
			'</div></div>' +
			'<div class="rn-d-block"><h4>Your progress</h4>' + progressHtml + '</div>' +
			modulesHtml + resourcesHtml;
	}

	function renderNode(node, isNext) {
		const li = document.createElement('li');
		li.className = 'roadmap-node is-' + node.nodeState + (isNext ? ' is-next' : '');
		li.setAttribute('data-pack', node.id);
		const dotIcon = node.nodeState === 'passed' ? '<i class="fas fa-check" aria-hidden="true"></i>' : '';
		const best = node.best != null ? '<span class="rn-best">Best: ' + node.best + '%</span>' : '';
		const pills =
			(node.level ? '<span class="rn-pill is-level">' + escapeHtml(node.level) + '</span>' : '') +
			'<span class="rn-pill ' + (node.isPro ? 'is-pro">PRO' : 'is-free">Free') + '</span>' +
			(node.role === 'prerequisite' ? '<span class="rn-pill is-prereq">Prerequisite</span>' : '');
		const primaryLabel = node.isPro ? PRO_LABEL[node.nodeState] : STATE_LABEL[node.nodeState];
		const unlock = node.isPro
			? '<button type="button" class="rn-cta action-btn ghost rn-unlock">Unlock full</button>'
			: '';
		li.innerHTML =
			'<span class="rn-dot" aria-hidden="true">' + dotIcon + '</span>' +
			'<div class="rn-row">' +
				'<span class="rn-code">' + escapeHtml(node.code) + '</span>' +
				'<span class="rn-name">' + escapeHtml(node.name) + '</span>' +
				pills + best +
				'<span class="rn-spacer"></span>' +
				'<a class="rn-cta action-btn secondary" href="' + escapeHtml(examHref(node.id)) + '">' + primaryLabel + '</a>' +
				unlock +
				'<button type="button" class="rn-expand" aria-expanded="false" aria-label="Show exam details"><i class="fas fa-chevron-down rn-caret" aria-hidden="true"></i></button>' +
			'</div>' +
			'<div class="rn-details" hidden></div>';

		const row = li.querySelector('.rn-row');
		const details = li.querySelector('.rn-details');
		const expandBtn = li.querySelector('.rn-expand');
		function toggle() {
			const open = li.classList.toggle('is-open');
			expandBtn.setAttribute('aria-expanded', String(open));
			expandBtn.setAttribute('aria-label', open ? 'Hide exam details' : 'Show exam details');
			if (open && !details.dataset.filled) {
				details.innerHTML = detailsMarkup(node);
				details.dataset.filled = '1';
			}
			details.hidden = !open;
		}
		row.addEventListener('click', (e) => {
			if (e.target.closest('a')) return;            // let the primary CTA navigate
			if (e.target.closest('.rn-unlock')) return;   // unlock has its own handler
			toggle();
		});
		li.querySelector('.rn-unlock')?.addEventListener('click', (e) => {
			e.stopPropagation();
			openProModal(node);
		});
		return li;
	}

	function renderPath() {
		const host = document.getElementById('roadmap-track-path');
		host.innerHTML = '';
		const track = state.tracks.find(t => t.id === state.selectedTrackId);
		if (!track) return;
		const m = trackModels(track);
		const title = document.createElement('h2');
		title.className = 'roadmap-track-title';
		title.textContent = track.name;
		const tagline = document.createElement('p');
		tagline.className = 'roadmap-track-tagline';
		tagline.textContent = track.tagline;
		const list = document.createElement('ol');
		list.className = 'roadmap-path';
		m.nodes.forEach((node, i) => list.appendChild(renderNode(node, i === m.nextIndex)));
		host.append(title, tagline, list);
	}

	// --- pro modal (mirrors homepage showProModal: highlights + price + Gumroad +
	// the import/license-key instruction; reuses home-v2.css .pro-modal-* classes) ---
	function closeProModal() {
		document.getElementById('pro-modal-overlay')?.remove();
		document.removeEventListener('keydown', onProKeydown);
	}
	function onProKeydown(e) { if (e.key === 'Escape') closeProModal(); }
	function openProModal(node) {
		const pro = (node.meta && node.meta.pro) || {};
		closeProModal();
		const overlay = document.createElement('div');
		overlay.className = 'pro-modal-overlay';
		overlay.id = 'pro-modal-overlay';
		const name = node.meta.name || node.id.toUpperCase();
		overlay.innerHTML =
			'<div class="pro-modal" role="dialog" aria-modal="true" aria-label="Unlock the full pack">' +
				'<button type="button" class="pro-modal-close" aria-label="Close"><i class="fas fa-times" aria-hidden="true"></i></button>' +
				'<h2 class="pro-modal-title">' + escapeHtml(pro.title || (name + ' Complete')) + '</h2>' +
				'<p class="pro-modal-sub">You are viewing the free preview. Unlock the complete ' + escapeHtml(name) + ' pack.</p>' +
				(Array.isArray(pro.highlights) && pro.highlights.length
					? '<ul class="pro-modal-list">' + pro.highlights.map(h => '<li><i class="fas fa-check" aria-hidden="true"></i> ' + escapeHtml(h) + '</li>').join('') + '</ul>'
					: '') +
				'<a class="pro-modal-buy" href="' + escapeHtml(safeHref(pro.url)) + '" target="_blank" rel="noopener noreferrer">' +
					'<i class="fas fa-store" aria-hidden="true"></i> Get the full pack' + (pro.price ? ' (' + escapeHtml(pro.price) + ')' : '') + '</a>' +
				'<div class="pro-modal-divider"></div>' +
				'<p class="pro-modal-activate-text">Already purchased? Import your pack file and enter your license key on the homepage to activate it on this device.</p>' +
				'<a class="pro-modal-import" href="' + escapeHtml((window.ExamApp?.router?.buildUrl?.('home')) || 'index.html') + '"><i class="fas fa-file-import" aria-hidden="true"></i> Import on the homepage</a>' +
			'</div>';
		document.body.appendChild(overlay);
		overlay.addEventListener('click', (e) => { if (e.target === overlay) closeProModal(); });
		overlay.querySelector('.pro-modal-close')?.addEventListener('click', closeProModal);
		overlay.querySelector('.pro-modal-buy')?.addEventListener('click', () => {
			window.ExamApp?.analytics?.trackEvent?.('roadmap_pro_purchase', { exam: node.id });
		});
		document.addEventListener('keydown', onProKeydown);
		window.ExamApp?.analytics?.trackEvent?.('roadmap_pro_modal', { exam: node.id });
	}

	function selectTrack(trackId) {
		state.selectedTrackId = trackId;
		renderIndex();
		renderPath();
		window.ExamApp?.analytics?.trackEvent?.('roadmap_track_select', { track: trackId });
	}

	async function init() {
		try { await window.ExamApp?.examStorage?.hydrateProgressMirror?.(); } catch (_) { /* best effort */ }
		const data = await fetchJson('user-content/roadmaps.json');
		state.tracks = data.tracks || [];
		const ids = [...new Set(state.tracks.flatMap(t => t.packs.map(e => resolveEntry(e).id)))];
		const metas = await Promise.all(ids.map(id =>
			fetchJson('user-content/exams/' + id + '/metadata.json').catch(() => ({ id }))));
		ids.forEach((id, i) => { state.metaById[id] = metas[i]; });
		state.selectedTrackId = state.tracks[0] && state.tracks[0].id;
		renderIndex();
		renderPath();
		window.Roadmaps.ready = true;
		window.ExamApp?.analytics?.trackEvent?.('roadmap_view', {});
	}

	window.Roadmaps = { ready: false, deriveNodeState, resolveEntry, selectTrack };
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
