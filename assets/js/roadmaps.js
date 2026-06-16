(function () {
	'use strict';

	const STATE_LABEL = { 'passed': 'Review', 'started': 'Continue', 'not-started': 'Start' };
	const PRO_LABEL = { 'passed': 'Review', 'started': 'Continue', 'not-started': 'Open preview' };

	function resolveEntry(entry) {
		if (typeof entry === 'string') return { id: entry, role: 'core' };
		return { id: entry.id, role: entry.role || 'core' };
	}

	function readProgress(id) {
		try { return JSON.parse(localStorage.getItem(id + '_progress')); }
		catch (_) { return null; }
	}

	// The app shows passed/failed using a flat 70% on bestScore (script-multi-exam.js
	// progress modal + homepage readiness). Match it EXACTLY so the roadmap status
	// always agrees with the home cards, including AWS (real pass mark 72%).
	const PASS_THRESHOLD = 70;

	function deriveNodeState(progress) {
		const attempts = progress && Array.isArray(progress.attempts) ? progress.attempts : [];
		if (!attempts.length) return 'not-started';
		const best = Number(progress && progress.bestScore) || 0;
		return best >= PASS_THRESHOLD ? 'passed' : 'started';
	}

	async function fetchJson(url) {
		const res = await fetch(url, { credentials: 'same-origin' });
		if (!res.ok) throw new Error('Failed to load ' + url);
		return res.json();
	}

	const state = { tracks: [], metaById: {}, selectedTrackId: null };

	function nodeModel(entry) {
		const { id, role } = resolveEntry(entry);
		const meta = state.metaById[id] || {};
		const progress = readProgress(id);
		const isPro = meta.commercialStatus === 'pro-preview';
		const attemptCount = progress && Array.isArray(progress.attempts) ? progress.attempts.length : 0;
		const best = attemptCount ? (Number(progress.bestScore) || 0) : null;
		return {
			id, role, isPro, best,
			code: meta.certificationCode || meta.name || id.toUpperCase(),
			name: meta.fullName || meta.name || id,
			level: meta.level || meta.badge || '',
			proUrl: meta.pro && meta.pro.url,
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
				'<i aria-hidden="true" class="rt-icon ' + track.icon + '"></i>' +
				'<span><span class="rt-name">' + track.name + '</span>' +
				'<span class="rt-count">' + m.passedCount + '/' + m.total + ' done</span></span>';
			btn.addEventListener('click', () => selectTrack(track.id));
			host.appendChild(btn);
		});
		const gp = document.getElementById('roadmap-global-progress');
		if (gp) gp.textContent = totalPassed + ' of ' + totalNodes + ' packs passed';
	}

	function ctaHref(id) { return 'exam.html?exam=' + encodeURIComponent(id); }

	function renderNode(node, isNext) {
		const li = document.createElement('li');
		li.className = 'roadmap-node is-' + node.nodeState + (isNext ? ' is-next' : '');
		li.setAttribute('data-pack', node.id);
		const dotIcon = node.nodeState === 'passed' ? '<i class="fas fa-check" aria-hidden="true"></i>' : '';
		const pills =
			(node.level ? '<span class="rn-pill is-level">' + node.level + '</span>' : '') +
			'<span class="rn-pill ' + (node.isPro ? 'is-pro">PRO' : 'is-free">Free') + '</span>' +
			(node.role === 'prerequisite' ? '<span class="rn-pill is-prereq">Prerequisite</span>' : '');
		// Same "Best: X%" figure the home cards / progress modal show (single source).
		const best = node.best != null ? '<span class="rn-best">Best: ' + node.best + '%</span>' : '';
		const primaryLabel = node.isPro ? PRO_LABEL[node.nodeState] : STATE_LABEL[node.nodeState];
		const unlock = (node.isPro && node.proUrl)
			? '<a class="rn-cta action-btn ghost" href="' + node.proUrl + '" target="_blank" rel="noopener noreferrer">Unlock full</a>'
			: '';
		li.innerHTML =
			'<span class="rn-dot" aria-hidden="true">' + dotIcon + '</span>' +
			'<div class="rn-row">' +
				'<span class="rn-code">' + node.code + '</span>' +
				'<span class="rn-name">' + node.name + '</span>' +
				pills + best +
				'<span class="rn-spacer"></span>' +
				'<a class="rn-cta action-btn secondary" href="' + ctaHref(node.id) + '">' + primaryLabel + '</a>' +
				unlock +
			'</div>';
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
