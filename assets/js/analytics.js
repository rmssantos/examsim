// Privacy-conscious analytics for the public GitHub Pages deployment.
// Sends aggregate product metrics only; no visitor ID, questions, answers, filenames, or imported content.
(function () {
    'use strict';

    const CONFIG = Object.freeze({
        connectionString: '__APPINSIGHTS_CONNECTION_STRING__',
        publicHost: 'rmssantos.github.io',
        optOutKey: 'exam_analytics_opt_out',
        analyticsVersion: '1.0.0',
        publicExamIds: Object.freeze(['ab730', 'ab731', 'sc900'])
    });

    const connection = parseConnectionString(CONFIG.connectionString);
    const publicExamIds = new Set(CONFIG.publicExamIds);

    function parseConnectionString(value) {
        return String(value || '').split(';').reduce((result, part) => {
            const separator = part.indexOf('=');
            if (separator > 0) {
                result[part.slice(0, separator)] = part.slice(separator + 1);
            }
            return result;
        }, {});
    }

    function safeLocalStorageGet(key) {
        try {
            return localStorage.getItem(key);
        } catch (_) {
            return null;
        }
    }

    function safeLocalStorageSet(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (_) {
            return false;
        }
    }

    function safeLocalStorageRemove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (_) {
            return false;
        }
    }

    function isGitHubPagesHost(hostname = window.location.hostname) {
        return hostname === CONFIG.publicHost;
    }

    function isOptedOut() {
        return safeLocalStorageGet(CONFIG.optOutKey) === 'true';
    }

    function isEnabled() {
        return Boolean(connection.InstrumentationKey && connection.IngestionEndpoint && isGitHubPagesHost() && !isOptedOut());
    }

    function pageNameFromPath(pathname = window.location.pathname) {
        const page = String(pathname || '').split('/').pop() || 'index.html';
        if (page === 'index.html' || page === '') return 'home';
        if (page === 'exam.html') return 'exam';
        if (page === 'editor.html') return 'editor';
        return 'other';
    }

    function currentPath() {
        return String(window.location.pathname || '').replace(/[^/A-Za-z0-9_.-]/g, '').slice(0, 120) || '/';
    }

    function normalizeString(value, maxLength = 80) {
        return String(value ?? '')
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/[^A-Za-z0-9 _./:-]/g, '')
            .trim()
            .slice(0, maxLength);
    }

    function sanitizeProperties(properties = {}) {
        const sanitized = {};
        Object.entries(properties || {}).forEach(([key, value]) => {
            const safeKey = normalizeString(key, 60).replace(/[^A-Za-z0-9_.-]/g, '_');
            if (!safeKey) return;

            if (typeof value === 'boolean') {
                sanitized[safeKey] = String(value);
            } else if (typeof value === 'number' && Number.isFinite(value)) {
                sanitized[safeKey] = String(value);
            } else if (value != null) {
                sanitized[safeKey] = normalizeString(value, 120);
            }
        });
        return sanitized;
    }

    function sanitizeMeasurements(measurements = {}) {
        const sanitized = {};
        Object.entries(measurements || {}).forEach(([key, value]) => {
            const safeKey = normalizeString(key, 60).replace(/[^A-Za-z0-9_.-]/g, '_');
            const numberValue = Number(value);
            if (safeKey && Number.isFinite(numberValue)) {
                sanitized[safeKey] = numberValue;
            }
        });
        return sanitized;
    }

    function getExamProperties(examId) {
        const normalized = String(examId || '').trim().toLowerCase();
        if (publicExamIds.has(normalized)) {
            return { exam_id: normalized, exam_source: 'bundled' };
        }
        return { exam_id: 'imported', exam_source: 'imported' };
    }

    function scoreBucket(score) {
        const value = Number(score);
        if (!Number.isFinite(value)) return 'unknown';
        if (value < 50) return '0-49';
        if (value < 70) return '50-69';
        if (value < 90) return '70-89';
        return '90-100';
    }

    function durationBucket(minutes) {
        const value = Number(minutes);
        if (!Number.isFinite(value)) return 'unknown';
        if (value < 5) return '<5m';
        if (value < 15) return '5-15m';
        if (value < 30) return '15-30m';
        return '30m+';
    }

    function fileSizeBucket(bytes) {
        const value = Number(bytes);
        if (!Number.isFinite(value)) return 'unknown';
        if (value < 100 * 1024) return '<100kb';
        if (value < 1024 * 1024) return '100kb-1mb';
        if (value < 5 * 1024 * 1024) return '1mb-5mb';
        return '5mb+';
    }

    function fileTypeFromName(fileName) {
        const lower = String(fileName || '').toLowerCase();
        if (lower.endsWith('.zip')) return 'zip';
        if (lower.endsWith('.json')) return 'json';
        return 'other';
    }

    function defaultProperties() {
        return {
            app: 'examsim',
            deployment: 'github_pages',
            page: pageNameFromPath(),
            path: currentPath(),
            analytics_version: CONFIG.analyticsVersion
        };
    }

    function buildEnvelope(name, properties, measurements) {
        const instrumentationKey = connection.InstrumentationKey;
        return {
            time: new Date().toISOString(),
            iKey: instrumentationKey,
            name: `Microsoft.ApplicationInsights.${instrumentationKey}.Event`,
            tags: {
                'ai.cloud.role': 'github-pages',
                'ai.operation.name': pageNameFromPath()
            },
            data: {
                baseType: 'EventData',
                baseData: {
                    ver: 2,
                    name: normalizeString(name, 80),
                    properties: sanitizeProperties({ ...defaultProperties(), ...properties }),
                    measurements: sanitizeMeasurements(measurements)
                }
            }
        };
    }

    function sendEnvelope(envelope) {
        if (!isEnabled()) return false;

        const endpoint = `${connection.IngestionEndpoint.replace(/\/$/, '')}/v2/track`;
        try {
            fetch(endpoint, {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit',
                keepalive: true,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify([envelope])
            }).catch(() => {});
            return true;
        } catch (_) {
            return false;
        }
    }

    function trackEvent(name, properties = {}, measurements = {}) {
        return sendEnvelope(buildEnvelope(name, properties, measurements));
    }

    function trackPageView() {
        return trackEvent('page_view');
    }

    function trackExamStarted(examId, details = {}) {
        return trackEvent('exam_started', getExamProperties(examId), {
            question_count: details.questionCount
        });
    }

    function trackExamCompleted(examId, details = {}) {
        return trackEvent('exam_completed', {
            ...getExamProperties(examId),
            passed: Boolean(details.passed),
            score_bucket: scoreBucket(details.score),
            duration_bucket: durationBucket(details.timeSpent)
        }, {
            question_count: details.questionCount
        });
    }

    function trackImportStarted(file) {
        return trackEvent('import_started', {
            file_type: fileTypeFromName(file?.name),
            file_size_bucket: fileSizeBucket(file?.size)
        });
    }

    function trackImportCompleted(file) {
        return trackEvent('import_completed', {
            file_type: fileTypeFromName(file?.name),
            file_size_bucket: fileSizeBucket(file?.size)
        });
    }

    function trackImportFailed(file, reason = 'unknown') {
        return trackEvent('import_failed', {
            file_type: fileTypeFromName(file?.name),
            file_size_bucket: fileSizeBucket(file?.size),
            reason: normalizeString(reason, 40) || 'unknown'
        });
    }

    function setOptOut(disabled) {
        if (disabled) {
            safeLocalStorageSet(CONFIG.optOutKey, 'true');
        } else {
            safeLocalStorageRemove(CONFIG.optOutKey);
        }
        updatePrivacyButtonState();
    }

    function injectPrivacyStyles() {
        if (document.getElementById('analytics-privacy-styles')) return;
        const style = document.createElement('style');
        style.id = 'analytics-privacy-styles';
        style.textContent = `
.analytics-privacy-button{position:fixed;right:12px;bottom:10px;z-index:1000;border:0;background:rgba(255,255,255,.72);color:#4b5563;font-size:11px;padding:5px 8px;border-radius:999px;box-shadow:0 1px 8px rgba(15,23,42,.12);cursor:pointer;opacity:.55;transition:opacity .2s ease,background .2s ease}.analytics-privacy-button:hover,.analytics-privacy-button:focus-visible{opacity:1;background:#fff}.analytics-privacy-overlay{position:fixed;inset:0;z-index:11000;background:rgba(15,23,42,.42);display:flex;align-items:center;justify-content:center;padding:16px}.analytics-privacy-dialog{width:min(420px,100%);background:var(--card-bg,#fff);color:var(--text,#111827);border:1px solid var(--border-light,#e5e7eb);border-radius:8px;box-shadow:0 18px 45px rgba(15,23,42,.25);padding:20px}.analytics-privacy-dialog h2{font-size:1.1rem;margin:0 0 10px}.analytics-privacy-dialog p{font-size:.9rem;line-height:1.5;margin:0 0 12px;color:var(--text-light,#4b5563)}.analytics-privacy-status{font-size:.82rem;font-weight:700;margin:10px 0 16px}.analytics-privacy-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.analytics-privacy-actions button,.analytics-privacy-actions a{border-radius:6px;border:1px solid var(--border,#d1d5db);background:var(--bg-gray,#f8fafc);color:var(--text,#111827);font-size:.86rem;font-weight:600;padding:8px 10px;text-decoration:none;cursor:pointer}.analytics-privacy-actions .primary{background:#0066cc;color:#fff;border-color:#0066cc}.analytics-privacy-actions .danger{background:#fff;color:#b42318;border-color:#f3b7b0}.dark-mode .analytics-privacy-button,[data-theme="dark"] .analytics-privacy-button{background:rgba(31,41,55,.78);color:#d1d5db}.dark-mode .analytics-privacy-button:hover,[data-theme="dark"] .analytics-privacy-button:hover{background:#1f2937}`;
        document.head.appendChild(style);
    }

    function updatePrivacyButtonState() {
        const button = document.getElementById('analytics-privacy-button');
        if (!button) return;
        button.title = isOptedOut() ? 'Analytics are off' : 'Analytics are on';
    }

    function showPrivacyDialog() {
        const existing = document.getElementById('analytics-privacy-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'analytics-privacy-overlay';
        overlay.className = 'analytics-privacy-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'analytics-privacy-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'analytics-privacy-title');

        const title = document.createElement('h2');
        title.id = 'analytics-privacy-title';
        title.textContent = 'Privacy settings';
        dialog.appendChild(title);

        const description = document.createElement('p');
        description.textContent = 'The online version collects aggregate visits and exam usage metrics. It does not collect questions, answers, imported files, filenames, names, emails, or a persistent visitor ID.';
        dialog.appendChild(description);

        const status = document.createElement('div');
        status.className = 'analytics-privacy-status';
        status.textContent = isOptedOut() ? 'Analytics are off in this browser.' : 'Analytics are on for aggregate site metrics.';
        dialog.appendChild(status);

        const actions = document.createElement('div');
        actions.className = 'analytics-privacy-actions';

        const docs = document.createElement('a');
        docs.href = 'PRIVACY-AND-STORAGE.md';
        docs.target = '_blank';
        docs.rel = 'noopener noreferrer';
        docs.textContent = 'Privacy notes';
        actions.appendChild(docs);

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = isOptedOut() ? 'primary' : 'danger';
        toggle.textContent = isOptedOut() ? 'Turn analytics on' : 'Turn analytics off';
        toggle.addEventListener('click', () => {
            setOptOut(!isOptedOut());
            overlay.remove();
        });
        actions.appendChild(toggle);

        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = 'Close';
        close.addEventListener('click', () => overlay.remove());
        actions.appendChild(close);

        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) overlay.remove();
        });
        document.body.appendChild(overlay);
    }

    function injectPrivacyButton() {
        if (!isGitHubPagesHost() || document.getElementById('analytics-privacy-button')) return;
        injectPrivacyStyles();
        const button = document.createElement('button');
        button.id = 'analytics-privacy-button';
        button.type = 'button';
        button.className = 'analytics-privacy-button';
        button.textContent = 'Privacy settings';
        button.addEventListener('click', showPrivacyDialog);
        document.body.appendChild(button);
        updatePrivacyButtonState();
    }

    function init() {
        injectPrivacyButton();
        trackPageView();
    }

    window.ExamApp = window.ExamApp || {};
    window.ExamApp.analytics = Object.freeze({
        trackEvent,
        trackPageView,
        trackExamStarted,
        trackExamCompleted,
        trackImportStarted,
        trackImportCompleted,
        trackImportFailed,
        setOptOut,
        isEnabled,
        isOptedOut,
        _private: Object.freeze({
            isGitHubPagesHost,
            getExamProperties,
            scoreBucket,
            durationBucket,
            fileSizeBucket,
            buildEnvelope
        })
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
