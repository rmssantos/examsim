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
    maxQuestions: 1000,
    maxImages: 250,
    maxImageBytes: 10 * 1024 * 1024,
    maxTotalImageBytes: 100 * 1024 * 1024,
    maxTextLength: 20000,
    maxOptionLength: 5000,
    allowedImageExtensions: Object.freeze(['jpg', 'jpeg', 'png', 'gif', 'webp']),
    allowedImageMimeTypes: Object.freeze(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
});

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
    return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(String(value || '').trim());
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
