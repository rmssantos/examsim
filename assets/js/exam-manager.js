// Dynamic Exam Manager - Detects and manages user-imported exams
class ExamManager {
    constructor() {
        this.userContentPath = './user-content/exams/';
        this.availableExams = new Map();
        this.defaultExamInfo = {
            duration: 45,
            questionCount: 45,
            passScore: 75,
            badge: 'Custom',
            icon: 'fas fa-book'
        };
        this.loadExamConfig();
    }

    // Load exam activation config from localStorage
    loadExamConfig() {
        try {
            const config = localStorage.getItem('exam_activation_config');
            this.examConfig = config ? JSON.parse(config) : {};
        } catch (error) {
            window.ExamApp.warn('Failed to load exam config:', error);
            this.examConfig = {};
        }
    }

    // Save exam activation config to localStorage
    saveExamConfig() {
        try {
            localStorage.setItem('exam_activation_config', JSON.stringify(this.examConfig));
        } catch (error) {
            console.error('Failed to save exam config:', error);
        }
    }

    // Check if exam is active
    isExamActive(examId) {
        if (!window.ExamApp.isSafeExamId(examId)) return false;
        // Default to true if not in config (auto-activate new exams)
        return this.examConfig[examId] !== false;
    }

    // Activate exam
    activateExam(examId) {
        if (!window.ExamApp.isSafeExamId(examId)) return;
        this.examConfig[examId] = true;
        this.saveExamConfig();
        window.ExamApp.log(`✓ Exam ${examId} activated`);
    }

    // Deactivate exam
    deactivateExam(examId) {
        if (!window.ExamApp.isSafeExamId(examId)) return;
        this.examConfig[examId] = false;
        this.saveExamConfig();
        window.ExamApp.log(`✗ Exam ${examId} deactivated`);
    }

    // Get all exam IDs (active and inactive)
    getAllExamIds() {
        const allExams = [];
        if (window.userExams) {
            allExams.push(...Object.keys(window.userExams).filter((id) => window.ExamApp.isSafeExamId(id)));
        }
        return allExams;
    }

    // Get active exam IDs only
    getActiveExamIds() {
        return this.getAllExamIds().filter(id => this.isExamActive(id));
    }

    // Detect available exams in user-content directory
    async detectAvailableExams() {
        this.availableExams.clear();

        try {
            // Try to detect exam directories
            const examDirs = await this.getExamDirectories();

            for (const examDir of examDirs) {
                try {
                    if (!window.ExamApp.isSafeExamId(examDir)) continue;
                    const examData = await this.loadExamData(examDir);
                    if (examData) {
                        this.availableExams.set(examDir, examData);
                    }
                } catch (error) {
                    window.ExamApp.warn(`Failed to load exam data for ${examDir}:`, error);
                }
            }
        } catch (error) {
            window.ExamApp.warn('Failed to detect exams:', error);
        }

        return this.availableExams;
    }

    // Get exam directories (uses window.userExams loaded via script tags)
    // Now respects activation status
    async getExamDirectories() {
        const foundExams = [];

        // Check window.userExams (loaded via <script> tags)
        // Only include ACTIVE exams
        if (window.userExams) {
            const allExams = Object.keys(window.userExams);
            const activeExams = allExams.filter(id => window.ExamApp.isSafeExamId(id) && this.isExamActive(id));
            foundExams.push(...activeExams);
        }

        // Also check browser storage for custom exams (if active)
        const customExams = await this.getCustomExamsFromStorage();
        const activeCustomExams = customExams.filter(id => this.isExamActive(id));
        foundExams.push(...activeCustomExams);

        return [...new Set(foundExams)]; // Remove duplicates
    }

    // Load exam data from directory
    async loadExamData(examId) {
        try {
            if (!window.ExamApp.isSafeExamId(examId)) return null;
            // Try to load from user-content first
            let examData = await this.loadFromUserContent(examId);

            // If not found, try browser storage
            if (!examData) {
                examData = await this.loadFromLocalStorage(examId);
            }

            if (examData && (Array.isArray(examData.questions) || examData.metadata)) {
                const questions = Array.isArray(examData.questions) ? examData.questions : null;
                const labs = Object.prototype.hasOwnProperty.call(examData, 'labs')
                    ? examData.labs
                    : undefined;
                const metadata = examData.metadata || this.generateMetadata(examId, questions || []);
                const validation = questions
                    ? window.ExamApp.validateExamData(questions, metadata, labs)
                    : window.ExamApp.validateExamMetadata(metadata, null, undefined);
                if (!validation.valid) {
                    window.ExamApp.warn(
                        `Skipping invalid exam ${examId}:`,
                        validation.errors.slice(0, 10)
                    );
                    return null;
                }
                return {
                    id: examId,
                    questions,
                    metadata,
                    labs: labs === undefined ? [] : labs,
                    hasImages: Boolean(examData.hasImages) || this.detectImages(questions),
                    loaded: Array.isArray(questions),
                    source: examData.source,
                    trust: examData.trust,
                    storage: examData.storage
                };
            }
        } catch (error) {
            console.error(`Error loading exam ${examId}:`, error);
        }

        return null;
    }

