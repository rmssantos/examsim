/**
 * Shared utility functions for the Exam Simulator
 */

// Global namespace for ExamApp
window.ExamApp = window.ExamApp || {};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

window.ExamApp.EXAM_LIMITS = Object.freeze({
    maxJsonBytes: 5 * 1024 * 1024,
    maxZipBytes: 50 * 1024 * 1024,
    maxZipEntries: 512,
    maxZipUncompressedBytes: 120 * 1024 * 1024,
    maxQuestions: 1000,
    maxImages: 250,
    maxImageBytes: 10 * 1024 * 1024,
    maxTotalImageBytes: 100 * 1024 * 1024,
    maxProgressExams: 100,
    maxProgressAttempts: 500,
    maxProgressQuestionResults: 1000,
    maxProgressModules: 50,
    maxProgressStringLength: 5000,
    maxTextLength: 20000,
    maxOptionLength: 5000,
    allowedImageExtensions: Object.freeze(['jpg', 'jpeg', 'png', 'gif', 'webp']),
    allowedImageMimeTypes: Object.freeze(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
});

// Hosts that serve the public deployment. Single source of truth shared by
// analytics gating and local-only link hiding.
window.ExamApp.PUBLIC_HOSTS = Object.freeze(['examplar.app', 'www.examplar.app', 'rmssantos.github.io']);
window.ExamApp.isPublicSiteHost = function isPublicSiteHost(hostname = window.location.hostname) {
    return window.ExamApp.PUBLIC_HOSTS.includes(hostname);
};

function safeGetLocalStorage(key) {
    try {
        return localStorage.getItem(key);
    } catch (_) {
        return null;
    }
}

window.ExamApp.DEBUG = new URLSearchParams(window.location.search).has('debug') || safeGetLocalStorage('exam_debug') === 'true';
window.ExamApp.log = function log(...args) {
    if (window.ExamApp.DEBUG) console.log(...args);
};

window.ExamApp.warn = function warn(...args) {
    if (window.ExamApp.DEBUG) console.warn(...args);
};

window.ExamApp.STORAGE_KEYS = Object.freeze({
    exams: 'exam_registry',
    progress: 'exam_progress_registry'
});

window.ExamApp.getRegistry = function getRegistry(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(parsed) ? parsed.filter(window.ExamApp.isSafeExamId) : [];
    } catch (_) {
        return [];
    }
};

window.ExamApp.setRegistry = function setRegistry(key, values) {
    const unique = [...new Set((values || []).filter(window.ExamApp.isSafeExamId))].sort();
    localStorage.setItem(key, JSON.stringify(unique));
    return unique;
};

window.ExamApp.addToRegistry = function addToRegistry(key, examId) {
    if (!window.ExamApp.isSafeExamId(examId)) return window.ExamApp.getRegistry(key);
    const values = window.ExamApp.getRegistry(key);
    if (!values.includes(examId)) values.push(examId);
    return window.ExamApp.setRegistry(key, values);
};

window.ExamApp.removeFromRegistry = function removeFromRegistry(key, examId) {
    return window.ExamApp.setRegistry(key, window.ExamApp.getRegistry(key).filter((id) => id !== examId));
};

window.ExamApp.isSafeExamId = function isSafeExamId(value) {
    const examId = String(value || '').trim();
    const reservedIds = ['__proto__', 'prototype', 'constructor'];
    return !reservedIds.includes(examId.toLowerCase())
        && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(examId);
};

window.ExamApp.normalizeExamId = function normalizeExamId(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
    return window.ExamApp.isSafeExamId(normalized) ? normalized : null;
};

window.ExamApp.getImageExtension = function getImageExtension(fileName) {
    const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
};

window.ExamApp.isSafeImageFileName = function isSafeImageFileName(fileName) {
    const name = String(fileName || '').trim();
    const extension = window.ExamApp.getImageExtension(name);
    return Boolean(
        name &&
        name.length <= 128 &&
        !name.startsWith('.') &&
        !name.includes('/') &&
        !name.includes('\\') &&
        /^[A-Za-z0-9_. -]+$/.test(name) &&
        window.ExamApp.EXAM_LIMITS.allowedImageExtensions.includes(extension)
    );
};

