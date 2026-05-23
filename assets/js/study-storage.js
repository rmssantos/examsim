// IndexedDB storage for per-question Study Mode statistics.
(function () {
    'use strict';

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
            return encodeURIComponent(String(questionId ?? '').trim()).slice(0, 80);
        }

        buildKey(examId, questionId) {
            const normalizedExamId = String(examId || '').trim();
            const normalizedQuestionId = String(questionId || '').trim();
            return `studyStats_${normalizedExamId}_${this.hashString(normalizedQuestionId)}_${this.encodeQuestionId(normalizedQuestionId)}`;
        }

        async getQuestionRecord(examId, questionId) {
            if (!window.ExamApp.isSafeExamId(examId)) return null;
            if (!(await this.ensureReady())) return null;

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(this.buildKey(examId, questionId));
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
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
                request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
                request.onerror = () => reject(request.error);
            }).catch((error) => {
                window.ExamApp?.warn?.('Failed to read study records', error);
                return [];
            });
        }

        async saveRecord(record) {
            if (!record || !window.ExamApp.isSafeExamId(record.examId)) return false;
            if (!(await this.ensureReady())) return false;

            const nextRecord = {
                ...record,
                key: this.buildKey(record.examId, record.questionId)
            };

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                store.put(nextRecord);
                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => reject(transaction.error);
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