    // Load exam from user-content directory (via window.userExams)
    async loadFromUserContent(examId) {
        try {
            // Check if exam is loaded in window.userExams
            if (window.userExams && window.userExams[examId]) {
                const examData = window.userExams[examId];
                const isBundled = typeof window.ExamApp.isBundledTrustedExam === 'function'
                    && window.ExamApp.isBundledTrustedExam(examData);

                // Generate metadata if not provided
                let metadata = examData.metadata;
                if ((!metadata || Object.keys(metadata).length === 0) && Array.isArray(examData.questions)) {
                    metadata = this.generateMetadata(examId, examData.questions);
                }
                metadata = this.sanitizeMetadata(metadata, isBundled);

                return {
                    questions: examData.questions,
                    labs: Object.prototype.hasOwnProperty.call(examData, 'labs')
                        ? examData.labs
                        : undefined,
                    metadata,
                    hasImages: examData.hasImages,
                    source: isBundled ? 'bundled' : 'imported',
                    trust: isBundled ? 'bundled' : 'local-unverified',
                    storage: examData.storage || (isBundled ? 'network' : 'browser')
                };
            }
        } catch (error) {
            window.ExamApp.warn(`Failed to load ${examId} from user-content:`, error);
        }
        return null;
    }

    // Load exam from browser storage
    async loadFromLocalStorage(examId) {
        try {
            if (window.userExams && window.userExams[examId]?.questions) {
                const localExam = window.userExams[examId];
                return {
                    ...localExam,
                    metadata: this.sanitizeMetadata(localExam.metadata, false),
                    source: 'imported',
                    trust: 'local-unverified'
                };
            }

            if (window.ExamApp.examStorage) {
                const stored = await window.ExamApp.examStorage.getExam(examId);
                if (stored?.questions) {
                    return {
                        questions: stored.questions,
                        labs: Object.prototype.hasOwnProperty.call(stored, 'labs')
                            ? stored.labs
                            : undefined,
                        metadata: this.sanitizeMetadata(stored.metadata, false),
                        source: 'imported',
                        trust: 'local-unverified',
                        storage: stored.storage || 'browser'
                    };
                }
            }

            const legacy = window.ExamApp.examStorage?.getLegacyExam(examId);
            if (legacy?.questions) {
                return {
                    questions: legacy.questions,
                    labs: Object.prototype.hasOwnProperty.call(legacy, 'labs')
                        ? legacy.labs
                        : undefined,
                    metadata: this.sanitizeMetadata(legacy.metadata, false),
                    source: 'imported',
                    trust: 'local-unverified',
                    storage: 'localStorage'
                };
            }
        } catch (error) {
            window.ExamApp.warn(`Failed to load ${examId} from browser storage:`, error);
        }
        return null;
    }

    // Get custom exams from browser storage
    async getCustomExamsFromStorage() {
        const customExams = window.ExamApp.getRegistry(window.ExamApp.STORAGE_KEYS.exams);
        try {
            const storedIds = window.ExamApp.examStorage
                ? await window.ExamApp.examStorage.listExamIds()
                : [];
            for (const examId of storedIds) {
                if (window.ExamApp.isSafeExamId(examId) && !customExams.includes(examId)) customExams.push(examId);
            }
        } catch (error) {
            window.ExamApp.warn('Error reading custom exams from browser storage:', error);
        }
        window.ExamApp.setRegistry(window.ExamApp.STORAGE_KEYS.exams, customExams);
        return customExams;
    }