window.ExamApp.getImageMimeType = function getImageMimeType(fileName) {
    const extension = window.ExamApp.getImageExtension(fileName);
    const mimeTypes = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp'
    };
    return mimeTypes[extension] || null;
};

window.ExamApp.inspectZipEntries = function inspectZipEntries(zip) {
    if (!zip || typeof zip.forEach !== 'function') {
        throw new Error('Invalid ZIP archive.');
    }

    const limits = window.ExamApp.EXAM_LIMITS;
    let entryCount = 0;
    let totalBytes = 0;
    let totalImageBytes = 0;
    let dumpEntry = null;
    let metadataEntry = null;
    const imageFiles = [];

    zip.forEach((relativePath, entry) => {
        entryCount += 1;
        if (entryCount > limits.maxZipEntries) {
            throw new Error(`ZIP contains too many entries. Maximum is ${limits.maxZipEntries}.`);
        }
        if (entry.dir) return;

        const normalized = String(relativePath || entry.name || '')
            .replace(/\\/g, '/')
            .replace(/^\/+/, '');
        const uncompressedSize = Number(entry?._data?.uncompressedSize);
        if (!Number.isSafeInteger(uncompressedSize) || uncompressedSize < 0) {
            throw new Error(`Unable to verify the uncompressed size of ${normalized || 'a ZIP entry'}.`);
        }

        totalBytes += uncompressedSize;
        if (totalBytes > limits.maxZipUncompressedBytes) {
            throw new Error(`ZIP expands beyond the ${Math.round(limits.maxZipUncompressedBytes / 1024 / 1024)} MB safety limit.`);
        }

        if (/(^|\/)dump\.json$/i.test(normalized)) {
            if (uncompressedSize > limits.maxJsonBytes) {
                throw new Error(`dump.json is too large. Maximum size is ${Math.round(limits.maxJsonBytes / 1024 / 1024)} MB.`);
            }
            if (!dumpEntry || normalized.length < dumpEntry.normalizedPath.length) {
                dumpEntry = { entry, normalizedPath: normalized };
            }
        }

        if (/(^|\/)metadata\.json$/i.test(normalized)) {
            if (uncompressedSize > limits.maxJsonBytes) {
                throw new Error(`metadata.json is too large. Maximum size is ${Math.round(limits.maxJsonBytes / 1024 / 1024)} MB.`);
            }
            if (!metadataEntry || normalized.length < metadataEntry.normalizedPath.length) {
                metadataEntry = { entry, normalizedPath: normalized };
            }
        }

        if (/\.(jpg|jpeg|png|gif|webp)$/i.test(normalized)) {
            const fileName = normalized.split('/').pop();
            if (!window.ExamApp.isSafeImageFileName(fileName)) return;
            if (uncompressedSize > limits.maxImageBytes) {
                throw new Error(`Image ${fileName} is too large. Maximum size is ${Math.round(limits.maxImageBytes / 1024 / 1024)} MB.`);
            }
            totalImageBytes += uncompressedSize;
            imageFiles.push({ fileName, entry });
            if (imageFiles.length > limits.maxImages) {
                throw new Error(`ZIP contains too many images. Maximum is ${limits.maxImages}.`);
            }
            if (totalImageBytes > limits.maxTotalImageBytes) {
                throw new Error(`ZIP images are too large in total. Maximum is ${Math.round(limits.maxTotalImageBytes / 1024 / 1024)} MB.`);
            }
        }
    });

    return {
        dumpEntry: dumpEntry?.entry || null,
        metadataEntry: metadataEntry?.entry || null,
        imageFiles,
        entryCount,
        totalBytes
    };
};

