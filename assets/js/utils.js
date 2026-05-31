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
    content.className = 'progress-modal-content custom-alert-animate';
    content.style.maxWidth = '400px';
    content.style.textAlign = 'center';
    content.style.padding = '30px';
    content.style.borderRadius = '16px';
    content.style.boxShadow = '0 20px 50px rgba(0, 0, 0, 0.3)';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'progress-modal-close';
    closeBtn.type = 'button';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => modal.remove());
    content.appendChild(closeBtn);

    const iconWrapper = document.createElement('div');
    iconWrapper.style.fontSize = '3.5rem';
    iconWrapper.style.marginBottom = '20px';

    const icon = document.createElement('i');
    if (type === 'error') {
        icon.className = 'fas fa-exclamation-circle';
        iconWrapper.style.color = '#ef4444';
        iconWrapper.style.textShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
    } else if (type === 'success') {
        icon.className = 'fas fa-check-circle';
        iconWrapper.style.color = '#10b981';
        iconWrapper.style.textShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
    } else if (type === 'warning') {
        icon.className = 'fas fa-exclamation-triangle';
        iconWrapper.style.color = '#f59e0b';
        iconWrapper.style.textShadow = '0 4px 12px rgba(245, 158, 11, 0.3)';
    } else {
        icon.className = 'fas fa-info-circle';
        iconWrapper.style.color = '#3b82f6';
        iconWrapper.style.textShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
    }

    iconWrapper.appendChild(icon);
    content.appendChild(iconWrapper);

    const title = document.createElement('h3');
    title.style.margin = '0 0 10px 0';
    title.style.fontSize = '1.3rem';
    title.style.fontWeight = '700';
    title.textContent = titleText;
    content.appendChild(title);

    const desc = document.createElement('p');
    desc.style.margin = '0 0 24px 0';
    desc.style.fontSize = '0.95rem';
    desc.style.lineHeight = '1.5';
    desc.style.color = 'var(--text-light, #64748b)';
    desc.textContent = messageText;
    content.appendChild(desc);

    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.style.padding = '10px 24px';
    actionBtn.style.background = 'linear-gradient(135deg, #3b82f6, #1d4ed8)';
    actionBtn.style.color = 'white';
    actionBtn.style.border = 'none';
    actionBtn.style.borderRadius = '8px';
    actionBtn.style.fontSize = '0.9rem';
    actionBtn.style.fontWeight = '600';
    actionBtn.style.cursor = 'pointer';
    actionBtn.style.transition = 'all 0.2s ease';
    actionBtn.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.2)';
    actionBtn.textContent = 'Got it';
    actionBtn.addEventListener('click', () => modal.remove());

    // Add hover effect
    actionBtn.addEventListener('mouseover', () => {
        actionBtn.style.transform = 'translateY(-1px)';
        actionBtn.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.3)';
    });
    actionBtn.addEventListener('mouseout', () => {
        actionBtn.style.transform = 'translateY(0)';
        actionBtn.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.2)';
    });

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
