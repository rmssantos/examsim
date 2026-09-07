/**
 * Shared utility functions for the Exam Simulator
 */

// Global namespace for ExamApp
window.ExamApp = window.ExamApp || {};

window.ExamApp.toWellFormedString = function toWellFormedString(value) {
    let text;
    try {
        text = String(value ?? '');
    } catch (_) {
        return '';
    }
    if (typeof text.toWellFormed === 'function') {
        try {
            const converted = text.toWellFormed();
            if (typeof converted === 'string') return converted;
        } catch (_) { /* fall through to the compatible code-unit path */ }
    }

    let result = '';
    for (let index = 0; index < text.length; index++) {
        const unit = text.charCodeAt(index);
        if (unit >= 0xD800 && unit <= 0xDBFF) {
            const next = text.charCodeAt(index + 1);
            if (next >= 0xDC00 && next <= 0xDFFF) {
                result += text[index] + text[index + 1];
                index++;
            } else {
                result += '\uFFFD';
            }
        } else if (unit >= 0xDC00 && unit <= 0xDFFF) {
            result += '\uFFFD';
        } else {
            result += text[index];
        }
    }
    return result;
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

function hasWellFormedUtf16(value) {
    const text = String(value ?? '');
    for (let index = 0; index < text.length; index++) {
        const unit = text.charCodeAt(index);
        if (unit >= 0xD800 && unit <= 0xDBFF) {
            const next = text.charCodeAt(index + 1);
            if (!(next >= 0xDC00 && next <= 0xDFFF)) return false;
            index++;
        } else if (unit >= 0xDC00 && unit <= 0xDFFF) {
            return false;
        }
    }
    return true;
}

const QUESTION_ID_WHITESPACE = /[ \f\n\r\t\v\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+/g;

function parseQuestionId(value) {
    let text;
    if (typeof value === 'string') {
        text = value;
    } else if (typeof value === 'number' && Number.isSafeInteger(value)) {
        text = String(value);
    } else {
        return {
            valid: false,
            value: '',
            error: 'id must be a non-empty string or safe integer.'
        };
    }

    const canonical = text.replace(QUESTION_ID_WHITESPACE, ' ').trim();
    if (!canonical) {
        return {
            valid: false,
            value: '',
            error: 'id must be a non-empty string or safe integer.'
        };
    }
    if (!hasWellFormedUtf16(canonical)) {
        return {
            valid: false,
            value: '',
            error: 'id must be well-formed Unicode.'
        };
    }
    return { valid: true, value: canonical, error: '' };
}

function legacyLongQuestionIdIdentity(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    const fingerprint = (hash >>> 0).toString(16).padStart(8, '0');
    return `q_${fingerprint}_${encodeURIComponent(value).slice(0, 80)}`;
}

// Browser-storage provenance is intentionally held outside serializable exam
// data. A record cannot obtain recovery-only validation by declaring mutable
// source/storage fields in JSON.
const browserStoredExamRecords = new WeakSet();
window.ExamApp.markBrowserStoredExamRecord = function markBrowserStoredExamRecord(record) {
    if (record && typeof record === 'object') browserStoredExamRecords.add(record);
    return record;
};
window.ExamApp.isBrowserStoredExamRecord = function isBrowserStoredExamRecord(record) {
    return Boolean(
        record
        && typeof record === 'object'
        && browserStoredExamRecords.has(record)
    );
};

window.ExamApp.EXAM_LIMITS = Object.freeze({
    maxJsonBytes: 5 * 1024 * 1024,
    maxZipBytes: 50 * 1024 * 1024,
    maxZipEntries: 512,
    maxZipUncompressedBytes: 120 * 1024 * 1024,
    zipWorkerTimeoutMs: 30 * 1000,
    maxQuestions: 1000,
    maxQuestionIdLength: 120,
    maxOptions: 50,
    maxStatements: 50,
    maxCorrectAnswers: 50,
    maxQuestionImageRefs: 20,
    maxQuestionReferences: 20,
    maxLabs: 50,
    maxLabImageRefs: 20,
    maxLabSteps: 100,
    maxLabPrerequisites: 25,
    maxLabCleanup: 25,
    maxLabReferences: 25,
    maxMetadataListItems: 100,
    maxMetadataTaxonomyListItems: 20,
    maxMetadataTaxonomyStringLength: 200,
    maxMetadataStringLength: 5000,
    maxMetadataObjectKeys: 100,
    maxMetadataKeyLength: 200,
    maxMetadataDepth: 10,
    maxMetadataNodes: 5000,
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

window.ExamApp.canonicalizeQuestionId = function canonicalizeQuestionId(value) {
    const parsed = parseQuestionId(value);
    return parsed.valid ? parsed.value : null;
};

// Hosts that serve the public deployment. Single source of truth shared by
// analytics gating and local-only link hiding.
window.ExamApp.PUBLIC_HOSTS = Object.freeze(['examplar.app', 'www.examplar.app', 'rmssantos.github.io']);
window.ExamApp.isPublicSiteHost = function isPublicSiteHost(hostname = window.location.hostname) {
    return window.ExamApp.PUBLIC_HOSTS.includes(hostname);
};

window.ExamApp.EXAM_PROVENANCE = Object.freeze({
    bundled: Object.freeze({ source: 'bundled', trust: 'bundled' }),
    imported: Object.freeze({ source: 'imported', trust: 'local-unverified' })
});

window.ExamApp.isBundledTrustedExam = function isBundledTrustedExam(exam) {
    return Boolean(exam && exam.source === 'bundled' && exam.trust === 'bundled');
};

window.ExamApp.sanitizeExamMetadata = function sanitizeExamMetadata(metadata, options = {}) {
    if (!metadata || typeof metadata !== 'object') return metadata || null;

    let isArray;
    let prototype;
    try {
        isArray = Array.isArray(metadata);
        prototype = Object.getPrototypeOf(metadata);
    } catch (_) {
        return null;
    }
    if (isArray) return null;
    if (prototype !== Object.prototype && prototype !== null) return null;

    const sanitized = {};
    const maximumKeys = window.ExamApp.EXAM_LIMITS?.maxMetadataObjectKeys || 100;
    let keyCount = 0;
    try {
        for (const key in metadata) {
            if (!Object.prototype.hasOwnProperty.call(metadata, key)) continue;
            keyCount += 1;
            if (keyCount > maximumKeys) return null;
            const descriptor = Object.getOwnPropertyDescriptor(metadata, key);
            if (
                !descriptor
                || descriptor.enumerable !== true
                || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
            ) {
                return null;
            }
            Object.defineProperty(sanitized, key, {
                value: descriptor.value,
                enumerable: true,
                configurable: true,
                writable: true
            });
        }
    } catch (_) {
        return null;
    }
    delete sanitized.source;
    delete sanitized.trust;
    if (options.allowCommercial !== true) {
        delete sanitized.pro;
        delete sanitized.recommendedPro;
        delete sanitized.preview;

        // Imported/local packs never inherit a commercial state. Keep a
        // complete taxonomy useful for filtering, but normalize its status to
        // the only state an unverified local pack can represent. A standalone
        // forged status is removed so it cannot make otherwise valid legacy
        // metadata fail the all-or-nothing taxonomy contract.
        const taxonomyFields = [
            'vendor',
            'certificationCode',
            'domains',
            'level',
            'productFamily',
            'contentType'
        ];
        if (taxonomyFields.every(field => Object.prototype.hasOwnProperty.call(sanitized, field))) {
            Object.defineProperty(sanitized, 'commercialStatus', {
                value: 'free',
                enumerable: true,
                configurable: true,
                writable: true
            });
        } else {
            delete sanitized.commercialStatus;
        }
    }
    return sanitized;
};

window.ExamApp.OFFICIAL_DOCUMENTATION_HOSTS = Object.freeze([
    'docs.aws.amazon.com',
    'aws.amazon.com',
    'learn.microsoft.com',
    'docs.microsoft.com',
    'azure.microsoft.com',
    'microsoft.com',
    'cloud.google.com'
]);

window.ExamApp.isOfficialDocumentationUrl = function isOfficialDocumentationUrl(value) {
    try {
        const parsed = new URL(String(value || ''));
        if (
            parsed.protocol !== 'https:'
            || parsed.username
            || parsed.password
            || parsed.port
        ) {
            return false;
        }

        const hostname = parsed.hostname.toLowerCase();
        return window.ExamApp.OFFICIAL_DOCUMENTATION_HOSTS.some(
            allowed => hostname === allowed || hostname.endsWith(`.${allowed}`)
        );
    } catch (_) {
        return false;
    }
};

window.ExamApp.safeExternalUrl = function safeExternalUrl(value) {
    const candidate = String(value || '').trim();
    if (!candidate) return null;

    try {
        const parsed = new URL(candidate, window.location.href);
        if (
            parsed.protocol !== 'https:'
            || parsed.username
            || parsed.password
        ) {
            return null;
        }
        return parsed.href;
    } catch (_) {
        return null;
    }
};

window.ExamApp.getPromotionOffer = function getPromotionOffer(pro) {
    if (!pro || typeof pro !== 'object') return null;
    if (pro.delivery === 'online') return null;
    const promotion = pro.promotion;
    if (!promotion || typeof promotion !== 'object') return null;

    const discountPercent = Number(promotion.discountPercent);
    const code = String(promotion.code || '').trim();
    const priceMatch = String(pro.price || '').trim().match(/^(\d+(?:[.,]\d+)?)\s+([A-Z]{3})$/);
    if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent >= 100 || !code || !priceMatch) {
        return null;
    }

    const baseAmount = Number(priceMatch[1].replace(',', '.'));
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) return null;
    const currency = priceMatch[2];
    const currencyLabel = currency === 'EUR' ? '€' : `${currency} `;
    const formatAmount = amount => `${currencyLabel}${amount.toFixed(2)}`;

    return Object.freeze({
        label: String(promotion.label || 'Offer').trim() || 'Offer',
        discountPercent,
        code,
        limited: promotion.limited === true,
        basePrice: formatAmount(baseAmount),
        offerPrice: formatAmount(baseAmount * (100 - discountPercent) / 100)
    });
};

window.ExamApp.resourceUrlForTrust = function resourceUrlForTrust(value, exam) {
    const safeUrl = window.ExamApp.safeExternalUrl(value);
    if (!safeUrl) return null;
    if (window.ExamApp.isBundledTrustedExam(exam)) return safeUrl;
    return window.ExamApp.isOfficialDocumentationUrl(safeUrl) ? safeUrl : null;
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
    try {
        localStorage.setItem(key, JSON.stringify(unique));
    } catch (error) {
        // Registries are reconstructible indexes. A failed index write must not
        // turn an already-durable exam/progress save into a reported failure.
        window.ExamApp.warn(`Failed to update local registry ${key}:`, error);
    }
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

window.ExamApp.getProgressSummary = function getProgressSummary(progress) {
    const attempts = Array.isArray(progress?.attempts) ? progress.attempts : [];
    // Diagnostics are deliberately retained in the attempt history, but they are
    // a short placement check rather than certification-completion evidence.
    // Full, study, and pre-sessionType legacy attempts retain the old semantics.
    const hasDiagnostic = attempts.some(attempt => attempt?.sessionType === 'diagnostic');
    const completion = attempts.filter(attempt => attempt?.sessionType !== 'diagnostic');
    const diagnosticPassedCount = attempts.filter(
        attempt => attempt?.sessionType === 'diagnostic' && attempt?.passed === true
    ).length;
    const derivedTotalPassed = completion.filter(attempt => attempt?.passed === true).length;
    const unknownEligiblePassedCount = completion.filter(
        attempt => attempt && attempt.passed === undefined
    ).length;
    const derivedBestScore = completion.reduce((best, attempt) => {
        const score = Number(attempt?.score);
        return Number.isFinite(score) ? Math.max(best, score) : best;
    }, 0);
    // Records from before sessionType existed may only carry the aggregate fields.
    // Preserve those values, then reconcile them against explicit diagnostic and
    // eligible-attempt evidence so inflated diagnostic aggregates are repaired.
    const legacyBestScore = Number(progress?.bestScore);
    const legacyTotalPassed = Number(progress?.totalPassed);
    const bestScore = !hasDiagnostic && Number.isFinite(legacyBestScore)
        ? Math.max(derivedBestScore, legacyBestScore)
        : derivedBestScore;
    const clampPassed = value => Math.min(
        completion.length,
        Math.max(0, Number.isFinite(value) ? Math.trunc(value) : 0)
    );
    const aggregatePassed = Number.isInteger(legacyTotalPassed)
        ? legacyTotalPassed
        : derivedTotalPassed;
    let totalPassed;
    if (hasDiagnostic) {
        const evidenceLimit = derivedTotalPassed + unknownEligiblePassedCount;
        const clampToEvidence = value => Math.min(evidenceLimit, clampPassed(value));
        // Pre-fix records included passing diagnostics in totalPassed, while
        // fixed records already exclude them. Reconcile both representations:
        // subtract explicit diagnostic passes, but retain aggregate-only passes
        // that can belong to legacy attempts where `passed` was never recorded.
        const aggregateEligiblePassed = clampToEvidence(
            aggregatePassed - diagnosticPassedCount
        );
        const alreadyEligiblePassed = clampToEvidence(aggregatePassed);
        totalPassed = clampPassed(Math.max(
            derivedTotalPassed,
            aggregateEligiblePassed,
            alreadyEligiblePassed
        ));
    } else {
        totalPassed = clampPassed(Math.max(derivedTotalPassed, aggregatePassed));
    }

    return {
        totalAttempts: attempts.length,
        completionAttempts: completion.length,
        bestScore,
        totalPassed,
        passRate: completion.length
            ? Math.round((totalPassed / completion.length) * 100)
            : null
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
            timeSpent: source.timeSpent === undefined ? 0 : source.timeSpent
        };
        if (source.passed !== undefined) attempt.passed = source.passed;

        if (source.attemptId !== undefined) {
            const attemptId = normalizeString(source.attemptId, 200);
            if (attemptId === null) return null;
            attempt.attemptId = attemptId;
        }
        if (source.date !== undefined) attempt.date = source.date;

        if (source.sessionType !== undefined) {
            if (
                typeof source.sessionType !== 'string'
                || !['full', 'diagnostic', 'study'].includes(source.sessionType)
            ) return null;
            attempt.sessionType = source.sessionType;
        }

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

    if (progress.bestScore !== undefined && !isFiniteNumber(progress.bestScore, 0, 100)) return null;
    if (progress.totalPassed !== undefined && !isInteger(progress.totalPassed, 0, attempts.length)) return null;
    const summary = window.ExamApp.getProgressSummary({
        attempts,
        bestScore: progress.bestScore,
        totalPassed: progress.totalPassed
    });

    return {
        attempts,
        // Re-derive these legacy aggregates so records written before diagnostics
        // were separated cannot continue to mark a roadmap as completed.
        bestScore: summary.bestScore,
        totalPassed: summary.totalPassed
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

window.ExamApp.validateExamMetadata = function validateExamMetadata(
    metadata,
    questionTotal = null,
    labs = undefined
) {
    const errors = [];
    const warnings = [];
    const limits = window.ExamApp.EXAM_LIMITS;
    const maxValidationErrors = 100;
    const addError = (message) => {
        if (errors.length < maxValidationErrors) errors.push(message);
    };

    if (metadata === null || metadata === undefined) {
        if (Array.isArray(labs) && labs.length > 0) {
            addError('Metadata with labCount is required when labs are present.');
        }
        return { valid: errors.length === 0, errors, warnings };
    }
    if (typeof metadata !== 'object') {
        addError('Metadata must be an object.');
        return { valid: false, errors, warnings };
    }

    let rootIsArray;
    try {
        rootIsArray = Array.isArray(metadata);
    } catch (_error) {
        addError('Metadata could not be inspected safely.');
        return { valid: false, errors, warnings };
    }
    if (rootIsArray) {
        addError('Metadata must be an object.');
        return { valid: false, errors, warnings };
    }

    const containerSnapshots = new Map();
    const inspectContainer = (value, path) => {
        if (containerSnapshots.has(value)) return containerSnapshots.get(value);

        let isArray;
        let prototype;
        try {
            isArray = Array.isArray(value);
            prototype = Object.getPrototypeOf(value);
        } catch (_error) {
            addError(`${path} could not be inspected safely.`);
            const invalid = { kind: 'invalid', entries: [], fields: new Map(), items: new Map() };
            containerSnapshots.set(value, invalid);
            return invalid;
        }

        if (
            (isArray && prototype !== Array.prototype)
            || (!isArray && prototype !== Object.prototype && prototype !== null)
        ) {
            addError(`${path} must contain only arrays and plain objects.`);
            const invalid = { kind: 'invalid', entries: [], fields: new Map(), items: new Map() };
            containerSnapshots.set(value, invalid);
            return invalid;
        }

        const readDescriptor = (key, label) => {
            let descriptor;
            try {
                descriptor = Object.getOwnPropertyDescriptor(value, key);
            } catch (_error) {
                addError(`${label} could not be inspected safely.`);
                return null;
            }
            if (!descriptor) {
                addError(`${label} has an unstable property descriptor.`);
                return null;
            }
            if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
                addError(`${label} must be a data property, not an accessor.`);
                return null;
            }
            return descriptor;
        };

        if (isArray) {
            const lengthDescriptor = readDescriptor('length', `${path}.length`);
            const length = lengthDescriptor?.value;
            if (!Number.isSafeInteger(length) || length < 0) {
                addError(`${path} has an invalid array length.`);
                const invalid = { kind: 'invalid', entries: [], fields: new Map(), items: new Map() };
                containerSnapshots.set(value, invalid);
                return invalid;
            }
            if (length > limits.maxMetadataListItems) {
                addError(`${path} has too many items; maximum is ${limits.maxMetadataListItems}.`);
            }

            let visibleKeys = 0;
            try {
                for (const key in value) {
                    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
                    visibleKeys += 1;
                    const index = Number(key);
                    if (
                        !Number.isInteger(index)
                        || index < 0
                        || index >= length
                        || String(index) !== key
                    ) {
                        addError(`${path} arrays must contain only indexed items.`);
                    }
                    if (visibleKeys > limits.maxMetadataListItems) break;
                }
            } catch (_error) {
                addError(`${path} could not be enumerated safely.`);
                const invalid = { kind: 'invalid', entries: [], fields: new Map(), items: new Map() };
                containerSnapshots.set(value, invalid);
                return invalid;
            }

            const entries = [];
            const items = new Map();
            const inspectedLength = Math.min(length, limits.maxMetadataListItems);
            for (let index = 0; index < inspectedLength; index++) {
                const descriptor = readDescriptor(String(index), `${path}[${index}]`);
                if (!descriptor) continue;
                if (descriptor.enumerable !== true) {
                    addError(`${path}[${index}] must be an enumerable data property.`);
                    continue;
                }
                entries.push({ value: descriptor.value, path: `${path}[${index}]` });
                items.set(index, descriptor.value);
            }
            const snapshot = {
                kind: 'array',
                entries,
                fields: new Map(),
                items,
                length
            };
            containerSnapshots.set(value, snapshot);
            return snapshot;
        }

        const stringKeys = [];
        try {
            for (const key in value) {
                if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
                if (stringKeys.length >= limits.maxMetadataObjectKeys) {
                    addError(`${path} has too many keys; maximum is ${limits.maxMetadataObjectKeys}.`);
                    break;
                }
                stringKeys.push(key);
            }
        } catch (_error) {
            addError(`${path} could not be enumerated safely.`);
            const invalid = { kind: 'invalid', entries: [], fields: new Map(), items: new Map() };
            containerSnapshots.set(value, invalid);
            return invalid;
        }
        const entries = [];
        const fields = new Map();
        stringKeys.forEach((field, index) => {
            const wellFormedKey = hasWellFormedUtf16(field);
            const validKey = wellFormedKey && field.length <= limits.maxMetadataKeyLength;
            if (!wellFormedKey) {
                addError(`${path} key ${index + 1} must be well-formed Unicode.`);
            } else if (field.length > limits.maxMetadataKeyLength) {
                addError(
                    `${path} key ${index + 1} exceeds ${limits.maxMetadataKeyLength} UTF-16 code units.`
                );
            }
            const pathField = validKey ? field : `<key ${index + 1}>`;
            const descriptor = readDescriptor(field, `${path}.${pathField}`);
            if (!descriptor) return;
            if (descriptor.enumerable !== true) {
                addError(`${path}.${pathField} must be an enumerable data property.`);
                return;
            }
            entries.push({ value: descriptor.value, path: `${path}.${pathField}` });
            fields.set(field, descriptor.value);
        });
        const snapshot = { kind: 'object', entries, fields, items: new Map() };
        containerSnapshots.set(value, snapshot);
        return snapshot;
    };

    const pending = [{ value: metadata, path: 'Metadata', depth: 0, exiting: false }];
    const seen = new Set();
    const active = new Set();
    let nodeCount = 0;
    let rootSnapshot = null;
    while (pending.length > 0) {
        const current = pending.pop();
        const value = current.value;
        if (current.exiting) {
            active.delete(value);
            continue;
        }

        const isContainer = value !== null && typeof value === 'object';
        if (isContainer && active.has(value)) {
            addError(`${current.path} contains a circular reference.`);
            continue;
        }
        if (isContainer && seen.has(value)) continue;

        nodeCount++;
        if (nodeCount > limits.maxMetadataNodes) {
            addError(`Metadata has too many total nodes; maximum is ${limits.maxMetadataNodes}.`);
            break;
        }
        if (current.depth > limits.maxMetadataDepth) {
            addError(`Metadata exceeds the maximum depth of ${limits.maxMetadataDepth}.`);
            continue;
        }

        if (value === null || typeof value === 'boolean') continue;
        if (typeof value === 'string') {
            if (!hasWellFormedUtf16(value)) {
                addError(`${current.path} must be well-formed Unicode.`);
            } else if (value.length > limits.maxMetadataStringLength) {
                addError(
                    `${current.path} exceeds ${limits.maxMetadataStringLength} UTF-16 code units.`
                );
            }
            continue;
        }
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) {
                addError(`${current.path} must contain a finite JSON number.`);
            }
            continue;
        }
        if (!isContainer) {
            addError(`${current.path} must contain only JSON-compatible values.`);
            continue;
        }

        seen.add(value);
        active.add(value);
        pending.push({ value, path: current.path, depth: current.depth, exiting: true });
        const snapshot = inspectContainer(value, current.path);
        if (value === metadata) rootSnapshot = snapshot;
        snapshot.entries.slice().reverse().forEach((entry) => {
            pending.push({
                value: entry.value,
                path: entry.path,
                depth: current.depth + 1,
                exiting: false
            });
        });
    }

    const taxonomyTextFields = [
        'vendor',
        'certificationCode',
        'level',
        'productFamily',
        'contentType',
        'commercialStatus'
    ];
    const taxonomyListFields = ['domains'];
    const rootFields = rootSnapshot?.kind === 'object' ? rootSnapshot.fields : new Map();
    const hasField = field => rootFields.has(field);
    const fieldValue = field => rootFields.get(field);
    const hasLibraryTaxonomy = [...taxonomyTextFields, ...taxonomyListFields].some(hasField);

    if (hasLibraryTaxonomy) taxonomyTextFields.forEach((field) => {
        if (!hasField(field)) {
            addError(`Metadata ${field} is required for library filtering.`);
            return;
        }
        const value = fieldValue(field);
        if (
            typeof value !== 'string'
            || value.trim().length === 0
            || !hasWellFormedUtf16(value)
            || value.length > limits.maxMetadataTaxonomyStringLength
        ) {
            addError(
                `Metadata ${field} must be a non-empty string of at most `
                + `${limits.maxMetadataTaxonomyStringLength} UTF-16 code units.`
            );
        }
    });

    if (hasLibraryTaxonomy) {
        if (!hasField('domains')) {
            addError('Metadata domains must be a non-empty array of strings.');
        } else {
            const domains = fieldValue('domains');
            const domainsSnapshot = containerSnapshots.get(domains);
            if (domainsSnapshot?.kind !== 'array' || domainsSnapshot.length === 0) {
                addError('Metadata domains must be a non-empty array of strings.');
            } else {
                if (domainsSnapshot.length > limits.maxMetadataTaxonomyListItems) {
                    addError(
                        `Metadata domains has too many items; maximum is `
                        + `${limits.maxMetadataTaxonomyListItems}.`
                    );
                }
                const checkedLength = Math.min(
                    domainsSnapshot.length,
                    limits.maxMetadataTaxonomyListItems
                );
                for (let index = 0; index < checkedLength; index++) {
                    const domain = domainsSnapshot.items.get(index);
                    if (
                        !domainsSnapshot.items.has(index)
                        || typeof domain !== 'string'
                        || domain.trim().length === 0
                        || !hasWellFormedUtf16(domain)
                        || domain.length > limits.maxMetadataTaxonomyStringLength
                    ) {
                        addError(
                            `Metadata domains entry ${index + 1} must be a non-empty string of at most `
                            + `${limits.maxMetadataTaxonomyStringLength} UTF-16 code units.`
                        );
                    }
                }
            }
        }
    }

    if (hasField('id')) {
        const id = fieldValue('id');
        if (typeof id !== 'string' || !window.ExamApp.isSafeExamId(id)) {
            addError('Metadata id is invalid.');
        }
    }

    if (hasField('questionCount')) {
        const questionCount = fieldValue('questionCount');
        if (
            !Number.isInteger(questionCount)
            || questionCount < 1
            || questionCount > limits.maxQuestions
            || (Number.isInteger(questionTotal) && questionCount > questionTotal)
        ) {
            addError('Metadata questionCount must be between 1 and total questions.');
        }
    }

    if (hasField('totalQuestions')) {
        const totalQuestions = fieldValue('totalQuestions');
        if (
            !Number.isInteger(totalQuestions)
            || totalQuestions < 1
            || totalQuestions > limits.maxQuestions
        ) {
            addError(`Metadata totalQuestions must be between 1 and ${limits.maxQuestions}.`);
        } else if (
            Number.isInteger(questionTotal)
            && totalQuestions !== questionTotal
        ) {
            warnings.push('Metadata totalQuestions does not match question count.');
        }
    }

    if (hasField('passScore')) {
        const passScore = fieldValue('passScore');
        if (
            typeof passScore !== 'number'
            || !Number.isFinite(passScore)
            || passScore < 1
            || passScore > 100
        ) {
            addError('Metadata passScore must be between 1 and 100.');
        }
    }

    if (hasField('contentOrigin')) {
        const contentOrigin = fieldValue('contentOrigin');
        if (
            typeof contentOrigin !== 'string'
            || !new Set(['original', 'derived-from-public', 'imported']).has(contentOrigin)
        ) {
            addError('Metadata contentOrigin is invalid.');
        }
    }

    if (hasField('labCount')) {
        const labCount = fieldValue('labCount');
        if (
            !Number.isInteger(labCount)
            || labCount < 0
            || labCount > limits.maxLabs
        ) {
            addError(`Metadata labCount must be between 0 and ${limits.maxLabs}.`);
        }
    }
    if (Array.isArray(labs)) {
        const hasLabCount = hasField('labCount');
        const labCount = fieldValue('labCount');
        if (labs.length > 0 && !hasLabCount) {
            addError('Metadata labCount is required when labs are present.');
        } else if (hasLabCount && labCount !== labs.length) {
            addError('Metadata labCount must match the number of labs.');
        }
    }

    return { valid: errors.length === 0, errors, warnings };
};

window.ExamApp.validateExamLabs = function validateExamLabs(labs) {
    const errors = [];
    const limits = window.ExamApp.EXAM_LIMITS;
    const hasText = (value, maxLength = limits.maxTextLength) => (
        typeof value === 'string'
        && value.trim().length > 0
        && value.trim().length <= maxLength
    );

    if (!Array.isArray(labs)) {
        errors.push('Labs must be an array.');
        return { valid: false, errors, warnings: [] };
    }
    if (labs.length > limits.maxLabs) {
        errors.push(`Labs has ${labs.length} entries; maximum is ${limits.maxLabs}.`);
    }

    const ids = new Set();
    labs.slice(0, limits.maxLabs).forEach((lab, index) => {
        const label = `Lab ${index + 1}`;
        if (!lab || typeof lab !== 'object' || Array.isArray(lab)) {
            errors.push(`${label}: item must be an object.`);
            return;
        }

        const id = typeof lab.id === 'string' ? lab.id.trim() : '';
        if (!id || id.length > 200) errors.push(`${label}: id is required or too long.`);
        if (id && ids.has(id)) errors.push(`${label}: duplicate id ${id}.`);
        if (id) ids.add(id);

        for (const field of [
            'domain',
            'title',
            'objective',
            'expectedResult',
            'estCost',
            'objectiveVersion'
        ]) {
            if (!hasText(lab[field])) errors.push(`${label}: ${field} is required or too long.`);
        }
        if (typeof lab.freeTierOnly !== 'boolean') {
            errors.push(`${label}: freeTierOnly must be true or false.`);
        }
        if (
            typeof lab.sourceVerifiedOn !== 'string'
            || !/^\d{4}-\d{2}-\d{2}$/.test(lab.sourceVerifiedOn.trim())
        ) {
            errors.push(`${label}: sourceVerifiedOn must be an ISO date (YYYY-MM-DD).`);
        }

        const boundedTextList = (field, maximum) => {
            const values = lab[field];
            if (!Array.isArray(values) || values.length === 0) {
                errors.push(`${label}: ${field} must be a non-empty array of strings.`);
                return;
            }
            if (values.length > maximum) {
                errors.push(`${label}: ${field} has too many items; maximum is ${maximum}.`);
            }
            values.slice(0, maximum).forEach((value) => {
                if (!hasText(value)) {
                    errors.push(`${label}: ${field} entries must be non-empty strings.`);
                }
            });
        };
        boundedTextList('prerequisites', limits.maxLabPrerequisites);
        boundedTextList('cleanup', limits.maxLabCleanup);

        const steps = lab.steps;
        let labImageRefs = 0;
        if (!Array.isArray(steps) || steps.length === 0) {
            errors.push(`${label}: steps must be a non-empty array.`);
        } else {
            if (steps.length > limits.maxLabSteps) {
                errors.push(`${label}: steps has too many items; maximum is ${limits.maxLabSteps}.`);
            }
            steps.slice(0, limits.maxLabSteps).forEach((step, stepIndex) => {
                if (!step || typeof step !== 'object' || Array.isArray(step)) {
                    errors.push(`${label}: step ${stepIndex + 1} must be an object.`);
                    return;
                }
                if (!Number.isInteger(step.n)) {
                    errors.push(`${label}: step ${stepIndex + 1} n must be an integer.`);
                }
                if (!hasText(step.instruction)) {
                    errors.push(`${label}: step ${stepIndex + 1} instruction is required or too long.`);
                }
                if (!hasText(step.expected)) {
                    errors.push(`${label}: step ${stepIndex + 1} expected is required or too long.`);
                }
                if (step.image !== undefined) {
                    labImageRefs += 1;
                    if (
                        !step.image
                        || typeof step.image !== 'object'
                        || Array.isArray(step.image)
                        || !window.ExamApp.isSafeImageFileName(step.image.filename)
                    ) {
                        errors.push(`${label}: step ${stepIndex + 1} image filename is invalid.`);
                    }
                }
            });
        }
        if (labImageRefs > limits.maxLabImageRefs) {
            errors.push(`${label}: step images exceed the maximum of ${limits.maxLabImageRefs}.`);
        }

        const references = lab.references;
        if (!Array.isArray(references) || references.length === 0) {
            errors.push(`${label}: references must be a non-empty array.`);
        } else {
            if (references.length > limits.maxLabReferences) {
                errors.push(`${label}: references has too many items; maximum is ${limits.maxLabReferences}.`);
            }
            references.slice(0, limits.maxLabReferences).forEach((reference, refIndex) => {
                if (
                    !reference
                    || typeof reference !== 'object'
                    || Array.isArray(reference)
                    || !hasText(reference.label, 1000)
                    || !hasText(reference.url, 5000)
                ) {
                    errors.push(`${label}: reference ${refIndex + 1} must have label and url.`);
                } else if (!window.ExamApp.isOfficialDocumentationUrl(reference.url)) {
                    errors.push(`${label}: reference ${refIndex + 1} must use an official HTTPS documentation URL.`);
                }
            });
        }
    });

    return { valid: errors.length === 0, errors, warnings: [] };
};

window.ExamApp.validateExamData = function validateExamData(
    questions,
    metadata = null,
    labs = undefined,
    validationOptions = {}
) {
    const errors = [];
    const warnings = [];
    let grandfatheredQuestionIdCount = 0;
    const limits = window.ExamApp.EXAM_LIMITS;
    const supportedTypes = new Set(['STANDARD', 'MULTI', 'YES_NO_MATRIX', 'SEQUENCE', 'DRAG_DROP_SELECT']);
    const items = Array.isArray(questions) ? questions : null;
    const allowLegacyLongQuestionIds = window.ExamApp.isBrowserStoredExamRecord(
        validationOptions?.storedRecord
    );

    if (!items) {
        errors.push('Exam data must be an array of questions.');
        return { valid: false, errors, warnings, grandfatheredQuestionIdCount };
    }

    if (items.length === 0) errors.push('Exam must contain at least one question.');
    if (items.length > limits.maxQuestions) {
        errors.push(`Exam has ${items.length} questions; maximum is ${limits.maxQuestions}.`);
    }

    const ids = new Set();
    const legacyLongIdentities = new Map();
    const hasValidIndex = (index, options) => Number.isInteger(index) && Array.isArray(options) && index >= 0 && index < options.length;
    const hasText = (value, maxLength = limits.maxTextLength) => (
        typeof value === 'string'
        && value.trim().length > 0
        && value.trim().length <= maxLength
    );

    items.slice(0, limits.maxQuestions).forEach((question, index) => {
        const label = `Question ${index + 1}`;
        if (!question || typeof question !== 'object' || Array.isArray(question)) {
            errors.push(`${label}: item must be an object.`);
            return;
        }

        const parsedId = Object.prototype.hasOwnProperty.call(question, 'id')
            ? parseQuestionId(question.id)
            : { valid: false, value: '', error: 'missing id.' };
        const id = parsedId.value;
        if (!parsedId.valid) {
            errors.push(`${label}: ${parsedId.error}`);
        } else {
            const isLegacyLongId = id.length > limits.maxQuestionIdLength;
            if (isLegacyLongId && !allowLegacyLongQuestionIds) {
                errors.push(`${label}: id exceeds the ${limits.maxQuestionIdLength}-character maximum.`);
            } else {
                if (isLegacyLongId) {
                    grandfatheredQuestionIdCount += 1;
                    warnings.push(
                        `${label}: grandfathered stored id exceeds ${limits.maxQuestionIdLength} UTF-16 code units.`
                    );
                    const legacyIdentity = legacyLongQuestionIdIdentity(id);
                    const previous = legacyLongIdentities.get(legacyIdentity);
                    if (previous && previous.id !== id) {
                        errors.push(
                            `${label}: legacy storage identity collision with ${previous.label}; the stored pack must be quarantined.`
                        );
                    } else if (!previous) {
                        legacyLongIdentities.set(legacyIdentity, { id, label });
                    }
                }
                if (ids.has(id)) {
                    errors.push(`${label}: duplicate id ${id}.`);
                } else {
                    ids.add(id);
                }
            }
        }

        if (!hasText(question.question)) errors.push(`${label}: question text is empty or too long.`);
        if (question.explanation !== undefined && !hasText(question.explanation)) {
            errors.push(`${label}: explanation is empty, invalid, or too long.`);
        }
        if (question.module !== undefined && !hasText(question.module, 200)) {
            errors.push(`${label}: module is empty, invalid, or too long.`);
        }

        const type = window.ExamApp.normalizeQuestionType(question);
        if (!supportedTypes.has(type)) errors.push(`${label}: unsupported question_type ${type}.`);

        const requiresOptions = ['STANDARD', 'MULTI', 'SEQUENCE', 'DRAG_DROP_SELECT'].includes(type);
        if (requiresOptions) {
            if (!Array.isArray(question.options) || question.options.length < 2) {
                errors.push(`${label}: options must contain at least two items.`);
            } else {
                if (question.options.length > limits.maxOptions) {
                    errors.push(`${label}: options has too many items; maximum is ${limits.maxOptions}.`);
                }
                question.options.slice(0, limits.maxOptions).forEach((option, optionIndex) => {
                    if (!hasText(option, limits.maxOptionLength)) {
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
                if (question.correct.length > limits.maxCorrectAnswers) {
                    errors.push(`${label}: correct has too many items; maximum is ${limits.maxCorrectAnswers}.`);
                }
                question.correct.slice(0, limits.maxCorrectAnswers).forEach((correctIndex) => {
                    if (!hasValidIndex(correctIndex, question.options)) errors.push(`${label}: invalid correct option index ${correctIndex}.`);
                });
                const correctIndices = question.correct.filter(Number.isInteger);
                if (new Set(correctIndices).size !== correctIndices.length) {
                    errors.push(`${label}: correct must not contain duplicate option indices.`);
                }
            }
        } else if (type === 'SEQUENCE') {
            if (!Array.isArray(question.options) || !Array.isArray(question.correct) || question.correct.length !== question.options.length) {
                errors.push(`${label}: correct sequence must match options length.`);
            } else if (question.correct.length > limits.maxCorrectAnswers) {
                errors.push(`${label}: correct has too many items; maximum is ${limits.maxCorrectAnswers}.`);
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
                if (question.statements.length > limits.maxStatements) {
                    errors.push(`${label}: statements has too many items; maximum is ${limits.maxStatements}.`);
                }
                question.statements.slice(0, limits.maxStatements).forEach((statement, statementIndex) => {
                    if (!hasText(statement, limits.maxOptionLength)) {
                        errors.push(`${label}: statement ${statementIndex + 1} is empty or too long.`);
                    }
                });
            }

            if (!Array.isArray(question.correct) || !Array.isArray(question.statements) || question.correct.length !== question.statements.length) {
                errors.push(`${label}: correct responses must match statements length.`);
            } else {
                if (question.correct.length > limits.maxCorrectAnswers) {
                    errors.push(`${label}: correct has too many items; maximum is ${limits.maxCorrectAnswers}.`);
                }
                question.correct.slice(0, limits.maxCorrectAnswers).forEach((answer) => {
                    if (answer !== 0 && answer !== 1) errors.push(`${label}: YES/NO answers must be 0 or 1.`);
                });
            }
        } else if (type === 'DRAG_DROP_SELECT') {
            if (!Array.isArray(question.correct) || question.correct.length === 0) {
                errors.push(`${label}: correct must be a non-empty array.`);
            } else {
                if (question.correct.length > limits.maxCorrectAnswers) {
                    errors.push(`${label}: correct has too many items; maximum is ${limits.maxCorrectAnswers}.`);
                }
                question.correct.slice(0, limits.maxCorrectAnswers).forEach((correctIndex) => {
                    if (!hasValidIndex(correctIndex, question.options)) errors.push(`${label}: invalid selected option index ${correctIndex}.`);
                });
                const correctIndices = question.correct.filter(Number.isInteger);
                if (new Set(correctIndices).size !== correctIndices.length) {
                    errors.push(`${label}: correct must not contain duplicate option indices.`);
                }
            }

            const required = question.drag_select_required;
            if (
                !Number.isInteger(required)
                || required < 1
                || !Array.isArray(question.options)
                || required > question.options.length
                || !Array.isArray(question.correct)
                || required !== question.correct.length
            ) {
                errors.push(`${label}: drag_select_required is invalid.`);
            }
        }

        let imageRefCount = 0;
        for (const field of ['question_images', 'explanation_images']) {
            if (question[field] === undefined) continue;
            if (!Array.isArray(question[field])) {
                errors.push(`${label}: ${field} must be an array.`);
                continue;
            }
            imageRefCount += question[field].length;
            question[field]
                .slice(0, limits.maxQuestionImageRefs)
                .forEach((reference, referenceIndex) => {
                    if (
                        !reference
                        || typeof reference !== 'object'
                        || Array.isArray(reference)
                        || !window.ExamApp.isSafeImageFileName(reference.filename)
                    ) {
                        errors.push(`${label}: ${field} entry ${referenceIndex + 1} has an invalid filename.`);
                    }
                });
        }
        if (imageRefCount > limits.maxQuestionImageRefs) {
            errors.push(`${label}: image references exceed the maximum of ${limits.maxQuestionImageRefs}.`);
        }

        if (question.references !== undefined) {
            if (!Array.isArray(question.references)) {
                errors.push(`${label}: references must be an array.`);
            } else {
                if (question.references.length > limits.maxQuestionReferences) {
                    errors.push(`${label}: references has too many items; maximum is ${limits.maxQuestionReferences}.`);
                }
                question.references
                    .slice(0, limits.maxQuestionReferences)
                    .forEach((reference, referenceIndex) => {
                        if (!hasText(reference, 5000)) {
                            errors.push(`${label}: reference ${referenceIndex + 1} must be a non-empty string.`);
                        }
                    });
            }
        }
    });

    // validateExamData represents a complete pack, so an omitted labs field is
    // an empty lab set. Metadata-only discovery calls validateExamMetadata
    // directly and may still defer this reconciliation until the dump loads.
    const completePackLabs = labs === undefined ? [] : labs;
    const metadataValidation = window.ExamApp.validateExamMetadata(
        metadata,
        items.length,
        completePackLabs
    );
    errors.push(...metadataValidation.errors);
    warnings.push(...metadataValidation.warnings);

    if (labs !== undefined) {
        const labValidation = window.ExamApp.validateExamLabs(labs);
        errors.push(...labValidation.errors);
        warnings.push(...labValidation.warnings);
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        grandfatheredQuestionIdCount
    };
};

window.ExamApp.validateStoredExamData = function validateStoredExamData(
    questions,
    metadata = null,
    labs = undefined,
    examId = 'unknown',
    storedRecord = null
) {
    const result = window.ExamApp.validateExamData(questions, metadata, labs, {
        storedRecord
    });
    const grandfatheredCount = Number.isInteger(result.grandfatheredQuestionIdCount)
        ? result.grandfatheredQuestionIdCount
        : 0;
    if (result.valid && grandfatheredCount > 0) {
        const limit = window.ExamApp.EXAM_LIMITS.maxQuestionIdLength;
        window.ExamApp.warn(
            `Loaded stored exam "${String(examId)}" with ${grandfatheredCount} grandfathered question id(s) longer than ${limit} UTF-16 code units. New imports remain limited to ${limit}.`
        );
    }
    return result;
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