window.ExamApp.normalizeProgressRecord = function normalizeProgressRecord(progress) {
    const limits = window.ExamApp.EXAM_LIMITS;
    if (!progress || typeof progress !== 'object' || Array.isArray(progress) || !Array.isArray(progress.attempts)) {
        return null;
    }
    if (progress.attempts.length > limits.maxProgressAttempts) return null;

    const isFiniteNumber = (value, min, max) => (
        typeof value === 'number'
        && Number.isFinite(value)
        && value >= min
        && value <= max
    );
    const isInteger = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
    const normalizeString = (value, maxLength = limits.maxProgressStringLength) => {
        if (typeof value !== 'string' || value.length > maxLength) return null;
        return value;
    };
    const normalizeAnswer = (answer) => {
        if (answer === null || answer === undefined || answer === '') return null;
        if (Number.isInteger(answer) && answer >= 0 && answer <= limits.maxQuestions) return answer;
        if (typeof answer === 'string' && answer.length <= limits.maxProgressStringLength) return answer;
        if (!Array.isArray(answer) || answer.length > limits.maxQuestions) return undefined;
        const values = answer.map((value) => {
            if (Number.isInteger(value) && value >= 0 && value <= limits.maxQuestions) return value;
            if (typeof value === 'string' && value.length <= limits.maxProgressStringLength) return value;
            return undefined;
        });
        return values.includes(undefined) ? undefined : values;
    };

    const attempts = [];
    for (const source of progress.attempts) {
        if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
        if (!isFiniteNumber(source.score, 0, 100)) return null;
        if (source.date !== undefined && (
            typeof source.date !== 'string'
            || source.date.length > 64
            || Number.isNaN(Date.parse(source.date))
        )) return null;
        if (source.passed !== undefined && typeof source.passed !== 'boolean') return null;
        if (source.timeSpent !== undefined && !isFiniteNumber(source.timeSpent, 0, 525600)) return null;

        const attempt = {
            score: source.score,
            passed: source.passed === true,
            timeSpent: source.timeSpent === undefined ? 0 : source.timeSpent
        };

        if (source.attemptId !== undefined) {
            const attemptId = normalizeString(source.attemptId, 200);
            if (attemptId === null) return null;
            attempt.attemptId = attemptId;
        }
        if (source.date !== undefined) attempt.date = source.date;

        for (const field of ['questionCount', 'correctCount', 'incorrectCount', 'skippedCount']) {
            if (source[field] === undefined) continue;
            if (!isInteger(source[field], 0, limits.maxQuestions)) return null;
            attempt[field] = source[field];
        }

        if (source.hasReviewDetails !== undefined) {
            if (typeof source.hasReviewDetails !== 'boolean') return null;
            attempt.hasReviewDetails = source.hasReviewDetails;
        }

        if (source.questionResults !== undefined) {
            if (!Array.isArray(source.questionResults) || source.questionResults.length > limits.maxProgressQuestionResults) {
                return null;
            }
            attempt.questionResults = [];
            for (const sourceResult of source.questionResults) {
                if (!sourceResult || typeof sourceResult !== 'object' || Array.isArray(sourceResult)) return null;
                const questionId = normalizeString(String(sourceResult.questionId ?? ''), 200);
                const answer = normalizeAnswer(sourceResult.userAnswer);
                if (
                    !questionId
                    || !isInteger(sourceResult.order, 1, limits.maxProgressQuestionResults)
                    || answer === undefined
                    || typeof sourceResult.correct !== 'boolean'
                    || typeof sourceResult.skipped !== 'boolean'
                ) return null;
                attempt.questionResults.push({
                    questionId,
                    order: sourceResult.order,
                    userAnswer: answer,
                    correct: sourceResult.correct,
                    skipped: sourceResult.skipped
                });
            }
        }

        if (source.modules !== undefined && source.modules !== null) {
            if (!Array.isArray(source.modules) || source.modules.length > limits.maxProgressModules) return null;
            const modules = source.modules.map((module) => normalizeString(module, 200));
            if (modules.includes(null)) return null;
            attempt.modules = modules;
        } else if (source.modules === null) {
            attempt.modules = null;
        }

        attempts.push(attempt);
    }

    const derivedBestScore = attempts.reduce((best, attempt) => Math.max(best, attempt.score), 0);
    const derivedTotalPassed = attempts.filter((attempt) => attempt.passed).length;
    if (progress.bestScore !== undefined && !isFiniteNumber(progress.bestScore, 0, 100)) return null;
    if (progress.totalPassed !== undefined && !isInteger(progress.totalPassed, 0, attempts.length)) return null;

    return {
        attempts,
        bestScore: progress.bestScore === undefined ? derivedBestScore : progress.bestScore,
        totalPassed: progress.totalPassed === undefined ? derivedTotalPassed : progress.totalPassed
    };
};

