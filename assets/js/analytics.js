// Privacy-conscious analytics for the public GitHub Pages deployment.
// Sends aggregate product metrics only; no visitor ID, questions, answers, filenames, or imported content.
(function () {
    'use strict';

    const CONFIG = Object.freeze({
        connectionString: '__APPINSIGHTS_CONNECTION_STRING__',
        optOutKey: 'exam_analytics_opt_out',
        analyticsVersion: '1.0.0',
        publicExamIds: Object.freeze(['ab730', 'ab731', 'sc900', 'az900', 'az104'])
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

    function isPublicSiteHost(hostname = window.location.hostname) {
        return window.ExamApp.isPublicSiteHost(hostname);
    }

    function isOptedOut() {
        return safeLocalStorageGet(CONFIG.optOutKey) === 'true';
    }

    function hasValidConnection() {
        return Boolean(connection.InstrumentationKey && connection.IngestionEndpoint);
    }

    function isEnabled() {
        return Boolean(hasValidConnection() && isPublicSiteHost() && !isOptedOut());
    }

    function analyticsStatusLabel() {
        if (!isPublicSiteHost()) return 'Analytics are off outside the public site.';
        if (isOptedOut()) return 'Analytics are off in this browser.';
        if (!hasValidConnection()) return 'Analytics are unavailable in this build.';
        return 'Analytics are on for aggregate site metrics.';
    }

    function pageNameFromPath(pathname = window.location.pathname) {
        const path = String(pathname || '');
        const page = path.split('/').pop() || 'index.html';
        if (page === 'editor') return 'editor';
        if (page === 'exam') return 'exam';
        if (page === 'study') return 'study';
        if (page === 'index.html' || page === '') return 'home';
        if (page === 'exam.html') return 'exam';
        if (page === 'editor.html') return 'editor';
        return 'other';
    }

    function currentPath() {
        return String(window.location.pathname || '').replace(/[^/A-Za-z0-9_.-]/g, '').slice(0, 120) || '/';
    }

    function currentPageUrl() {
        try {
            const url = new URL(window.location.href);
            url.search = '';
            url.hash = '';
            return url.toString().slice(0, 500);
        } catch (_) {
            return currentPath();
        }
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

    function buildPageViewEnvelope(properties = {}, measurements = {}) {
        const instrumentationKey = connection.InstrumentationKey;
        const pageName = pageNameFromPath();
        return {
            time: new Date().toISOString(),
            iKey: instrumentationKey,
            name: `Microsoft.ApplicationInsights.${instrumentationKey}.Pageview`,
            tags: {
                'ai.cloud.role': 'github-pages',
                'ai.operation.name': pageName
            },
            data: {
                baseType: 'PageviewData',
                baseData: {
                    ver: 2,
                    name: pageName,
                    url: currentPageUrl(),
                    duration: '00:00:00.000',
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
        return sendEnvelope(buildPageViewEnvelope());
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

    function trackStudyStarted(examId, details = {}) {
        return trackEvent('study_started', getExamProperties(examId), {
            question_count: details.questionCount,
            due_count: details.dueCount,
            new_count: details.newCount,
            weak_count: details.weakCount
        });
    }

    function trackStudyQuestionAnswered(examId, details = {}) {
        return trackEvent('study_question_answered', {
            ...getExamProperties(examId),
            result: details.isCorrect ? 'correct' : 'incorrect',
            answer_state: details.wasAnswered ? 'answered' : 'blank'
        });
    }

    function trackStudyCompleted(examId, details = {}) {
        const answeredCount = Number(details.answeredCount || 0);
        const correctCount = Number(details.correctCount || 0);
        const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
        return trackEvent('study_completed', {
            ...getExamProperties(examId),
            accuracy_bucket: scoreBucket(accuracy),
            duration_bucket: durationBucket(details.timeSpent)
        }, {
            question_count: details.questionCount,
            answered_count: answeredCount,
            correct_count: correctCount
        });
    }

    function trackAttemptReviewOpened(examId, details = {}) {
        return trackEvent('attempt_review_opened', {
            ...getExamProperties(examId),
            has_question_details: Boolean(details.hasQuestionDetails)
        }, {
            question_count: details.questionCount
        });
    }

    function trackStudyMissedStarted(examId, details = {}) {
        return trackEvent('study_missed_started', getExamProperties(examId), {
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

    function trackStorageMigration(dataType = 'unknown', status = 'unknown') {
        return trackEvent('storage_migration', {
            data_type: normalizeString(dataType, 40) || 'unknown',
            status: normalizeString(status, 40) || 'unknown'
        });
    }

    function setOptOut(disabled) {
        const persisted = disabled
            ? safeLocalStorageSet(CONFIG.optOutKey, 'true')
            : safeLocalStorageRemove(CONFIG.optOutKey);
        if (persisted) updatePrivacyButtonState();
        return persisted;
    }

    function updatePrivacyButtonState() {
        const button = document.getElementById('analytics-privacy-button');
        if (!button) return;
        button.title = analyticsStatusLabel();
    }

    function getFocusableElements(container) {
        return Array.from(container.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
            .filter(element => !element.hasAttribute('hidden') && element.offsetParent !== null);
    }

    function showPrivacyDialog() {
        const existing = document.getElementById('analytics-privacy-overlay');
        if (existing) existing.remove();

        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        const overlay = document.createElement('div');
        overlay.id = 'analytics-privacy-overlay';
        overlay.className = 'analytics-privacy-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'analytics-privacy-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'analytics-privacy-title');
        dialog.tabIndex = -1;

        const title = document.createElement('h2');
        title.id = 'analytics-privacy-title';
        title.textContent = 'Privacy settings';
        dialog.appendChild(title);

        const description = document.createElement('p');
        description.textContent = 'The online version collects aggregate visits and exam usage metrics. It does not collect questions, answers, imported files, filenames, names, emails, or a persistent visitor ID.';
        dialog.appendChild(description);

        const status = document.createElement('div');
        status.className = 'analytics-privacy-status';
        status.textContent = analyticsStatusLabel();
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
            const saved = setOptOut(!isOptedOut());
            if (saved) {
                closeDialog();
                return;
            }
            status.classList.add('error');
            status.textContent = 'Could not save the analytics preference in this browser.';
        });
        actions.appendChild(toggle);

        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = 'Close';
        close.addEventListener('click', closeDialog);
        actions.appendChild(close);

        function closeDialog() {
            document.removeEventListener('keydown', handleKeydown);
            overlay.remove();
            if (previousFocus && document.contains(previousFocus)) {
                previousFocus.focus({ preventScroll: true });
            }
        }

        function handleKeydown(event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeDialog();
                return;
            }

            if (event.key !== 'Tab') return;

            const focusable = getFocusableElements(dialog);
            if (focusable.length === 0) {
                event.preventDefault();
                dialog.focus({ preventScroll: true });
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }

        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeDialog();
        });
        document.body.appendChild(overlay);
        document.addEventListener('keydown', handleKeydown);
        toggle.focus({ preventScroll: true });
    }

    function injectPrivacyButton() {
        if (!isPublicSiteHost() || document.getElementById('analytics-privacy-button')) return;
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
        trackStudyStarted,
        trackStudyQuestionAnswered,
        trackStudyCompleted,
        trackAttemptReviewOpened,
        trackStudyMissedStarted,
        trackImportStarted,
        trackImportCompleted,
        trackImportFailed,
        trackStorageMigration,
        setOptOut,
        isEnabled,
        isOptedOut,
        _private: Object.freeze({
            isPublicSiteHost,
            getExamProperties,
            scoreBucket,
            durationBucket,
            fileSizeBucket,
            buildEnvelope,
            buildPageViewEnvelope
        })
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
