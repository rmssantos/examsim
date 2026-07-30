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
    zipWorkerTimeoutMs: 30 * 1000,
    maxQuestions: 1000,
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

window.ExamApp.EXAM_PROVENANCE = Object.freeze({
    bundled: Object.freeze({ source: 'bundled', trust: 'bundled' }),
    imported: Object.freeze({ source: 'imported', trust: 'local-unverified' })
});

window.ExamApp.isBundledTrustedExam = function isBundledTrustedExam(exam) {
    return Boolean(exam && exam.source === 'bundled' && exam.trust === 'bundled');
};

window.ExamApp.sanitizeExamMetadata = function sanitizeExamMetadata(metadata, options = {}) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return metadata || null;

    const sanitized = { ...metadata };
    delete sanitized.source;
    delete sanitized.trust;
    if (options.allowCommercial !== true) {
        delete sanitized.pro;
        delete sanitized.recommendedPro;
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

    if (metadata === null || metadata === undefined) {
        if (Array.isArray(labs) && labs.length > 0) {
            errors.push('Metadata with labCount is required when labs are present.');
        }
        return { valid: errors.length === 0, errors, warnings };
    }
    if (typeof metadata !== 'object' || Array.isArray(metadata)) {
        errors.push('Metadata must be an object.');
        return { valid: false, errors, warnings };
    }

    const pending = [{ value: metadata, path: 'Metadata' }];
    const seen = new Set();
    while (pending.length > 0) {
        const current = pending.pop();
        const value = current.value;
        if (!value || typeof value !== 'object' || seen.has(value)) continue;
        seen.add(value);

        if (Array.isArray(value)) {
            if (value.length > limits.maxMetadataListItems) {
                errors.push(`${current.path} has too many items; maximum is ${limits.maxMetadataListItems}.`);
            }
            value.slice(0, limits.maxMetadataListItems).forEach((item, index) => {
                pending.push({ value: item, path: `${current.path}[${index}]` });
            });
            continue;
        }
        for (const [field, nested] of Object.entries(value)) {
            pending.push({ value: nested, path: `${current.path}.${field}` });
        }
    }

    if (metadata.id !== undefined && !window.ExamApp.isSafeExamId(metadata.id)) {
        errors.push('Metadata id is invalid.');
    }
    if (
        metadata.questionCount !== undefined
        && (
            !Number.isInteger(metadata.questionCount)
            || metadata.questionCount < 1
            || metadata.questionCount > limits.maxQuestions
            || (Number.isInteger(questionTotal) && metadata.questionCount > questionTotal)
        )
    ) {
        errors.push('Metadata questionCount must be between 1 and total questions.');
    }
    if (metadata.totalQuestions !== undefined) {
        if (
            !Number.isInteger(metadata.totalQuestions)
            || metadata.totalQuestions < 1
            || metadata.totalQuestions > limits.maxQuestions
        ) {
            errors.push(`Metadata totalQuestions must be between 1 and ${limits.maxQuestions}.`);
        } else if (
            Number.isInteger(questionTotal)
            && metadata.totalQuestions !== questionTotal
        ) {
            warnings.push('Metadata totalQuestions does not match question count.');
        }
    }

    if (
        metadata.labCount !== undefined
        && (
            !Number.isInteger(metadata.labCount)
            || metadata.labCount < 0
            || metadata.labCount > limits.maxLabs
        )
    ) {
        errors.push(`Metadata labCount must be between 0 and ${limits.maxLabs}.`);
    }
    if (Array.isArray(labs)) {
        if (labs.length > 0 && metadata.labCount === undefined) {
            errors.push('Metadata labCount is required when labs are present.');
        } else if (
            metadata.labCount !== undefined
            && metadata.labCount !== labs.length
        ) {
            errors.push('Metadata labCount must match the number of labs.');
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
    labs = undefined
) {
    const errors = [];
    const warnings = [];
    const limits = window.ExamApp.EXAM_LIMITS;
    const supportedTypes = new Set(['STANDARD', 'MULTI', 'YES_NO_MATRIX', 'SEQUENCE', 'DRAG_DROP_SELECT']);
    const items = Array.isArray(questions) ? questions : null;

    if (!items) {
        errors.push('Exam data must be an array of questions.');
        return { valid: false, errors, warnings };
    }

    if (items.length === 0) errors.push('Exam must contain at least one question.');
    if (items.length > limits.maxQuestions) {
        errors.push(`Exam has ${items.length} questions; maximum is ${limits.maxQuestions}.`);
    }

    const ids = new Set();
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

        const id = String(question.id ?? '').trim();
        if (!id) errors.push(`${label}: missing id.`);
        if (id && ids.has(id)) errors.push(`${label}: duplicate id ${id}.`);
        if (id) ids.add(id);

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