window.ExamApp.setElementHidden = function setElementHidden(element, hidden) {
    if (!element) return;
    element.classList.toggle('is-hidden', Boolean(hidden));
    element.hidden = Boolean(hidden);
    element.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    element.style.display = hidden ? 'none' : '';
};

window.ExamApp.normalizeQuestionType = function normalizeQuestionType(question) {
    const rawType = String(question?.question_type || '').trim().toUpperCase();
    const aliases = {
        '': Array.isArray(question?.correct) ? 'MULTI' : 'STANDARD',
        SINGLE: 'STANDARD',
        SINGLE_CHOICE: 'STANDARD',
        MULTIPLE_CHOICE: 'MULTI',
        DRAG_DROP: 'DRAG_DROP_SELECT'
    };
    return aliases[rawType] || rawType;
};

window.ExamApp.validateExamData = function validateExamData(questions, metadata = null) {
    const errors = [];
    const warnings = [];
    const supportedTypes = new Set(['STANDARD', 'MULTI', 'YES_NO_MATRIX', 'SEQUENCE', 'DRAG_DROP_SELECT']);
    const items = Array.isArray(questions) ? questions : null;

    if (!items) {
        errors.push('Exam data must be an array of questions.');
        return { valid: false, errors, warnings };
    }

    if (items.length === 0) errors.push('Exam must contain at least one question.');
    if (items.length > window.ExamApp.EXAM_LIMITS.maxQuestions) {
        errors.push(`Exam has ${items.length} questions; maximum is ${window.ExamApp.EXAM_LIMITS.maxQuestions}.`);
    }

    const ids = new Set();
    const hasValidIndex = (index, options) => Number.isInteger(index) && Array.isArray(options) && index >= 0 && index < options.length;
    const hasText = (value, maxLength = window.ExamApp.EXAM_LIMITS.maxTextLength) => {
        const text = String(value || '').trim();
        return text.length > 0 && text.length <= maxLength;
    };

    items.forEach((question, index) => {
        const label = `Question ${index + 1}`;
        if (!question || typeof question !== 'object') {
            errors.push(`${label}: item must be an object.`);
            return;
        }

        const id = String(question.id ?? '').trim();
        if (!id) errors.push(`${label}: missing id.`);
        if (id && ids.has(id)) errors.push(`${label}: duplicate id ${id}.`);
        if (id) ids.add(id);

        if (!hasText(question.question)) errors.push(`${label}: question text is empty or too long.`);
        if (question.explanation !== undefined && !hasText(question.explanation)) warnings.push(`${label}: explanation is empty or too long.`);
        if (question.module !== undefined && !hasText(question.module, 200)) warnings.push(`${label}: module is empty or too long.`);

        const type = window.ExamApp.normalizeQuestionType(question);
        if (!supportedTypes.has(type)) errors.push(`${label}: unsupported question_type ${type}.`);

        const requiresOptions = ['STANDARD', 'MULTI', 'SEQUENCE', 'DRAG_DROP_SELECT'].includes(type);
        if (requiresOptions) {
            if (!Array.isArray(question.options) || question.options.length < 2) {
                errors.push(`${label}: options must contain at least two items.`);
            } else {
                question.options.forEach((option, optionIndex) => {
                    if (!hasText(option, window.ExamApp.EXAM_LIMITS.maxOptionLength)) {
                        errors.push(`${label}: option ${optionIndex + 1} is empty or too long.`);
                    }
                });
            }
        }

        if (type === 'STANDARD') {
            if (!hasValidIndex(question.correct, question.options)) errors.push(`${label}: correct must be a valid option index.`);
        } else if (type === 'MULTI') {
            if (!Array.isArray(question.correct) || question.correct.length === 0) {
                errors.push(`${label}: correct must be a non-empty array.`);
            } else {
                question.correct.forEach((correctIndex) => {
                    if (!hasValidIndex(correctIndex, question.options)) errors.push(`${label}: invalid correct option index ${correctIndex}.`);
                });
            }
        } else if (type === 'SEQUENCE') {
            if (!Array.isArray(question.options) || !Array.isArray(question.correct) || question.correct.length !== question.options.length) {
                errors.push(`${label}: correct sequence must match options length.`);
            } else {
                const sorted = [...question.correct].sort((a, b) => a - b);
                for (let i = 0; i < question.options.length; i++) {
                    if (sorted[i] !== i) {
                        errors.push(`${label}: correct sequence must be a permutation of option indices.`);
                        break;
                    }
                }
            }
        } else if (type === 'YES_NO_MATRIX') {
            if (!Array.isArray(question.statements) || question.statements.length === 0) {
                errors.push(`${label}: statements must contain at least one item.`);
            } else {
                question.statements.forEach((statement, statementIndex) => {
                    if (!hasText(statement, window.ExamApp.EXAM_LIMITS.maxOptionLength)) {
                        errors.push(`${label}: statement ${statementIndex + 1} is empty or too long.`);
                    }
                });
            }

            if (!Array.isArray(question.correct) || !Array.isArray(question.statements) || question.correct.length !== question.statements.length) {
                errors.push(`${label}: correct responses must match statements length.`);
            } else {
                question.correct.forEach((answer) => {
                    if (answer !== 0 && answer !== 1) errors.push(`${label}: YES/NO answers must be 0 or 1.`);
                });
            }
        } else if (type === 'DRAG_DROP_SELECT') {
            if (!Array.isArray(question.correct) || question.correct.length === 0) {
                errors.push(`${label}: correct must be a non-empty array.`);
            } else {
                question.correct.forEach((correctIndex) => {
                    if (!hasValidIndex(correctIndex, question.options)) errors.push(`${label}: invalid selected option index ${correctIndex}.`);
                });
            }

            if (question.drag_select_required !== undefined) {
                const required = question.drag_select_required;
                if (!Number.isInteger(required) || required < 1 || required > (question.options || []).length) {
                    errors.push(`${label}: drag_select_required is invalid.`);
                }
            }
        }
    });

    if (metadata && typeof metadata === 'object') {
        if (metadata.id !== undefined && !window.ExamApp.isSafeExamId(metadata.id)) errors.push('Metadata id is invalid.');
        if (metadata.questionCount !== undefined && (!Number.isInteger(metadata.questionCount) || metadata.questionCount < 1 || metadata.questionCount > items.length)) {
            errors.push('Metadata questionCount must be between 1 and total questions.');
        }
        if (metadata.totalQuestions !== undefined && metadata.totalQuestions !== items.length) {
            warnings.push('Metadata totalQuestions does not match question count.');
        }
    }

    return { valid: errors.length === 0, errors, warnings };
};