    sanitizeMetadata(metadata, allowCommercial = false) {
        if (typeof window.ExamApp.sanitizeExamMetadata === 'function') {
            return window.ExamApp.sanitizeExamMetadata(metadata, { allowCommercial });
        }
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
            return metadata || null;
        }
        const sanitized = { ...metadata };
        delete sanitized.source;
        delete sanitized.trust;
        if (!allowCommercial) {
            delete sanitized.pro;
            delete sanitized.recommendedPro;
        }
        return sanitized;
    }

    // Generate metadata for exam
    generateMetadata(examId, questions) {
        const modules = this.extractModules(questions);
        const questionCount = questions.length;

        // Try to guess exam type from ID
        let metadata = { ...this.defaultExamInfo };

        metadata.name = examId.toUpperCase();
        metadata.fullName = `Exam: ${examId}`;
        metadata.badge = 'Exam';

        metadata.questionCount = Math.min(questionCount, 45); // Limit to 45 for exam
        metadata.totalQuestions = questionCount;
        metadata.modules = modules;

        return metadata;
    }

    // Extract unique modules from questions
    extractModules(questions) {
        const modules = new Set();
        questions.forEach(q => {
            if (q.module) {
                modules.add(q.module);
            }
        });
        return Array.from(modules);
    }

    // Detect if exam has images
    detectImages(questions) {
        return Array.isArray(questions) && questions.some(q =>
            (Array.isArray(q?.question_images) && q.question_images.length > 0) ||
            (Array.isArray(q?.explanation_images) && q.explanation_images.length > 0) ||
            String(q?.question || '').includes('![') || // Markdown images
            String(q?.explanation || '').includes('![')
        );
    }

    getLegacyExamKeys(examId) {
        const storage = window.ExamApp.examStorage;
        return [
            storage?.legacyQuestionKey?.(examId) || `custom_${examId}_questions`,
            storage?.legacyMetadataKey?.(examId) || `exam_metadata_${examId}`,
            storage?.legacyLabsKey?.(examId) || `custom_${examId}_labs`
        ];
    }

    snapshotLegacyExam(examId) {
        return this.getLegacyExamKeys(examId).map(key => ({
            key,
            value: localStorage.getItem(key)
        }));
    }

    restoreLegacyExamSnapshot(snapshot) {
        const failures = [];
        const entries = Array.isArray(snapshot) ? snapshot : [];

        // Clear the whole mirror first. Restoring old values on top of a
        // partially-written new mirror can exceed quota even when the original
        // snapshot itself fits.
        for (const { key } of entries) {
            try {
                localStorage.removeItem(key);
            } catch (error) {
                failures.push({ key, phase: 'clear', error });
            }
        }
        for (const { key, value } of entries) {
            if (value === null) continue;
            try {
                localStorage.setItem(key, value);
            } catch (error) {
                failures.push({ key, phase: 'restore', error });
            }
        }
        if (!failures.length) return null;

        const rollbackError = new Error(
            `Failed to restore ${failures.length} localStorage exam value(s).`
        );
        rollbackError.failures = failures;
        return rollbackError;
    }

    // Import exam from file/data (supports both array and object formats)
    async importExam(examId, examData, imageFiles = null, options = {}) {
        let imageStorage = null;
        let previousImages = null;
        let imagesReplaced = false;
        let packCommitted = false;
        try {
            const safeExamId = window.ExamApp.normalizeExamId(examId);
            if (!safeExamId) {
                throw new Error('Invalid exam id. Use letters, numbers, hyphens or underscores.');
            }
            examId = safeExamId;

            // Normalize data format
            let questions, metadata, labs;

            if (Array.isArray(examData)) {
                // Direct array format (dump.json is just an array)
                questions = examData;
                metadata = null;
                labs = undefined;
            } else if (examData.questions) {
                // Object format with questions property
                questions = examData.questions;
                metadata = examData.metadata;
                labs = Object.prototype.hasOwnProperty.call(examData, 'labs')
                    ? examData.labs
                    : undefined;
            } else {
                throw new Error('Invalid exam data format');
            }

            // Generate and store metadata
            const sourceMetadata = metadata || this.generateMetadata(examId, questions);
            let finalMetadata;
            if (typeof window.ExamApp.sanitizeExamMetadata === 'function') {
                finalMetadata = window.ExamApp.sanitizeExamMetadata(sourceMetadata, {
                    allowCommercial: false
                });
            } else {
                finalMetadata = sourceMetadata && typeof sourceMetadata === 'object'
                    ? { ...sourceMetadata }
                    : sourceMetadata;
                if (finalMetadata) {
                    delete finalMetadata.source;
                    delete finalMetadata.trust;
                    delete finalMetadata.pro;
                    delete finalMetadata.recommendedPro;
                }
            }
            const validation = window.ExamApp.validateExamData(
                questions,
                finalMetadata,
                labs
            );
            if (!validation.valid) {
                throw new Error(`Invalid exam pack: ${validation.errors.slice(0, 3).join('; ')}`);
            }
            // Calculate every derived runtime value while the operation is still
            // side-effect free. No post-save type error can leave a durable pack
            // behind while reporting that its import failed.
            const importedHasImages = this.detectImages(questions);

            const runtimeCollision = Object.prototype.hasOwnProperty.call(
                window.userExams || {},
                examId
            );
            let storedCollision = null;
            if (window.ExamApp.examStorage?.getExam) {
                storedCollision = await window.ExamApp.examStorage.getExam(examId, {
                    migrateLegacy: false
                });
            }
            const hasCollision = runtimeCollision || Boolean(storedCollision);
            const hasIndexedDBCollision = storedCollision?.storage === 'indexedDB';
            if (hasCollision && options?.overwrite !== true) {
                const conflict = new Error(`An exam with id "${examId}" already exists.`);
                conflict.code = 'EXAM_ID_CONFLICT';
                conflict.examId = examId;
                throw conflict;
            }

            if (
                imageFiles !== null
                && imageFiles !== undefined
                && !Array.isArray(imageFiles)
            ) {
                throw new Error('Imported images must be an array.');
            }
            if (Array.isArray(imageFiles)) {
                imageStorage = window.ExamApp.imageStorage || window.imageStorage;
                if (
                    !imageStorage
                    || typeof imageStorage.getAllExamImages !== 'function'
                    || typeof imageStorage.replaceExamImages !== 'function'
                ) {
                    throw new Error(
                        'Atomic image storage is unavailable; the ZIP was not imported.'
                    );
                }
                previousImages = await imageStorage.getAllExamImages(examId);
                if (!Array.isArray(previousImages)) {
                    throw new Error('Could not snapshot the existing image set.');
                }
                await imageStorage.replaceExamImages(examId, imageFiles);
                imagesReplaced = true;
            }

            let legacySnapshot = null;
            let legacySnapshotError = null;
            try {
                legacySnapshot = this.snapshotLegacyExam(examId);
            } catch (error) {
                legacySnapshotError = error;
            }

            let savedToIndexedDB = false;
            if (window.ExamApp.examStorage) {
                try {
                    savedToIndexedDB = await window.ExamApp.examStorage.putExam(
                        examId,
                        questions,
                        finalMetadata,
                        {
                            source: 'imported',
                            trust: 'local-unverified',
                            labs
                        }
                    );
                    if (hasIndexedDBCollision && options?.overwrite === true && !savedToIndexedDB) {
                        throw new Error(`IndexedDB failed to replace existing exam "${examId}".`);
                    }
                } catch (error) {
                    if (hasIndexedDBCollision && options?.overwrite === true) throw error;
                    window.ExamApp.warn(`IndexedDB save failed for ${examId}, trying legacy storage:`, error);
                }
            }

            if (legacySnapshotError) {
                if (!savedToIndexedDB) throw legacySnapshotError;
                window.ExamApp.warn(
                    `Legacy localStorage mirror skipped for ${examId}; snapshot failed:`,
                    legacySnapshotError
                );
            } else {
                try {
                    let savedToLegacy = true;
                    if (window.ExamApp.examStorage) {
                        savedToLegacy = window.ExamApp.examStorage.putLegacyExam(
                            examId,
                            questions,
                            finalMetadata,
                            labs
                        );
                    } else {
                        localStorage.setItem(`custom_${examId}_questions`, JSON.stringify(questions));
                        localStorage.setItem(`exam_metadata_${examId}`, JSON.stringify(finalMetadata));
                        if (Array.isArray(labs) && labs.length) {
                            localStorage.setItem(`custom_${examId}_labs`, JSON.stringify(labs));
                        } else {
                            localStorage.removeItem(`custom_${examId}_labs`);
                        }
                    }
                    if (!savedToLegacy) {
                        throw new Error(`localStorage failed to save exam "${examId}".`);
                    }
                } catch (error) {
                    const rollbackError = this.restoreLegacyExamSnapshot(legacySnapshot);
                    if (rollbackError) {
                        window.ExamApp.warn(`Legacy localStorage rollback failed for ${examId}:`, rollbackError);
                    }
                    if (!savedToIndexedDB) {
                        if (rollbackError) {
                            const combinedError = new Error(
                                `${error.message || 'Legacy localStorage save failed.'} `
                                + `Rollback also failed: ${rollbackError.message}`
                            );
                            combinedError.cause = error;
                            combinedError.rollbackError = rollbackError;
                            throw combinedError;
                        }
                        throw error;
                    }
                    const rollbackStatus = rollbackError
                        ? 'rollback was incomplete'
                        : 'its previous snapshot was restored';
                    window.ExamApp.warn(
                        `Legacy localStorage mirror skipped for ${examId}; ${rollbackStatus}:`,
                        error
                    );
                }
            }
            packCommitted = true;

            try {
                window.ExamApp.addToRegistry(window.ExamApp.STORAGE_KEYS.exams, examId);
            } catch (error) {
                // The registry is a reconstructible index. At this point the
                // pack is durable, so a registry failure is non-fatal.
                window.ExamApp.warn(`Failed to update exam registry for ${examId}:`, error);
            }

            // The pack and its complete image set are durable now. Everything
            // below is a reconstructible in-memory/UI index and must not turn a
            // successful commit into a reported failure.
            try {
                if (!window.userExams) window.userExams = {};
                window.userExams[examId] = {
                    questions: questions,
                    labs: labs === undefined ? [] : labs,
                    metadata: finalMetadata,
                    source: 'imported',
                    trust: 'local-unverified',
                    storage: savedToIndexedDB ? 'indexedDB' : 'localStorage',
                    loaded: true,
                    hasImages: importedHasImages
                };
            } catch (error) {
                window.ExamApp.warn(`Failed to refresh runtime exam ${examId}:`, error);
            }
            try {
                this.activateExam(examId);
            } catch (error) {
                window.ExamApp.warn(`Failed to activate imported exam ${examId}:`, error);
            }
            try {
                await this.detectAvailableExams();
            } catch (error) {
                window.ExamApp.warn(`Failed to refresh imported exam ${examId}:`, error);
            }
            try {
                window.ExamApp.log(`✅ Successfully imported exam: ${examId} (${questions.length} questions)`);
            } catch (_) { /* logging is non-authoritative */ }
            return true;
        } catch (error) {
            if (imagesReplaced && !packCommitted && imageStorage) {
                try {
                    await imageStorage.replaceExamImages(examId, previousImages);
                } catch (rollbackError) {
                    const combinedError = new Error(
                        `${error.message || 'Exam import failed.'} `
                        + `Image rollback also failed: ${rollbackError.message || 'unknown error'}`
                    );
                    combinedError.cause = error;
                    combinedError.imageRollbackError = rollbackError;
                    console.error('Failed to import exam:', combinedError);
                    throw combinedError;
                }
            }
            console.error('Failed to import exam:', error);
            throw error;
        }
    }

    // Validate exam data structure
    validateExamData(examData) {
        // Handle both formats: {questions: [...]} and just [...]
        let questions;
        let metadata = null;
        let labs;

        if (Array.isArray(examData)) {
            // Direct array format
            questions = examData;
        } else if (examData && Array.isArray(examData.questions)) {
            // Object with questions property
            questions = examData.questions;
            metadata = examData.metadata || null;
            labs = Object.prototype.hasOwnProperty.call(examData, 'labs')
                ? examData.labs
                : undefined;
        } else {
            return false;
        }

        return window.ExamApp.validateExamData(questions, metadata, labs).valid;
    }

    // Delete exam
    async deleteExam(examId) {
        try {
            if (!window.ExamApp.isSafeExamId(examId)) return false;
            if (window.ExamApp.examStorage) {
                await window.ExamApp.examStorage.deleteExam(examId);
            } else {
                localStorage.removeItem(`custom_${examId}_questions`);
                localStorage.removeItem(`exam_metadata_${examId}`);
                localStorage.removeItem(`${examId}_progress`);
            }
            window.ExamApp.removeFromRegistry(window.ExamApp.STORAGE_KEYS.exams, examId);
            window.ExamApp.removeFromRegistry(window.ExamApp.STORAGE_KEYS.progress, examId);
            this.availableExams.delete(examId);
            return true;
        } catch (error) {
            console.error('Failed to delete exam:', error);
            return false;
        }
    }

}

// Global instance
window.ExamApp = window.ExamApp || {};
window.ExamApp.examManager = new ExamManager();
window.examManager = window.ExamApp.examManager; // backwards compat
