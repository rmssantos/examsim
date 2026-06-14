// IndexedDB wrapper for imported exam content and detailed progress.
(function () {
    'use strict';

    window.ExamApp = window.ExamApp || {};

    class ExamStorage {
        constructor() {
            this.dbName = 'ExamContentDB';
            this.version = 1;
            this.examStore = 'exams';
            this.progressStore = 'progress';
            this.db = null;
            this.initPromise = this.init();
        }

        async init() {
            if (!window.indexedDB) {
                window.ExamApp.warn('IndexedDB not available, exam content storage disabled');
                return null;
            }

            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.version);

                request.onerror = () => {
                    window.ExamApp.warn('Failed to open exam storage IndexedDB:', request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    this.db = request.result;
                    resolve(this.db);
                };

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.examStore)) {
                        const store = db.createObjectStore(this.examStore, { keyPath: 'examId' });
                        store.createIndex('updatedAt', 'updatedAt', { unique: false });
                    }
                    if (!db.objectStoreNames.contains(this.progressStore)) {
                        const store = db.createObjectStore(this.progressStore, { keyPath: 'examId' });
                        store.createIndex('updatedAt', 'updatedAt', { unique: false });
                    }
                };
            });
        }

        async ensureReady() {
            if (!this.db) {
                await this.initPromise;
            }
            return this.db;
        }

        isAvailable() {
            return Boolean(this.db || window.indexedDB);
        }

        isQuotaError(error) {
            return error?.name === 'QuotaExceededError'
                || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
                || error?.code === 22
                || error?.code === 1014;
        }

        describeStorageError(error) {
            if (this.isQuotaError(error)) {
                return 'Browser storage is full. Remove old exams or export data before importing more content.';
            }
            return error?.message || 'Browser storage failed.';
        }

        legacyQuestionKey(examId) {
            return `custom_${examId}_questions`;
        }

        legacyMetadataKey(examId) {
            return `exam_metadata_${examId}`;
        }

        legacyProgressKey(examId) {
            return `${examId}_progress`;
        }

        getLegacyExam(examId) {
            if (!window.ExamApp.isSafeExamId(examId)) return null;
            try {
                const raw = localStorage.getItem(this.legacyQuestionKey(examId));
                if (!raw) return null;
                const questions = JSON.parse(raw);
                const metadataRaw = localStorage.getItem(this.legacyMetadataKey(examId));
                const metadata = metadataRaw ? JSON.parse(metadataRaw) : null;
                if (!Array.isArray(questions)) return null;
                return { examId, questions, metadata, source: 'legacy-localStorage', storage: 'localStorage' };
            } catch (error) {
                window.ExamApp.warn(`Failed to read legacy exam ${examId}:`, error);
                return null;
            }
        }

        putLegacyExam(examId, questions, metadata) {
            if (!window.ExamApp.isSafeExamId(examId) || !Array.isArray(questions)) return false;
            localStorage.setItem(this.legacyQuestionKey(examId), JSON.stringify(questions));
            if (metadata) {
                localStorage.setItem(this.legacyMetadataKey(examId), JSON.stringify(metadata));
            } else {
                localStorage.removeItem(this.legacyMetadataKey(examId));
            }
            return true;
        }

        deleteLegacyExam(examId) {
            if (!window.ExamApp.isSafeExamId(examId)) return;
            localStorage.removeItem(this.legacyQuestionKey(examId));
            localStorage.removeItem(this.legacyMetadataKey(examId));
        }

        listLegacyExamIds() {
            const ids = [];
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('custom_') && key.endsWith('_questions')) {
                        const examId = key.replace('custom_', '').replace('_questions', '');
                        if (window.ExamApp.isSafeExamId(examId)) ids.push(examId);
                    }
                }
            } catch (error) {
                window.ExamApp.warn('Failed to list legacy exams:', error);
            }
            return ids;
        }

        getLegacyProgress(examId) {
            if (!window.ExamApp.isSafeExamId(examId)) return null;
            try {
                const raw = localStorage.getItem(this.legacyProgressKey(examId));
                if (!raw) return null;
                const progress = JSON.parse(raw);
                return progress && Array.isArray(progress.attempts) ? progress : null;
            } catch (error) {
                window.ExamApp.warn(`Failed to read legacy progress ${examId}:`, error);
                return null;
            }
        }

        putLegacyProgress(examId, progress) {
            if (!window.ExamApp.isSafeExamId(examId)) return false;
            localStorage.setItem(this.legacyProgressKey(examId), JSON.stringify(progress));
            return true;
        }

        deleteLegacyProgress(examId) {
            if (!window.ExamApp.isSafeExamId(examId)) return;
            localStorage.removeItem(this.legacyProgressKey(examId));
        }

        listLegacyProgressExamIds() {
            const ids = [];
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.endsWith('_progress')) {
                        const examId = key.replace('_progress', '');
                        if (window.ExamApp.isSafeExamId(examId)) ids.push(examId);
                    }
                }
            } catch (error) {
                window.ExamApp.warn('Failed to list legacy progress:', error);
            }
            return ids;
        }

        async getRecord(storeName, key) {
            const db = await this.ensureReady();
            if (!db) return null;
            return new Promise((resolve, reject) => {
                const request = db.transaction([storeName], 'readonly').objectStore(storeName).get(key);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
            });
        }

        async putRecord(storeName, record) {
            const db = await this.ensureReady();
            if (!db) return false;
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([storeName], 'readwrite');
                transaction.objectStore(storeName).put(record);
                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => reject(transaction.error);
            });
        }

        async deleteRecord(storeName, key) {
            const db = await this.ensureReady();
            if (!db) return false;
            return new Promise((resolve, reject) => {
                const transaction = db.transaction([storeName], 'readwrite');
                transaction.objectStore(storeName).delete(key);
                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => reject(transaction.error);
            });
        }

        async listKeys(storeName) {
            const db = await this.ensureReady();
            if (!db) return [];
            return new Promise((resolve, reject) => {
                const keys = [];
                const request = db.transaction([storeName], 'readonly').objectStore(storeName).openCursor();
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        keys.push(cursor.key);
                        cursor.continue();
                    } else {
                        resolve(keys.filter(window.ExamApp.isSafeExamId));
                    }
                };
                request.onerror = () => reject(request.error);
            });
        }

        async putExam(examId, questions, metadata = null, options = {}) {
            if (!window.ExamApp.isSafeExamId(examId)) throw new Error('Invalid exam id');
            if (!Array.isArray(questions)) throw new Error('Exam questions must be an array');
            const record = {
                examId,
                questions,
                labs: Array.isArray(options.labs) ? options.labs : [],
                metadata: metadata || null,
                source: options.source || 'imported',
                updatedAt: Date.now()
            };
            const saved = await this.putRecord(this.examStore, record);
            if (saved) window.ExamApp.addToRegistry(window.ExamApp.STORAGE_KEYS.exams, examId);
            return saved;
        }

        async getExam(examId, options = {}) {
            if (!window.ExamApp.isSafeExamId(examId)) return null;
            const record = await this.getRecord(this.examStore, examId);
            if (record && Array.isArray(record.questions)) {
                return { ...record, storage: 'indexedDB' };
            }

            const legacy = this.getLegacyExam(examId);
            if (legacy && options.migrateLegacy !== false) {
                try {
                    await this.putExam(examId, legacy.questions, legacy.metadata, { source: 'migrated-localStorage' });
                    window.ExamApp.analytics?.trackStorageMigration?.('exam', 'success');
                    return { ...legacy, source: 'migrated-localStorage', storage: 'indexedDB' };
                } catch (error) {
                    window.ExamApp.warn(`Failed to migrate ${examId} to IndexedDB:`, error);
                    window.ExamApp.analytics?.trackStorageMigration?.('exam', this.isQuotaError(error) ? 'quota_error' : 'failed');
                }
            }
            return legacy;
        }

        async listExamIds() {
            const ids = new Set(window.ExamApp.getRegistry(window.ExamApp.STORAGE_KEYS.exams));
            this.listLegacyExamIds().forEach(id => ids.add(id));
            try {
                const indexedIds = await this.listKeys(this.examStore);
                indexedIds.forEach(id => ids.add(id));
            } catch (error) {
                window.ExamApp.warn('Failed to list IndexedDB exams:', error);
            }
            return [...ids].filter(window.ExamApp.isSafeExamId).sort();
        }

        async deleteExam(examId) {
            if (!window.ExamApp.isSafeExamId(examId)) return false;
            await this.deleteExamContent(examId);
            this.deleteLegacyProgress(examId);
            await this.deleteRecord(this.progressStore, examId).catch(() => false);
            window.ExamApp.removeFromRegistry(window.ExamApp.STORAGE_KEYS.progress, examId);
            return true;
        }

        async deleteExamContent(examId) {
            if (!window.ExamApp.isSafeExamId(examId)) return false;
            this.deleteLegacyExam(examId);
            await Promise.all([
                this.deleteRecord(this.examStore, examId).catch(() => false)
            ]);
            window.ExamApp.removeFromRegistry(window.ExamApp.STORAGE_KEYS.exams, examId);
            return true;
        }

        async putProgress(examId, progress) {
            if (!window.ExamApp.isSafeExamId(examId)) throw new Error('Invalid exam id');
            const record = {
                examId,
                progress: progress || { attempts: [] },
                updatedAt: Date.now()
            };
            const saved = await this.putRecord(this.progressStore, record);
            if (saved) window.ExamApp.addToRegistry(window.ExamApp.STORAGE_KEYS.progress, examId);
            return saved;
        }

        async getProgress(examId, options = {}) {
            if (!window.ExamApp.isSafeExamId(examId)) return null;
            const record = await this.getRecord(this.progressStore, examId);
            if (record && record.progress && Array.isArray(record.progress.attempts)) {
                return record.progress;
            }

            const legacy = this.getLegacyProgress(examId);
            if (legacy && options.migrateLegacy !== false) {
                try {
                    await this.putProgress(examId, legacy);
                    window.ExamApp.analytics?.trackStorageMigration?.('progress', 'success');
                } catch (error) {
                    window.ExamApp.warn(`Failed to migrate ${examId} progress to IndexedDB:`, error);
                    window.ExamApp.analytics?.trackStorageMigration?.('progress', this.isQuotaError(error) ? 'quota_error' : 'failed');
                }
            }
            return legacy;
        }

        async listProgressExamIds() {
            const ids = new Set(window.ExamApp.getRegistry(window.ExamApp.STORAGE_KEYS.progress));
            this.listLegacyProgressExamIds().forEach(id => ids.add(id));
            try {
                const indexedIds = await this.listKeys(this.progressStore);
                indexedIds.forEach(id => ids.add(id));
            } catch (error) {
                window.ExamApp.warn('Failed to list IndexedDB progress:', error);
            }
            return [...ids].filter(window.ExamApp.isSafeExamId).sort();
        }

        // Mirror durable IndexedDB progress back into the localStorage cache used by
        // synchronous UI reads. Keeps IndexedDB as the source of truth while preserving
        // the existing fast, synchronous read paths. Best-effort: never throws.
        async hydrateProgressMirror() {
            const result = { restored: 0, scanned: 0 };
            try {
                const indexedIds = await this.listKeys(this.progressStore);
                for (const examId of indexedIds) {
                    if (!window.ExamApp.isSafeExamId(examId)) continue;
                    result.scanned++;
                    const record = await this.getRecord(this.progressStore, examId).catch(() => null);
                    const progress = record && record.progress;
                    if (!progress || !Array.isArray(progress.attempts)) continue;

                    const local = this.getLegacyProgress(examId);
                    const localCount = local && Array.isArray(local.attempts) ? local.attempts.length : -1;
                    if (progress.attempts.length > localCount) {
                        try {
                            this.putLegacyProgress(examId, progress);
                            result.restored++;
                        } catch (error) {
                            window.ExamApp.warn(`Failed to mirror ${examId} progress to localStorage:`, error);
                        }
                    }
                }
            } catch (error) {
                window.ExamApp.warn('Progress hydration skipped:', error);
            }
            return result;
        }
    }

    window.ExamApp.ExamStorage = ExamStorage;
    window.ExamApp.examStorage = window.ExamApp.examStorage || new ExamStorage();
})();
