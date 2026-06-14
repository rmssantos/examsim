/**
 * Exam Loader - metadata-first discovery with on-demand question loading.
 *
 * Bundled packs register their metadata at startup. Their dump.json is fetched
 * only when a page needs the questions. Browser-stored imports remain fully
 * loaded and override bundled entries with the same ID.
 */

window.ExamApp = window.ExamApp || {};
window.ExamApp.userExams = window.ExamApp.userExams || {};
window.userExams = window.ExamApp.userExams;

(function configureExamLoader() {
    const inFlightLoads = new Map();

    function hasImages(questions) {
        return Array.isArray(questions) && questions.some((question) => (
            (Array.isArray(question.question_images) && question.question_images.length > 0)
            || (Array.isArray(question.explanation_images) && question.explanation_images.length > 0)
            || String(question.question || '').includes('![')
            || String(question.explanation || '').includes('![')
        ));
    }

    async function discoverBundledExamIds() {
        try {
            const indexResponse = await fetch('user-content/exams/index.json');
            if (indexResponse.ok) {
                const examList = await indexResponse.json();
                if (Array.isArray(examList)) {
                    return examList.filter((examId) => window.ExamApp.isSafeExamId(examId));
                }
            }
        } catch (_) {
            // Fall through to directory discovery for local servers.
        }

        try {
            const response = await fetch('user-content/exams/');
            if (!response.ok) return [];
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            return Array.from(doc.querySelectorAll('a'))
                .map((link) => link.textContent.trim().replace(/\/$/, ''))
                .filter((examId) => window.ExamApp.isSafeExamId(examId));
        } catch (_) {
            window.ExamApp.log('Directory listing not available, using browser-stored exams only');
            return [];
        }
    }

    async function registerBundledExam(examId) {
        try {
            const metadataResponse = await fetch(`user-content/exams/${examId}/metadata.json`);
            if (!metadataResponse.ok) {
                window.ExamApp.warn(`Skipping ${examId}: metadata.json not found`);
                return;
            }
            const metadata = await metadataResponse.json();
            window.userExams[examId] = {
                questions: null,
                metadata,
                source: 'bundled',
                storage: 'network',
                loaded: false,
                hasImages: Boolean(metadata?.hasImages)
            };
            window.ExamApp.log(`Registered ${examId} metadata`);
        } catch (error) {
            console.error(`Failed to load metadata for ${examId}:`, error);
        }
    }

    async function loadStoredExams() {
        if (!window.ExamApp.examStorage) return;

        try {
            const storedExamIds = await window.ExamApp.examStorage.listExamIds();
            for (const examId of storedExamIds) {
                if (!window.ExamApp.isSafeExamId(examId)) {
                    window.ExamApp.warn(`Skipping invalid stored exam id: ${examId}`);
                    continue;
                }
                try {
                    const storedExam = await window.ExamApp.examStorage.getExam(examId);
                    if (!storedExam || !Array.isArray(storedExam.questions)) continue;
                    const validation = window.ExamApp.validateExamData(storedExam.questions, storedExam.metadata);
                    if (!validation.valid) {
                        console.error(`Failed to load ${examId} from browser storage: invalid data`, validation.errors.slice(0, 10));
                        continue;
                    }
                    window.userExams[examId] = {
                        questions: storedExam.questions,
                        labs: Array.isArray(storedExam.labs) ? storedExam.labs : [],
                        metadata: storedExam.metadata,
                        source: storedExam.source || 'imported',
                        storage: storedExam.storage || 'browser',
                        loaded: true,
                        hasImages: hasImages(storedExam.questions)
                    };
                } catch (error) {
                    console.error(`Failed to load ${examId} from browser storage:`, error);
                }
            }
        } catch (error) {
            window.ExamApp.warn('Failed to inspect browser exam storage:', error);
        }

        try {
            const progressExamIds = await window.ExamApp.examStorage.listProgressExamIds();
            await Promise.all(progressExamIds.map((examId) => window.ExamApp.examStorage.getProgress(examId)));
        } catch (error) {
            window.ExamApp.warn('Failed to migrate browser progress storage:', error);
        }
    }

    window.ExamApp.loadAllExams = async function loadAllExams() {
        window.ExamApp.log('Discovering exam metadata...');
        const examDirs = await discoverBundledExamIds();
        await Promise.all(examDirs.map(registerBundledExam));
        await loadStoredExams();
        window.ExamApp.log('Exam metadata loaded:', Object.keys(window.userExams));
        return window.userExams;
    };

    window.ExamApp.ensureExamLoaded = async function ensureExamLoaded(examId) {
        if (!window.ExamApp.isSafeExamId(examId)) {
            throw new Error('Invalid exam id.');
        }

        const existing = Object.getOwnPropertyDescriptor(window.userExams, examId)?.value;
        if (!existing) {
            throw new Error(`Exam ${examId} is not available.`);
        }
        if (Array.isArray(existing.questions)) {
            existing.loaded = true;
            return existing;
        }
        if (existing.source !== 'bundled') {
            throw new Error(`Exam ${examId} has no question data.`);
        }
        if (inFlightLoads.has(examId)) return inFlightLoads.get(examId);

        const loadPromise = (async () => {
            const dumpResponse = await fetch(`user-content/exams/${examId}/dump.json`);
            if (!dumpResponse.ok) {
                throw new Error(`Could not load questions for ${examId}.`);
            }
            const rawDump = await dumpResponse.json();
            const questions = Array.isArray(rawDump) ? rawDump : rawDump?.questions;
            const validation = window.ExamApp.validateExamData(questions, existing.metadata);
            if (!validation.valid) {
                throw new Error(`Invalid questions for ${examId}: ${validation.errors.slice(0, 3).join('; ')}`);
            }

            existing.questions = questions;
            existing.labs = (rawDump && !Array.isArray(rawDump) && Array.isArray(rawDump.labs)) ? rawDump.labs : [];
            existing.loaded = true;
            existing.hasImages = hasImages(questions) || Boolean(existing.metadata?.hasImages);
            window.ExamApp.log(`Loaded ${examId}: ${questions.length} questions, ${existing.labs.length} lab(s)`);
            return existing;
        })();

        inFlightLoads.set(examId, loadPromise);
        try {
            return await loadPromise;
        } finally {
            inFlightLoads.delete(examId);
        }
    };

    window.loadAllExams = window.ExamApp.loadAllExams;
    window.ensureExamLoaded = window.ExamApp.ensureExamLoaded;
    window.ExamApp.examsLoadedPromise = window.ExamApp.loadAllExams();
    window.examsLoadedPromise = window.ExamApp.examsLoadedPromise;
})();