window.escapeHtml = escapeHtml;

// Premium custom alert modal replacement for native alert()
window.showCustomAlert = function(titleText, messageText, type = 'info') {
    // Remove existing modal if any
    const existing = document.getElementById('custom-alert-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'custom-alert-modal';
    modal.className = 'progress-modal-overlay';
    modal.style.zIndex = '11000'; // above everything

    const content = document.createElement('div');
    content.className = 'progress-modal-content custom-alert-animate custom-alert-content';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'progress-modal-close';
    closeBtn.type = 'button';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => modal.remove());
    content.appendChild(closeBtn);

    // Global helper: normalize the variant so arbitrary strings cannot leak
    // into the class attribute.
    const safeType = ['error', 'success', 'warning', 'info'].includes(type) ? type : 'info';

    const iconWrapper = document.createElement('div');
    iconWrapper.className = `custom-alert-icon ${safeType}`;

    const icon = document.createElement('i');
    if (safeType === 'error') {
        icon.className = 'fas fa-exclamation-circle';
    } else if (safeType === 'success') {
        icon.className = 'fas fa-check-circle';
    } else if (safeType === 'warning') {
        icon.className = 'fas fa-exclamation-triangle';
    } else {
        icon.className = 'fas fa-info-circle';
    }
    icon.setAttribute('aria-hidden', 'true');

    iconWrapper.appendChild(icon);
    content.appendChild(iconWrapper);

    const title = document.createElement('h3');
    title.className = 'custom-alert-title';
    title.textContent = titleText;
    content.appendChild(title);

    const desc = document.createElement('p');
    desc.className = 'custom-alert-desc';
    desc.textContent = messageText;
    content.appendChild(desc);

    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'custom-alert-btn';
    actionBtn.textContent = 'Got it';
    actionBtn.addEventListener('click', () => modal.remove());

    content.appendChild(actionBtn);
    modal.appendChild(content);
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
};

