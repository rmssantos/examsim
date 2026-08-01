// IndexedDB storage for per-question Study Mode statistics.
(function () {
    'use strict';

    function toWellFormedString(value) {
        let text;
        try {
            text = String(value ?? '');
        } catch (_) {
            return '';
        }
        if (typeof text.toWellFormed === 'function') {
            try {
                return text.toWellFormed();
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
    }

    class StudyStorage {
        constructor() {
            this.dbName = 'ExamStudyDB';
            this.storeName = 'question_stats';
            this.version = 1;
            this.db = null;
            this.initPromise = this.init();
        }

        async init() {
            if (!window.indexedDB) {
                window.ExamApp?.warn?.('IndexedDB not available, study storage disabled');
                return null;
            }

            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.version);

                request.onerror = () => {
                    window.ExamApp?.warn?.('Failed to open Study Mode IndexedDB', request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    this.db = request.result;
                    resolve(this.db);
                };

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
                        store.createIndex('examId', 'examId', { unique: false });
                        store.createIndex('questionId', 'questionId', { unique: false });
                        store.createIndex('nextDue', 'nextDue', { unique: false });
                    }
                };
            }).catch(() => null);
        }

        async ensureReady() {
            if (!this.db) {
                await this.initPromise;
            }
            return Boolean(this.db);
        }

        hashString(value) {
            let hash = 2166136261;
            const text = String(value ?? '');
            for (let i = 0; i < text.length; i++) {
                hash ^= text.charCodeAt(i);
                hash = Math.imul(hash, 16777619);
            }
            return (hash >>> 0).toString(16).padStart(8, '0');
        }

        encodeQuestionId(questionId) {
            const value = toWellFormedString(questionId).trim();
            try {
                return encodeURIComponent(value).slice(0, 80);
            } catch (_) {
                return `u_${this.hashString(value)}`;
            }
        }

        encodeKeyPart(value) {
            const normalized = toWellFormedString(value).trim();
            try {
                return encodeURIComponent(normalized);
            } catch (_) {
                return `u_${this.hashString(normalized)}`;
            }
        }

        normalizeQuestionId(questionId) {
            let value = null;
            if (typeof window.ExamApp.canonicalizeQuestionId === 'function') {
                try {
                    value = window.ExamApp.canonicalizeQuestionId(questionId);
                } catch (_) { /* use the total compatibility path */ }
            }
            if (typeof value !== 'string') {
                value = toWellFormedString(questionId).trim().replace(/\s+/g, ' ');
            }
            if (!value) return '';
            const scheduler = window.ExamApp.studyScheduler;
            if (typeof scheduler?.normalizeQuestionId === 'function') {
                try {
                    const normalized = toWellFormedString(
                        scheduler.normalizeQuestionId.call(scheduler, value)
                    );
                    if (normalized) return normalized;
                } catch (_) { /* use the local compatibility path */ }
            }
            return value.length <= 120
                ? value
                : `q_${this.hashString(value)}_${this.encodeQuestionId(value)}`;
        }

        buildLegacyKey(examId, questionId) {
            const normalizedExamId = toWellFormedString(examId || '').trim();
            const normalizedQuestionId = this.normalizeQuestionId(questionId);
            return `studyStats_${normalizedExamId}_${this.hashString(normalizedQuestionId)}_${this.encodeQuestionId(normalizedQuestionId)}`;
        }

        buildKey(examId, questionId) {
            const normalizedExamId = toWellFormedString(examId || '').trim();
            const normalizedQuestionId = this.normalizeQuestionId(questionId);
            return `studyStats:v2:${this.encodeKeyPart(normalizedExamId)}:${this.encodeKeyPart(normalizedQuestionId)}`;
        }

        recordMatchesIdentity(record, examId, questionId) {
            if (!record || typeof record !== 'object') return false;
            const normalizedExamId = toWellFormedString(examId || '').trim();
            const recordExamId = toWellFormedString(record.examId || '').trim();
            return recordExamId === normalizedExamId
                && this.normalizeQuestionId(record.questionId) === this.normalizeQuestionId(questionId);
        }

        isV2Record(record) {
            return Boolean(
                record
                && record.key === this.buildKey(record.examId, record.questionId)
            );
        }

        async getQuestionRecord(examId, questionId) {
            if (!window.ExamApp.isSafeExamId(examId)) return null;
            if (!(await this.ensureReady())) return null;

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const primaryRequest = store.get(this.buildKey(examId, questionId));
                primaryRequest.onsuccess = () => {
                    if (this.recordMatchesIdentity(primaryRequest.result, examId, questionId)) {
                        resolve(primaryRequest.result);
                        return;
                    }
                    const legacyRequest = store.get(this.buildLegacyKey(examId, questionId));
                    legacyRequest.onsuccess = () => resolve(
                        this.recordMatchesIdentity(legacyRequest.result, examId, questionId)
                            ? legacyRequest.result
                            : null
                    );
                    legacyRequest.onerror = () => reject(legacyRequest.error);
                };
                primaryRequest.onerror = () => reject(primaryRequest.error);
            }).catch((error) => {
                window.ExamApp?.warn?.('Failed to read study record', error);
                return null;
            });
        }

        async getRecordsForExam(examId) {
            if (!window.ExamApp.isSafeExamId(examId)) return [];
            if (!(await this.ensureReady())) return [];

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const index = store.index('examId');
                const request = index.getAll(examId);
                request.onsuccess = () => {
                    const records = Array.isArray(request.result) ? request.result : [];
                    const byQuestionId = new Map();
                    records.forEach((record) => {
                        if (!this.recordMatchesIdentity(record, examId, record?.questionId)) return;
                        const canonicalId = this.normalizeQuestionId(record.questionId);
                        if (!canonicalId) return;
                        const current = byQuestionId.get(canonicalId);
                        if (!current || (this.isV2Record(record) && !this.isV2Record(current))) {
                            byQuestionId.set(canonicalId, record);
                        }
                    });
                    resolve([...byQuestionId.values()]);
                };
                request.onerror = () => reject(request.error);
            }).catch((error) => {
                window.ExamApp?.warn?.('Failed to read study records', error);
                return [];
            });
        }

        async saveRecord(record) {
            if (!record || !window.ExamApp.isSafeExamId(record.examId)) return false;
            if (!(await this.ensureReady())) return false;

            const normalizedExamId = toWellFormedString(record.examId || '').trim();
            const normalizedQuestionId = this.normalizeQuestionId(record.questionId);
            const nextRecord = {
                ...record,
                examId: normalizedExamId,
                questionId: normalizedQuestionId,
                key: this.buildKey(normalizedExamId, normalizedQuestionId)
            };
            const legacyKey = this.buildLegacyKey(normalizedExamId, normalizedQuestionId);

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                store.put(nextRecord);
                const legacyRequest = store.get(legacyKey);
                legacyRequest.onsuccess = () => {
                    if (
                        legacyKey !== nextRecord.key
                        && this.recordMatchesIdentity(
                            legacyRequest.result,
                            normalizedExamId,
                            normalizedQuestionId
                        )
                    ) {
                        store.delete(legacyKey);
                    }
                };
                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => reject(transaction.error);
                transaction.onabort = () => reject(transaction.error);
            }).catch((error) => {
                window.ExamApp?.warn?.('Failed to save study record', error);
                return false;
            });
        }

        normalizeSessionId(value) {
            return String(value || '').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 80);
        }

        async recordQuestionResult(examId, questionId, isCorrect, options = {}) {
            if (!window.ExamApp.isSafeExamId(examId)) return null;
            const existing = await this.getQuestionRecord(examId, questionId);
            const scheduler = window.ExamApp.studyScheduler;
            if (!scheduler) return null;

            const sessionId = this.normalizeSessionId(options.sessionId);
            const isSameSession = Boolean(sessionId && existing?.lastSessionId === sessionId);

            const record = (isSameSession ? scheduler.reviseRecord : scheduler.buildRecord)(existing, {
                examId,
                questionId,
                isCorrect,
                now: options.now instanceof Date ? options.now : new Date()
            });

            if (sessionId) {
                record.lastSessionId = sessionId;
            }

            await this.saveRecord(record);
            window.dispatchEvent(new CustomEvent('study-progress-updated', { detail: { examId } }));
            return record;
        }

        async getExamSummary(examId, questions) {
            if (!window.ExamApp.isSafeExamId(examId)) {
                return window.ExamApp.studyScheduler?.summarize(questions, []) || null;
            }
            const records = await this.getRecordsForExam(examId);
            return window.ExamApp.studyScheduler?.summarize(questions, records) || null;
        }
    }

    window.ExamApp = window.ExamApp || {};
    window.ExamApp.StudyStorage = StudyStorage;
    window.ExamApp.studyStorage = new StudyStorage();
    window.studyStorage = window.ExamApp.studyStorage;
})();
