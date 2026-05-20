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

        // Also check localStorage for custom exams (if active)
        const customExams = this.getCustomExamsFromStorage();
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

            // If not found, try localStorage
            if (!examData) {
                examData = this.loadFromLocalStorage(examId);
            }

            if (examData && examData.questions && examData.questions.length > 0) {
                return {
                    id: examId,
                    questions: examData.questions,
                    metadata: examData.metadata || this.generateMetadata(examId, examData.questions),
                    hasImages: this.detectImages(examData.questions)
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

                // Generate metadata if not provided
                let metadata = examData.metadata;
                if (!metadata || Object.keys(metadata).length === 0) {
                    metadata = this.generateMetadata(examId, examData.questions);
                }

                return {
                    questions: examData.questions,
                    metadata: metadata
                };
            }
        } catch (error) {
            window.ExamApp.warn(`Failed to load ${examId} from user-content:`, error);
        }
        return null;
    }

    // Load exam from localStorage
    loadFromLocalStorage(examId) {
        try {
            const storageKey = `custom_${examId}_questions`;
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                const questions = JSON.parse(stored);
                return { questions };
            }
        } catch (error) {
            window.ExamApp.warn(`Failed to load ${examId} from localStorage:`, error);
        }
        return null;
    }

    // Get custom exams from localStorage
    getCustomExamsFromStorage() {
        const customExams = window.ExamApp.getRegistry(window.ExamApp.STORAGE_KEYS.exams);
        try {
            const len = localStorage.length;
            for (let i = 0; i < len; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('custom_') && key.endsWith('_questions')) {
                    const examId = key.replace('custom_', '').replace('_questions', '');
                    if (examId) {
                        if (window.ExamApp.isSafeExamId(examId) && !customExams.includes(examId)) customExams.push(examId);
                    }
                }
            }
        } catch (error) {
            window.ExamApp.warn('Error reading custom exams from localStorage:', error);
        }
        window.ExamApp.setRegistry(window.ExamApp.STORAGE_KEYS.exams, customExams);
        return customExams;
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
        return questions.some(q =>
            (q.question_images && q.question_images.length > 0) ||
            (q.explanation_images && q.explanation_images.length > 0) ||
            q.question.includes('![') || // Markdown images
            q.explanation?.includes('![')
        );
    }

    // Import exam from file/data (supports both array and object formats)
    async importExam(examId, examData, imageFiles = null) {
        try {
            const safeExamId = window.ExamApp.normalizeExamId(examId);
            if (!safeExamId) {
                throw new Error('Invalid exam id. Use letters, numbers, hyphens or underscores.');
            }
            examId = safeExamId;

            // Normalize data format
            let questions, metadata;

            if (Array.isArray(examData)) {
                // Direct array format (dump.json is just an array)
                questions = examData;
                metadata = null;
            } else if (examData.questions) {
                // Object format with questions property
                questions = examData.questions;
                metadata = examData.metadata;
            } else {
                throw new Error('Invalid exam data format');
            }

            // Validate
            const validation = window.ExamApp.validateExamData(questions, metadata);
            if (!validation.valid) {
                throw new Error(`Invalid question format: ${validation.errors.slice(0, 3).join('; ')}`);
            }

            // Store in localStorage with special marker
            const storageKey = `custom_${examId}_questions`;
            localStorage.setItem(storageKey, JSON.stringify(questions));
            window.ExamApp.addToRegistry(window.ExamApp.STORAGE_KEYS.exams, examId);

            // Generate and store metadata
            const metadataKey = `exam_metadata_${examId}`;
            const finalMetadata = metadata || this.generateMetadata(examId, questions);
            localStorage.setItem(metadataKey, JSON.stringify(finalMetadata));

            // Also add to window.userExams immediately (so it appears without refresh)
            if (!window.userExams) window.userExams = {};
            window.userExams[examId] = {
                questions: questions,
                metadata: finalMetadata
            };

            // Auto-activate
            this.activateExam(examId);

            // Re-detect exams
            await this.detectAvailableExams();

            window.ExamApp.log(`✅ Successfully imported exam: ${examId} (${questions.length} questions)`);
            return true;
        } catch (error) {
            console.error('Failed to import exam:', error);
            throw error;
        }
    }

    // Validate exam data structure
    validateExamData(examData) {
        // Handle both formats: {questions: [...]} and just [...]
        let questions;

        if (Array.isArray(examData)) {
            // Direct array format
            questions = examData;
        } else if (examData && Array.isArray(examData.questions)) {
            // Object with questions property
            questions = examData.questions;
        } else {
            return false;
        }

        return window.ExamApp.validateExamData(questions).valid;
    }

    // Delete exam
    deleteExam(examId) {
        try {
            if (!window.ExamApp.isSafeExamId(examId)) return false;
            localStorage.removeItem(`custom_${examId}_questions`);
            localStorage.removeItem(`exam_metadata_${examId}`);
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