// Promise-based confirm modal replacement for native confirm(). Resolves true/false.
window.showCustomConfirm = function(titleText, messageText, options = {}) {
    const confirmLabel = options.confirmLabel || 'Confirm';
    const cancelLabel = options.cancelLabel || 'Cancel';

    return new Promise((resolve) => {
        const existing = document.getElementById('custom-confirm-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'custom-confirm-modal';
        modal.className = 'progress-modal-overlay';
        modal.style.zIndex = '11000';

        const content = document.createElement('div');
        content.className = 'progress-modal-content custom-alert-animate';
        content.setAttribute('role', 'dialog');
        content.setAttribute('aria-modal', 'true');
        content.setAttribute('aria-labelledby', 'custom-confirm-title');
        content.setAttribute('aria-describedby', 'custom-confirm-description');
        content.style.maxWidth = '420px';
        content.style.textAlign = 'center';
        content.style.padding = '30px';
        content.style.borderRadius = '16px';
        content.style.boxShadow = '0 20px 50px rgba(0, 0, 0, 0.3)';

        const title = document.createElement('h3');
    title.id = 'custom-confirm-title';
        title.style.margin = '0 0 10px 0';
        title.style.fontSize = '1.3rem';
        title.style.fontWeight = '700';
        title.textContent = titleText;
        content.appendChild(title);

        const desc = document.createElement('p');
    desc.id = 'custom-confirm-description';
        desc.style.margin = '0 0 24px 0';
        desc.style.fontSize = '0.95rem';
        desc.style.lineHeight = '1.5';
        desc.style.color = 'var(--text-light, #64748b)';
        desc.textContent = messageText;
        content.appendChild(desc);

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '12px';
        actions.style.justifyContent = 'center';

        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            modal.remove();
            resolve(value);
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.style.padding = '10px 24px';
        cancelBtn.style.background = '#f1f5f9';
        cancelBtn.style.color = '#334155';
        cancelBtn.style.border = '1px solid #cbd5e1';
        cancelBtn.style.borderRadius = '8px';
        cancelBtn.style.fontSize = '0.9rem';
        cancelBtn.style.fontWeight = '600';
        cancelBtn.style.cursor = 'pointer';
        cancelBtn.textContent = cancelLabel;
        cancelBtn.addEventListener('click', () => finish(false));

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.style.padding = '10px 24px';
        confirmBtn.style.background = 'linear-gradient(135deg, #3b82f6, #1d4ed8)';
        confirmBtn.style.color = 'white';
        confirmBtn.style.border = 'none';
        confirmBtn.style.borderRadius = '8px';
        confirmBtn.style.fontSize = '0.9rem';
        confirmBtn.style.fontWeight = '600';
        confirmBtn.style.cursor = 'pointer';
        confirmBtn.textContent = confirmLabel;
        confirmBtn.addEventListener('click', () => finish(true));

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        content.appendChild(actions);
        modal.appendChild(content);
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) finish(false);
        });
    });
};
