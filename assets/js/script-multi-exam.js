// Multi-Exam Simulator - Generic Exam Support
// Supports categorized images (question images vs explanation images)

const OFFICIAL_DOCUMENTATION_HOSTS = Object.freeze([
    'docs.aws.amazon.com',
    'aws.amazon.com',
    'learn.microsoft.com'
]);

function isOfficialDocumentationUrl(value) {
    try {
        const parsed = new URL(String(value || ''));
        if (parsed.protocol !== 'https:') return false;

        const hostname = parsed.hostname.toLowerCase();
        return OFFICIAL_DOCUMENTATION_HOSTS.some(
            allowed => hostname === allowed || hostname.endsWith(`.${allowed}`)
        );
    } catch (_) {
        return false;
    }
}

class TimerManager {
    constructor() {
        this.timer = null;
        this.remainingTime = 0;
    }

    start(totalSeconds, onTick, onExpire) {
        this.stop();
        this.remainingTime = totalSeconds;
        this.timer = setInterval(() => {
            this.remainingTime--;
            onTick(this.remainingTime);
            if (this.remainingTime <= 0) {
                this.stop();
                onExpire();
            }
        }, 1000);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    getRemainingTime() {
        return this.remainingTime;
    }
}

function isExamAnswerProvided(answer) {
    if (Array.isArray(answer)) {
        return answer.length > 0 && answer.every(value => value !== undefined && value !== null && value !== '');
    }
    return answer !== undefined && answer !== null && answer !== '';
}

class QuestionNavigator {
    constructor() {
        this.container = null;
    }

    update(questions, currentIndex, selectedAnswers, markedForReview, onJump) {
        const grid = document.getElementById('nav-grid');
        if (!grid) return;

        grid.innerHTML = '';
        grid.setAttribute('aria-label', 'Question navigator');
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < questions.length; i++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = i + 1;
            const state = [];

            if (i === currentIndex) {
                btn.classList.add('nav-current');
                btn.setAttribute('aria-current', 'step');
                state.push('current');
            }
            if (isExamAnswerProvided(selectedAnswers[i])) {
                btn.classList.add('nav-answered');
                state.push('answered');
            }
            if (markedForReview && markedForReview.has(i)) {
                btn.classList.add('nav-marked');
                state.push('marked for review');
            }
            if (state.length === 0) state.push('unanswered');

            const label = `Question ${i + 1}, ${state.join(', ')}`;
            btn.title = label;
            btn.setAttribute('aria-label', label);

            btn.addEventListener('click', () => onJump(i));
            fragment.appendChild(btn);
        }
        grid.appendChild(fragment);
    }

    toggle() {
        const nav = document.getElementById('question-navigator');
        if (!nav) return;
        const shouldHide = !nav.hidden && !nav.classList.contains('is-hidden');
        window.ExamApp.setElementHidden(nav, shouldHide);
        const toggle = document.getElementById('toggle-navigator');
        if (toggle) toggle.setAttribute('aria-expanded', String(!shouldHide));
    }
}

class MultiExamSimulator {
    constructor() {
        this.currentExam = null;
        this.activeQuestions = null; // holds the sampled & randomized questions for the session
        this.examData = {};

        this.currentQuestionIndex = 0;
        this.selectedAnswers = {};
        this.markedForReview = new Set();
        this.startTime = null;
        this.timer = null;
        this.timerManager = new TimerManager();
        this.navigator = new QuestionNavigator();
        this.reviewPage = 0;
        this.mode = 'exam';
        this.studyQueueSummary = null;
        this.studySessionResults = new Map();
        this.studySessionId = null;
        this.localIdCounter = 0;
        this.attemptReviewDetailLimit = 10;

        this.init();
    }

    generateLocalId(prefix = 'id') {
        this.localIdCounter += 1;
        const timePart = Date.now().toString(36);
        if (window.crypto?.getRandomValues) {
            const bytes = new Uint32Array(2);
            window.crypto.getRandomValues(bytes);
            return `${prefix}_${timePart}_${Array.from(bytes, value => value.toString(36)).join('')}`;
        }
        return `${prefix}_${timePart}_${this.localIdCounter.toString(36)}`;
    }

    init() {
        this.loadQuestions();
        this.bindEvents();
        this.updateProgressDisplay();

        // Exam-only mode bootstrap is owned by exam-init.js when present.
        if (window.ExamApp?.externalExamBootstrap === true || document.body?.dataset.examInitManaged === 'true') {
            return;
        }

        // Exam-only mode: if exam param is provided, auto-start in this page
        const params = new URLSearchParams(window.location.search);
        const examParam = params.get('exam');
        this.mode = params.get('mode') === 'study' ? 'study' : 'exam';
        if (examParam && examParam !== 'custom' && window.ExamApp.isSafeExamId(examParam)) {
            // Load exam dynamically from window.userExams or localStorage
            if (!this.examData[examParam]) {
                const loaded = this.loadExamFromRuntime(examParam);
                if (loaded) {
                    this.currentExam = examParam;
                    this.startCurrentMode();
                }
            } else {
                this.currentExam = examParam;
                if (this.examData[this.currentExam].questions.length > 0) {
                    this.startCurrentMode();
                }
            }
        }

        // If custom exam requested via URL, load it and start
        this.loadCustomExamIfRequested().then((loaded)=>{
            if (loaded) {
                this.startCurrentMode();
            }
        });

        // Auto-refresh question banks if overrides change (even across tabs)
        window.addEventListener('storage', (ev) => {
            if (ev.key && ev.key.startsWith('custom_') && ev.key.endsWith('_questions')) {
                window.ExamApp.log('Detected override change in storage. Reloading question banks.');
                this.loadQuestions();
            }
        });
    }

    // Helper: return the active question set for the session or the master list
    getCurrentQuestions() {
        const master = this.examData[this.currentExam]?.questions || [];
        return Array.isArray(this.activeQuestions) && this.activeQuestions.length > 0 ? this.activeQuestions : master;
    }

    // Helper: check if a user's answer is correct for any question type
    isAnswerCorrect(question, userAnswer) {
        const type = window.ExamApp.normalizeQuestionType(question);

        if (type === 'SEQUENCE') {
            if (!Array.isArray(userAnswer)) return false;
            const correctOrder = question.correct;
            return JSON.stringify(userAnswer) === JSON.stringify(correctOrder);
        }

        if (type === 'YES_NO_MATRIX') {
            if (!Array.isArray(userAnswer)) return false;
            const correctAnswers = question.correct;
            return userAnswer.length === correctAnswers.length &&
                   userAnswer.every((ans, i) => ans === correctAnswers[i]);
        }

        if (type === 'DRAG_DROP_SELECT') {
            if (!Array.isArray(userAnswer)) return false;
            const correctAnswers = question.correct;
            return userAnswer.length === correctAnswers.length &&
                   userAnswer.every((ans, i) => ans === correctAnswers[i]);
        }

        // SINGLE or MULTI
        if (Array.isArray(question.correct)) {
            if (!Array.isArray(userAnswer)) return false;
            const sortedUser = [...userAnswer].sort();
            const sortedCorrect = [...question.correct].sort();
            return JSON.stringify(sortedUser) === JSON.stringify(sortedCorrect);
        }

        return userAnswer === question.correct;
    }

    // Helper: shuffle array in-place (Fisher-Yates)
    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // Helper: sample N items from array uniformly at random (without replacement)
    sampleQuestions(all, count) {
        const copy = [...all];
        this.shuffle(copy);
        return copy.slice(0, Math.min(count, copy.length));
    }

    // Helper: sample N items with rough balance across q.module buckets
    sampleBalancedQuestions(all, count) {
        if (!Array.isArray(all) || all.length === 0) return [];
        if (all.length <= count) return [...all];

        // Group by module (null/undefined -> 'Uncategorized') using copies
        const buckets = new Map();
        for (const q of all) {
            const key = (q && q.module) ? String(q.module) : 'Uncategorized';
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(q);
        }
        // Shuffle each bucket (these are fresh arrays, not the original)
        for (const arr of buckets.values()) this.shuffle(arr);

        const groups = Array.from(buckets.entries());
        // Sort groups by size desc to spread remainder fairly
        groups.sort((a,b)=>b[1].length - a[1].length);

        const k = groups.length;
        const base = Math.floor(count / k);
        let remainder = count % k;
        const selected = [];
        // Track how many items consumed from each group (avoids mutating arrays)
        const consumed = new Array(groups.length).fill(0);

        // First pass: take base (+1 for first remainder groups) from each bucket
        for (let i=0;i<groups.length;i++) {
            const arr = groups[i][1];
            const target = Math.min(arr.length, base + (remainder>0 ? 1 : 0));
            if (remainder>0) remainder--;
            selected.push(...arr.slice(consumed[i], consumed[i] + target));
            consumed[i] += target;
        }

        // If still short (due to small buckets), fill round-robin from remaining groups
        let idx = 0;
        let activeGroups = groups.filter((_, i) => consumed[i] < groups[i][1].length).length;
        while (selected.length < count && activeGroups > 0) {
            const gi = idx % groups.length;
            const arr = groups[gi][1];
            if (consumed[gi] < arr.length) {
                selected.push(arr[consumed[gi]]);
                consumed[gi]++;
                if (consumed[gi] >= arr.length) activeGroups--;
            }
            idx++;
        }

        // Final shuffle of selection to avoid module order bias
        return this.shuffle(selected);
    }

    // Helper: randomize options and remap correct indices (supports single, multi, and sequence)
    randomizeQuestionOptions(question) {
        const q = JSON.parse(JSON.stringify(question));
        if (!Array.isArray(q.options) || q.options.length === 0) return q;
        // Do not randomize for special types to avoid breaking semantics
        const questionType = window.ExamApp.normalizeQuestionType(q);
        if (questionType === 'SEQUENCE' || questionType === 'YES_NO_MATRIX' || questionType === 'DRAG_DROP_SELECT') {
            return q;
        }
        const optionMap = q.options.map((opt, idx) => ({ opt, originalIndex: idx }));
        this.shuffle(optionMap);
        q.options = optionMap.map(o => o.opt);

        if (Array.isArray(q.correct)) {
            q.correct = q.correct.map(ci => optionMap.findIndex(o => o.originalIndex === ci));
        } else if (typeof q.correct === 'number') {
            q.correct = optionMap.findIndex(o => o.originalIndex === q.correct);
        }
        q._optionIndexMap = optionMap.map(o => o.originalIndex);
        return q;
    }

    loadQuestions() {
        // Load all exams from window.userExams (populated by exam-loader.js)
        if (window.userExams) {
            for (const [examId, examEntry] of Object.entries(window.userExams)) {
                if (!this.examData[examId]) {
                    this.loadExamFromRuntime(examId);
                }
            }
        }

        // Apply localStorage overrides for any loaded exam
        for (const examId of Object.keys(this.examData)) {
            try {
                if (!window.ExamApp.isSafeExamId(examId)) continue;
                if (window.userExams?.[examId]?.storage === 'indexedDB') continue;
                const overrideRaw = localStorage.getItem(`custom_${examId}_questions`);
                if (overrideRaw) {
                    const parsed = JSON.parse(overrideRaw);
                    if (Array.isArray(parsed) && parsed.length > 0 && window.ExamApp.validateExamData(parsed).valid) {
                        window.ExamApp.log(`Using local override for ${examId} questions`);
                        this.examData[examId].questions = parsed;
                    }
                }
            } catch (e) {
                window.ExamApp.warn(`Failed to parse custom_${examId}_questions override:`, e);
            }
        }

        const summary = {};
        for (const [id, data] of Object.entries(this.examData)) {
            summary[id] = data.questions.length;
        }
        window.ExamApp.log('Loaded questions:', summary);
    }

    bindEvents() {
        // Exam selection
        document.querySelectorAll('.exam-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const examType = card.dataset.exam;
                this.selectExam(examType);
            });
        });

        // Start exam button
        document.getElementById('start-exam')?.addEventListener('click', () => {
            if (!this.currentExam) {
                alert('Please select an exam first.');
                return;
            }
            // Open in a new page like the single-exam flow
            const url = window.ExamApp.router?.buildUrl('exam', { exam: this.currentExam })
                || `exam.html?exam=${encodeURIComponent(this.currentExam)}`;
            window.open(url, '_blank');
        });

        // Start custom exam from home
        document.getElementById('start-custom-exam')?.addEventListener('click', () => {
            const code = (document.getElementById('custom-exam-code')?.value || '').trim();
            if (!code) { alert('Enter a custom exam code'); return; }
            const url = window.ExamApp.router?.buildUrl('exam', { exam: 'custom', code })
                || `exam.html?exam=custom&code=${encodeURIComponent(code)}`;
            window.open(url, '_blank');
        });

        // Navigation buttons
        document.getElementById('prev-btn')?.addEventListener('click', () => {
            this.previousQuestion();
        });

        document.getElementById('next-btn')?.addEventListener('click', () => {
            this.nextQuestion();
        });

        // Switch exam in exam screen
        document.getElementById('switch-exam')?.addEventListener('click', () => {
            this.showScreen('welcome-screen');
        });

        // Other existing event handlers
        document.getElementById('show-answer-btn')?.addEventListener('click', () => {
            this.showAnswer();
        });

        document.getElementById('close-feedback')?.addEventListener('click', () => {
            this.closeFeedback();
        });

        document.getElementById('mark-review-btn')?.addEventListener('click', () => {
            this.toggleMarkForReview();
        });

        document.getElementById('finish-exam')?.addEventListener('click', () => {
            this.finishExam();
        });

        document.getElementById('restart-exam')?.addEventListener('click', () => {
            this.restartExam();
        });

        document.getElementById('back-to-home')?.addEventListener('click', () => {
            this.showScreen('welcome-screen');
        });

        // Theme toggle
        document.querySelectorAll('.theme-toggle').forEach(button => {
            button.addEventListener('click', () => {
                this.toggleTheme();
            });
        });

        // Question navigator toggle
        const toggleNav = document.getElementById('toggle-navigator');
        if (toggleNav) {
            toggleNav.addEventListener('click', () => {
                this.navigator.toggle();
            });
        }

        // Review marked questions button
        const reviewMarkedBtn = document.getElementById('review-marked-btn');
        if (reviewMarkedBtn) {
            reviewMarkedBtn.addEventListener('click', () => {
                this.reviewMarkedQuestions();
            });
        }
    }

    selectExam(examType) {
        if (!this.examData[examType]) return;

        if (this.examData[examType].questions.length === 0) {
            alert(`Sorry, ${examType.toUpperCase()} questions are not available yet.`);
            return;
        }

        this._completeExamSelection(examType);
    }

    async loadCustomExamIfRequested() {
        const params = new URLSearchParams(window.location.search);
        const examParam = params.get('exam');
        const code = params.get('code');
        if (examParam === 'custom' && code) {
            if (!window.ExamApp.isSafeExamId(code)) {
                alert('Invalid custom exam code.');
                return false;
            }
            const getMeta = (questions) => {
                // 1) Prefer existing metadata
                if (window.userExams?.[code]?.metadata) {
                    return window.userExams[code].metadata;
                }
                try {
                    const rawMeta = localStorage.getItem(`exam_metadata_${code}`);
                    if (rawMeta) {
                        const parsed = JSON.parse(rawMeta);
                        if (parsed && typeof parsed === 'object') return parsed;
                    }
                } catch (_) {}

                // 2) Generate metadata using ExamManager logic if available
                try {
                    if (window.examManager && typeof window.examManager.generateMetadata === 'function') {
                        return window.examManager.generateMetadata(code, Array.isArray(questions) ? questions : []);
                    }
                } catch (_) {}

                // 3) Minimal fallback
                return {
                    name: code.toUpperCase(),
                    fullName: code,
                    duration: 45,
                    questionCount: 45,
                    passScore: 70,
                    modules: []
                };
            };

            // Try browser-loaded custom exam first
            if (window.userExams?.[code]?.questions) {
                const data = window.userExams[code].questions;
                if (Array.isArray(data) && data.length && window.ExamApp.validateExamData(data).valid) {
                    const meta = getMeta(data);
                    this.examData['custom'] = {
                        name: meta.name || code.toUpperCase(),
                        fullName: meta.fullName || meta.name || code,
                        duration: Number.isFinite(Number(meta.duration)) ? Number(meta.duration) : 45,
                        questionCount: Number.isFinite(Number(meta.questionCount)) ? Number(meta.questionCount) : 45,
                        passScore: Number.isFinite(Number(meta.passScore)) ? Number(meta.passScore) : 70,
                        questions: data,
                        modules: Array.isArray(meta.modules) ? meta.modules : [],
                        resources: []
                    };
                    this.currentExam = 'custom';
                    return true;
                }
            }

            // Try legacy localStorage override next
            try {
                const raw = localStorage.getItem(`custom_${code}_questions`);
                if (raw) {
                    const data = JSON.parse(raw);
                    if (Array.isArray(data) && data.length && window.ExamApp.validateExamData(data).valid) {
                        const meta = getMeta(data);
                        this.examData['custom'] = {
                            name: meta.name || code.toUpperCase(),
                            fullName: meta.fullName || meta.name || code,
                            duration: Number.isFinite(Number(meta.duration)) ? Number(meta.duration) : 45,
                            questionCount: Number.isFinite(Number(meta.questionCount)) ? Number(meta.questionCount) : 45,
                            passScore: Number.isFinite(Number(meta.passScore)) ? Number(meta.passScore) : 70,
                            questions: data,
                            modules: Array.isArray(meta.modules) ? meta.modules : [],
                            resources: []
                        };
                        this.currentExam = 'custom';
                        return true;
                    }
                }
            } catch (_) {}
            // Fallback to exam-dumps
            try {
                const resp = await fetch(`./exam-dumps/${encodeURIComponent(code)}.json`);
                if (resp.ok) {
                    const data = await resp.json();
                    if (Array.isArray(data) && data.length && window.ExamApp.validateExamData(data).valid) {
                        const meta = getMeta(data);
                        this.examData['custom'] = {
                            name: meta.name || code.toUpperCase(),
                            fullName: meta.fullName || meta.name || code,
                            duration: Number.isFinite(Number(meta.duration)) ? Number(meta.duration) : 45,
                            questionCount: Number.isFinite(Number(meta.questionCount)) ? Number(meta.questionCount) : 45,
                            passScore: Number.isFinite(Number(meta.passScore)) ? Number(meta.passScore) : 70,
                            questions: data,
                            modules: Array.isArray(meta.modules) ? meta.modules : [],
                            resources: []
                        };
                        this.currentExam = 'custom';
                        return true;
                    }
                }
            } catch (_) {}
            alert(`Custom exam not found: ${code}`);
        }
        return false;
    }

    // Load an arbitrary exam by ID from window.userExams or localStorage.
    // Returns true if the exam was loaded into this.examData.
    loadExamFromRuntime(examId) {
        if (!window.ExamApp.isSafeExamId(examId)) return false;

        // Prefer in-memory exams (server mode auto-detection)
        const fromMemory = window.userExams && window.userExams[examId];
        if (fromMemory && Array.isArray(fromMemory.questions) && fromMemory.questions.length > 0 && window.ExamApp.validateExamData(fromMemory.questions, fromMemory.metadata).valid) {
            const metadata = fromMemory.metadata || {};
            this.examData[examId] = {
                name: metadata.name || examId.toUpperCase(),
                fullName: metadata.fullName || metadata.name || `Exam: ${examId}`,
                duration: metadata.duration || 45,
                questionCount: metadata.questionCount || 45,
                passScore: metadata.passScore || 70,
                questions: fromMemory.questions,
                modules: metadata.modules || [],
                resources: metadata.resources || []
            };
            return true;
        }

        // Fall back to localStorage imports
        try {
            const raw = localStorage.getItem(`custom_${examId}_questions`);
            if (!raw) return false;
            const questions = JSON.parse(raw);
            if (!Array.isArray(questions) || questions.length === 0 || !window.ExamApp.validateExamData(questions).valid) return false;
            let metadata = {};
            try {
                const metaRaw = localStorage.getItem(`exam_metadata_${examId}`);
                metadata = metaRaw ? JSON.parse(metaRaw) : {};
            } catch (_) {
                metadata = {};
            }
            this.examData[examId] = {
                name: metadata.name || examId.toUpperCase(),
                fullName: metadata.fullName || metadata.name || `Exam: ${examId}`,
                duration: metadata.duration || 45,
                questionCount: metadata.questionCount || 45,
                passScore: metadata.passScore || 70,
                questions,
                modules: metadata.modules || [],
                resources: metadata.resources || []
            };
            return true;
        } catch (error) {
            window.ExamApp.warn('Failed to load exam from localStorage', { examId, error });
            return false;
        }
    }

    _completeExamSelection(examType) {
        this.currentExam = examType;
        const exam = this.examData[examType];

        // Update UI to show selected exam
        this.updateExamInfo(exam);

        // Show exam info and start button
        document.getElementById('current-exam-info').style.display = 'block';
        document.querySelector('.start-exam-cta').style.display = 'block';
        document.getElementById('modules-section').style.display = 'block';

        // Update modules and resources
        this.updateModulesAndResources(exam);

        window.ExamApp.log(`Selected exam: ${examType}`, exam);
    }

    updateExamInfo(exam) {
        document.getElementById('current-exam-name').textContent = exam.name;
        document.getElementById('exam-duration').textContent = `${exam.duration} minutes`;
        document.getElementById('exam-questions').textContent = `${exam.questionCount} questions`;
        document.getElementById('exam-pass-score').textContent = `${exam.passScore}%`;
        document.getElementById('exam-images').textContent = 'With Images';
    }

    safeIconClass(icon, fallback = 'fas fa-book') {
        const value = String(icon || '').trim();
        return /^[a-zA-Z0-9 _-]+$/.test(value) ? value : fallback;
    }

    safeUrl(url) {
        const value = String(url || '').trim();
        if (!value) return null;

        try {
            const parsed = new URL(value, window.location.href);
            if (!['http:', 'https:'].includes(parsed.protocol)) return null;
            return parsed.href;
        } catch (_) {
            return null;
        }
    }

    appendIcon(parent, iconClass, fallback) {
        const icon = document.createElement('i');
        icon.setAttribute('aria-hidden', 'true');
        icon.className = this.safeIconClass(iconClass, fallback);
        parent.appendChild(icon);
    }

    updateModulesAndResources(exam) {
        // Update modules list
        const modulesList = document.getElementById('modules-list');
        modulesList.innerHTML = '';
        exam.modules.forEach(module => {
            const li = document.createElement('li');
            this.appendIcon(li, module.icon, 'fas fa-book');
            li.appendChild(document.createTextNode(` ${module.name || 'Module'}`));
            modulesList.appendChild(li);
        });

        // Update resources list
        const resourcesList = document.getElementById('resources-list');
        resourcesList.innerHTML = '';
        exam.resources.forEach(resource => {
            const safeHref = this.safeUrl(resource.url);
            if (!safeHref) return;

            const a = document.createElement('a');
            a.href = safeHref;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.className = 'resource-compact';
            this.appendIcon(a, resource.icon, 'fas fa-link');
            a.appendChild(document.createTextNode(` ${resource.name || 'Resource'}`));
            resourcesList.appendChild(a);
        });
    }

    setupKeyboardShortcuts() {
        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }
        this._keyHandler = (e) => {
            if (document.getElementById('finish-exam-confirm-modal')) return;

            // Don't trigger if user is typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const questions = this.getCurrentQuestions();
            const question = questions[this.currentQuestionIndex];
            if (!question) return;
            const questionType = window.ExamApp.normalizeQuestionType(question);

            // Left/Right arrows for navigation
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.previousQuestion();
                return;
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.nextQuestion();
                return;
            }
            if (e.key === 'm' || e.key === 'M') {
                this.toggleMarkForReviewShortcut();
                return;
            }

            // Number/Letter keys mapping
            let keyIndex = -1;
            if (['1', 'a', 'A'].includes(e.key)) keyIndex = 0;
            else if (['2', 'b', 'B'].includes(e.key)) keyIndex = 1;
            else if (['3', 'c', 'C'].includes(e.key)) keyIndex = 2;
            else if (['4', 'd', 'D'].includes(e.key)) keyIndex = 3;

            if (questionType === 'SEQUENCE') {
                const order = this.selectedAnswers[this.currentQuestionIndex] || [];
                if (keyIndex !== -1 && keyIndex < order.length) {
                    // Focus this sequence item position
                    this.focusedSequencePos = keyIndex;
                    const items = document.querySelectorAll('#options-container .sequence-item');
                    items.forEach((item, idx) => {
                        item.classList.toggle('keyboard-focused', idx === this.focusedSequencePos);
                    });
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const items = document.querySelectorAll('#options-container .sequence-item');
                    const currentItem = items[this.focusedSequencePos];
                    if (currentItem) {
                        if (e.key === 'ArrowUp') {
                            const upBtn = currentItem.querySelector('.up');
                            if (upBtn && !upBtn.disabled) {
                                upBtn.click();
                                this.focusedSequencePos = Math.max(0, this.focusedSequencePos - 1);
                            }
                        } else {
                            const downBtn = currentItem.querySelector('.down');
                            if (downBtn && !downBtn.disabled) {
                                downBtn.click();
                                this.focusedSequencePos = Math.min(items.length - 1, this.focusedSequencePos + 1);
                            }
                        }
                        // Re-apply focus style after DOM update (render)
                        setTimeout(() => {
                            const newItems = document.querySelectorAll('#options-container .sequence-item');
                            newItems.forEach((item, idx) => {
                                item.classList.toggle('keyboard-focused', idx === this.focusedSequencePos);
                            });
                        }, 0);
                    }
                }
            } else if (questionType === 'YES_NO_MATRIX') {
                const rows = document.querySelectorAll('#options-container .yn-matrix .yn-row');
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (rows.length > 0) {
                        rows[this.focusedMatrixRow]?.classList.remove('keyboard-focused');
                        if (e.key === 'ArrowUp') {
                            this.focusedMatrixRow = Math.max(0, this.focusedMatrixRow - 1);
                        } else {
                            this.focusedMatrixRow = Math.min(rows.length - 1, this.focusedMatrixRow + 1);
                        }
                        rows[this.focusedMatrixRow]?.classList.add('keyboard-focused');
                    }
                } else {
                    // Check for Yes/No selection on the focused row
                    const currentRow = rows[this.focusedMatrixRow];
                    if (currentRow) {
                        if (['1', 'a', 'A', 'y', 'Y'].includes(e.key)) {
                            const yesBtn = currentRow.querySelector('.yn-btn.yes');
                            if (yesBtn) yesBtn.click();
                        } else if (['2', 'b', 'B', 'n', 'N'].includes(e.key)) {
                            const noBtn = currentRow.querySelector('.yn-btn.no');
                            if (noBtn) noBtn.click();
                        }
                    }
                }
            } else if (questionType === 'DRAG_DROP_SELECT') {
                if (keyIndex !== -1) {
                    this.selectOptionByIndex(keyIndex);
                } else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
                    const controls = Array.from(document.querySelectorAll('#options-container .ddselect-btn, #options-container .chip-remove'));
                    if (controls.length) {
                        e.preventDefault();
                        const activeIndex = controls.indexOf(document.activeElement);
                        let nextIndex = activeIndex >= 0 ? activeIndex : 0;
                        if (e.key === 'ArrowUp') nextIndex = Math.max(0, nextIndex - 1);
                        if (e.key === 'ArrowDown') nextIndex = Math.min(controls.length - 1, nextIndex + 1);
                        if (e.key === 'Home') nextIndex = 0;
                        if (e.key === 'End') nextIndex = controls.length - 1;
                        controls[nextIndex].focus();
                    }
                }
            } else {
                // RADIO, CHECKBOX
                if (keyIndex !== -1) {
                    this.selectOptionByIndex(keyIndex);
                }
            }
        };
        document.addEventListener('keydown', this._keyHandler);
    }

    selectOptionByIndex(index) {
        const question = this.getCurrentQuestions()[this.currentQuestionIndex];
        const questionType = window.ExamApp.normalizeQuestionType(question);
        if (questionType === 'DRAG_DROP_SELECT') {
            // Find if the option is already selected (in the target area)
            const rmBtn = document.querySelector(`.ddselect-target .chip-remove[data-option-index="${index}"]`);
            if (rmBtn) {
                rmBtn.click();
            } else {
                const addBtn = document.querySelector(`.ddselect-source .ddselect-btn[data-option-index="${index}"]`);
                if (addBtn) addBtn.click();
            }
        } else {
            const options = document.querySelectorAll('#options-container .option input');
            if (options[index]) {
                options[index].click();
            }
        }
    }

    toggleMarkForReviewShortcut() {
        if (this.isStudyMode()) return;
        const btn = document.getElementById('mark-review-btn');
        if (btn) btn.click();
    }

    isStudyMode() {
        return this.mode === 'study';
    }

    startCurrentMode() {
        if (this.isStudyMode()) {
            this.startStudyMode();
            return;
        }
        this.startExam();
    }

    setButtonContent(buttonId, iconClass, labelText) {
        const button = document.getElementById(buttonId);
        if (!button) return;
        button.replaceChildren();
        const icon = document.createElement('i');
        icon.setAttribute('aria-hidden', 'true');
        icon.className = iconClass;
        button.appendChild(icon);
        button.appendChild(document.createTextNode(` ${labelText}`));
    }

    getSessionQuestionLimit(totalQuestions) {
        const desired = Number(this.examData?.[this.currentExam]?.questionCount);
        if (Number.isFinite(desired) && desired > 0) {
            return Math.min(totalQuestions, Math.round(desired));
        }
        return Math.min(totalQuestions, 45);
    }

    consumeStudyFocusQuestions(allQuestions) {
        const params = new URLSearchParams(window.location.search);
        if (params.get('focus') !== 'missed' || !this.currentExam) return null;

        let payload = null;
        try {
            const raw = sessionStorage.getItem(`study_focus_${this.currentExam}`);
            payload = raw ? JSON.parse(raw) : null;
            sessionStorage.removeItem(`study_focus_${this.currentExam}`);
        } catch (_) {
            payload = null;
        }

        if (!payload || !Array.isArray(payload.questionIds)) return null;
        const questionIds = new Set(payload.questionIds.map(value => String(value || '').trim()).filter(Boolean));
        if (questionIds.size === 0) return null;

        const scheduler = window.ExamApp.studyScheduler;
        const focused = allQuestions.filter((question, index) => questionIds.has(scheduler?.getQuestionId(question, index) || this.getQuestionStableId(question, index)));
        return focused.length > 0 ? focused : null;
    }

    applyExamModeChrome() {
        document.body?.classList.remove('study-mode');
        window.ExamApp.setElementHidden(document.querySelector('.exam-timer'), false);
        window.ExamApp.setElementHidden(document.getElementById('mark-review-btn'), false);
        window.ExamApp.setElementHidden(document.getElementById('review-marked-btn'), false);
        this.setButtonContent('show-answer-btn', 'fas fa-lightbulb', 'Show Answer');
        this.setButtonContent('finish-exam', 'fas fa-check', 'Finish Exam');
    }

    applyStudyModeChrome() {
        document.body?.classList.add('study-mode');
        this.timerManager.stop();
        const timer = document.getElementById('timer');
        if (timer) timer.textContent = 'Study';
        window.ExamApp.setElementHidden(document.querySelector('.exam-timer'), true);
        window.ExamApp.setElementHidden(document.getElementById('mark-review-btn'), true);
        window.ExamApp.setElementHidden(document.getElementById('review-marked-btn'), true);
        this.setButtonContent('show-answer-btn', 'fas fa-check-circle', 'Check Answer');
        this.setButtonContent('finish-exam', 'fas fa-flag-checkered', 'Finish Study');
    }

    startExam() {
        if (!this.currentExam) {
            alert('Please select an exam first.');
            return;
        }

        this.mode = 'exam';
        this.applyExamModeChrome();

        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }

        // Ensure dataset is loaded before starting
        if ((this.examData[this.currentExam].questions || []).length === 0) {
            alert(`No questions available for this exam.`);
            return;
        }

        // Reset exam state
        this.currentQuestionIndex = 0;
        this.selectedAnswers = {};
        this.markedForReview = new Set();
        this.startTime = new Date();
        this.studyQueueSummary = null;
        this.studySessionResults = new Map();
        this.studySessionId = null;

        // Update exam badge in header
        document.getElementById('current-exam-badge').textContent = this.examData[this.currentExam].name;
        document.getElementById('current-exam-badge').className = 'exam-badge';

    // Build the active session question set: random sample + randomized options
    const full = this.examData[this.currentExam].questions || [];
    // Target questions per exam
    const desired = this.examData[this.currentExam].questionCount;
    let targetCount = 50;
    if (typeof desired === 'number') targetCount = desired;
    // Use balanced sampling across modules
    const sampled = this.sampleBalancedQuestions(full, targetCount);
    this.activeQuestions = sampled.map(q => this.randomizeQuestionOptions(q));

    // Start timer and render
    this.startTimer();
    this.setupKeyboardShortcuts();
    this.showQuestion(0);

    window.ExamApp?.analytics?.trackExamStarted(this.currentExam, {
        questionCount: this.activeQuestions.length
    });

        // Switch to exam screen
        this.showScreen('exam-screen');
    }

    async startStudyMode() {
        if (!this.currentExam) {
            alert('Please select an exam first.');
            return;
        }

        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }

        const full = this.examData[this.currentExam]?.questions || [];
        if (full.length === 0) {
            alert(`No questions available for this exam.`);
            return;
        }

        this.mode = 'study';
        this.applyStudyModeChrome();
        this.currentQuestionIndex = 0;
        this.selectedAnswers = {};
        this.markedForReview = new Set();
        this.startTime = new Date();
        this.studySessionId = this.generateLocalId('study_session');
        this.studySessionResults = new Map();

        const examName = this.examData[this.currentExam].name;
        const badge = document.getElementById('current-exam-badge');
        if (badge) {
            badge.textContent = `${examName} · Study`;
            badge.className = 'exam-badge study-badge';
        }

        let records = [];
        if (window.ExamApp.studyStorage) {
            records = await window.ExamApp.studyStorage.getRecordsForExam(this.currentExam);
        }

        const scheduler = window.ExamApp.studyScheduler;
        const limit = this.getSessionQuestionLimit(full.length);
        this.studyQueueSummary = scheduler?.summarize(full, records) || null;
        const focusedQuestions = this.consumeStudyFocusQuestions(full);
        const queue = focusedQuestions || scheduler?.buildStudyQueue(full, records, { limit }) || this.sampleBalancedQuestions(full, limit);
        this.activeQuestions = queue.map(q => this.randomizeQuestionOptions(q));

        if (focusedQuestions?.length && badge) {
            badge.textContent = `${examName} · Missed Study`;
        }

        this.setupKeyboardShortcuts();
        this.showQuestion(0);
        this.showScreen('exam-screen');

        window.ExamApp?.analytics?.trackStudyStarted(this.currentExam, {
            questionCount: this.activeQuestions.length,
            dueCount: this.studyQueueSummary?.dueReviewCount,
            newCount: this.studyQueueSummary?.newCount,
            weakCount: this.studyQueueSummary?.weakCount
        });
    }

    showQuestion(index) {
        const questions = this.getCurrentQuestions();
        if (index < 0 || index >= questions.length) return;

        this.currentQuestionIndex = index;
        this.focusedSequencePos = 0;
        this.focusedMatrixRow = 0;
    const question = questions[index];

        // Update question display
        document.getElementById('question-number').textContent = this.isStudyMode() ? `Study Question ${index + 1}` : `Question ${index + 1}`;
        document.getElementById('question-text').innerHTML = this.formatQuestionText(question.question);

        // Update question counter
        document.getElementById('question-counter').textContent = `${index + 1} / ${questions.length}`;

        // Update progress bar
        const progress = ((index + 1) / questions.length) * 100;
        document.getElementById('progress-fill').style.width = `${progress}%`;
        const progressBar = document.querySelector('.progress-bar');
        if (progressBar) progressBar.setAttribute('aria-valuenow', String(Math.round(progress)));

        // Show question type indicator
        this.showQuestionTypeIndicator(question);

        // Display question images
        this.displayQuestionImages(question);

    // Update options
    this.displayOptions(question);

    // Update navigation buttons
        document.getElementById('prev-btn').disabled = index === 0;
        window.ExamApp.setElementHidden(document.getElementById('next-btn'), index === questions.length - 1);
        window.ExamApp.setElementHidden(document.getElementById('finish-exam'), index !== questions.length - 1);

        // Update mark for review button
        const isMarked = this.markedForReview.has(index);
        const markReviewButton = document.getElementById('mark-review-btn');
        if (markReviewButton) {
            markReviewButton.classList.toggle('marked', isMarked);
            window.ExamApp.setElementHidden(markReviewButton, this.isStudyMode());
        }
        window.ExamApp.setElementHidden(document.getElementById('review-marked-btn'), this.isStudyMode());

        // Hide answer feedback
        this.closeFeedback();

        // Update question navigator
        this.updateNavigator();
    }

    updateNavigator() {
        this.navigator.update(
            this.activeQuestions || [],
            this.currentQuestionIndex,
            this.selectedAnswers,
            this.markedForReview,
            (i) => {
                this.currentQuestionIndex = i;
                this.showQuestion(i);
                this.updateNavigator();
            }
        );
    }

    showQuestionTypeIndicator(question) {
        const indicator = document.getElementById('question-type-indicator');
        const typeText = document.getElementById('question-type-text');

        // Only show indicator for special question types (not STANDARD or MULTI)
        // MULTI already has the "Select all that apply" hint
        const specialTypes = {
            'DRAG_DROP_SELECT': { text: 'Select Items', icon: 'fas fa-hand-pointer', className: 'drag_drop_select' },
            'SEQUENCE': { text: 'Ordering', icon: 'fas fa-sort-amount-down', className: 'sequence' },
            'YES_NO_MATRIX': { text: 'Yes / No', icon: 'fas fa-th-list', className: 'yes_no_matrix' }
        };

        const type = specialTypes[window.ExamApp.normalizeQuestionType(question)];

        if (type) {
            typeText.replaceChildren();
            const icon = document.createElement('i');
            icon.setAttribute('aria-hidden', 'true');
            icon.className = type.icon;
            typeText.append(icon, document.createTextNode(` ${type.text}`));
            window.ExamApp.setElementHidden(indicator, false);
            indicator.className = `question-type-indicator ${type.className}`;
        } else {
            window.ExamApp.setElementHidden(indicator, true);
        }
    }

    displayQuestionImages(question) {
        const container = document.getElementById('question-images');
        container.innerHTML = '';

        // Show question images if available
        if (question.question_images && question.question_images.length > 0) {
            question.question_images.forEach((imageInfo, index) => {
                const imageWrapper = document.createElement('div');
                imageWrapper.className = 'question-image-wrapper';

                // Add loading placeholder
                const placeholder = document.createElement('div');
                placeholder.className = 'image-placeholder';
                placeholder.innerHTML = `
                    <div class="loading-spinner">
                        <i class="fas fa-spinner fa-spin"></i>
                        <small>Loading image...</small>
                    </div>
                `;

                imageWrapper.appendChild(placeholder);
                container.appendChild(imageWrapper);

                // Load image from IndexedDB or filesystem (non-blocking)
                (async () => {
                    try {
                        // Extract just the filename (last part of path)
                        // Handles: 'images/examid/file.jpg' -> 'file.jpg'
                        let filename = imageInfo.filename;
                        if (filename.includes('/')) {
                            filename = filename.split('/').pop();
                        } else if (filename.includes('\\')) {
                            filename = filename.split('\\').pop();
                        }
                        if (!window.ExamApp.isSafeImageFileName(filename)) {
                            throw new Error('Invalid image filename');
                        }

                        // Use imageLoader to get image from IndexedDB first, then filesystem
                        const imagePath = await window.imageLoader.loadImage(filename);

                        if (!imagePath) {
                            throw new Error('Image not found');
                        }

                        const img = document.createElement('img');
                        img.className = 'question-image';
                        img.src = imagePath;
                        img.alt = `Question ${this.currentQuestionIndex + 1} - Image ${index + 1}`;
                        img.loading = 'lazy';

                        // Remove placeholder when image loads
                        img.onload = () => {
                            placeholder.remove();
                        };

                        // Add error handling
                        img.onerror = () => {
                                        imageWrapper.innerHTML = `
                                            <div class="image-error">
                                                <i class="fas fa-image"></i>
                                                <small>Image not available: ${this.escapeHtml(filename)}</small>
                                            </div>
                                        `;
                        };

                        imageWrapper.appendChild(img);
                    } catch (error) {
                        window.ExamApp.warn(`Failed to load image: ${imageInfo.filename}`, error);
                        imageWrapper.innerHTML = `
                            <div class="image-error">
                                <i class="fas fa-exclamation-triangle"></i>
                                <small>Failed to load: ${this.escapeHtml(imageInfo.filename)}</small>
                            </div>
                        `;
                    }
                })();
            });
        }
    }

    displayExplanationImages(question) {
        const container = document.getElementById('explanation-images');
        if (container) {
            this.renderExplanationImagesForContainer(question, container);
        }
    }

    renderExplanationImagesForContainer(question, container) {
        if (!container) return;
        container.innerHTML = '';

        // Show explanation images if available
        if (question.explanation_images && question.explanation_images.length > 0) {
            const imagesTitle = document.createElement('h4');
            imagesTitle.textContent = 'Related Images:';
            imagesTitle.style.marginTop = '15px';
            container.appendChild(imagesTitle);

            question.explanation_images.forEach((imageInfo, index) => {
                const imageWrapper = document.createElement('div');
                imageWrapper.className = 'explanation-image-wrapper';

                // Add loading placeholder
                const placeholder = document.createElement('div');
                placeholder.className = 'image-placeholder';
                placeholder.innerHTML = `
                    <div class="loading-spinner">
                        <i class="fas fa-spinner fa-spin"></i>
                        <small>Loading image...</small>
                    </div>
                `;

                imageWrapper.appendChild(placeholder);
                container.appendChild(imageWrapper);

                // Load image from IndexedDB or filesystem (non-blocking)
                (async () => {
                    try {
                        // Extract just the filename (last part of path)
                        // Handles: 'images/examid/file.jpg' -> 'file.jpg'
                        let filename = imageInfo.filename;
                        if (filename.includes('/')) {
                            filename = filename.split('/').pop();
                        } else if (filename.includes('\\')) {
                            filename = filename.split('\\').pop();
                        }
                        if (!window.ExamApp.isSafeImageFileName(filename)) {
                            throw new Error('Invalid image filename');
                        }

                        // Use imageLoader to get image from IndexedDB first, then filesystem
                        const imagePath = await window.imageLoader.loadImage(filename);

                        if (!imagePath) {
                            throw new Error('Image not found');
                        }

                        const img = document.createElement('img');
                        img.className = 'explanation-image';
                        img.src = imagePath;
                        img.alt = `Explanation Image ${index + 1}`;
                        img.loading = 'lazy';

                        // Remove placeholder when image loads
                        img.onload = () => {
                            placeholder.remove();
                        };

                        img.onerror = () => {
                            imageWrapper.innerHTML = `
                                <div class="image-error">
                                    <i class="fas fa-image"></i>
                                    <small>Image not available: ${this.escapeHtml(filename)}</small>
                                </div>
                            `;
                        };

                        imageWrapper.appendChild(img);
                    } catch (error) {
                        window.ExamApp.warn(`Failed to load image: ${imageInfo.filename}`, error);
                        imageWrapper.innerHTML = `
                            <div class="image-error">
                                <i class="fas fa-exclamation-triangle"></i>
                                <small>Failed to load: ${this.escapeHtml(imageInfo.filename)}</small>
                            </div>
                        `;
                    }
                })();
            });
        }
    }

    formatQuestionText(text) {
        // Process Markdown images FIRST on raw text before escaping,
        // so that ![alt](images/file.jpg) syntax is not broken by escapeHtml.
        const imageTokens = [];
        let rawText = String(text ?? '');

        if (typeof processQuestionContent === 'function') {
            // Extract image markdown references and replace with placeholders
            const imageRegex = /!\[([^\]]*)\]\(images\/([^)]+)\)/g;
            rawText = rawText.replace(imageRegex, (match) => {
                const token = `__IMG_TOKEN_${imageTokens.length}__`;
                imageTokens.push(processQuestionContent(match));
                return token;
            });
        }

        // Escape any raw HTML from imported content to prevent injection.
        const safe = this.escapeHtml(rawText);

        // Handle line breaks and formatting
        let formattedText = safe
            .replace(/\\n/g, '<br>')
            .replace(/\n/g, '<br>')
            .replace(/✑/g, '•');

        // Only trusted documentation hosts become clickable. Imported packs can
        // contain arbitrary Markdown, so other URLs remain escaped literal text.
        formattedText = formattedText.replace(
            /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
            (match, label, url) => isOfficialDocumentationUrl(url)
                ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
                : match
        );

        // Restore image HTML from tokens
        imageTokens.forEach((html, i) => {
            formattedText = formattedText.replace(`__IMG_TOKEN_${i}__`, html);
        });

        return formattedText;
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Render a "Source" link to the question's reference, only when it points to an
    // allowlisted official documentation host (same trust gate as inline doc links).
    renderReferenceLink(question) {
        if (!question) return '';
        const raw = Array.isArray(question.references) && question.references.length
            ? question.references : [question.reference];
        const hrefs = [];
        const seen = new Set();
        for (const r of raw) {
            const ref = this.safeUrl(r);
            if (!ref || !isOfficialDocumentationUrl(ref) || seen.has(ref)) continue;
            seen.add(ref);
            hrefs.push(ref);
        }
        if (!hrefs.length) return '';
        if (hrefs.length === 1) {
            let host = 'documentation';
            try { host = new URL(hrefs[0]).hostname.replace(/^www\./, ''); } catch (_) {}
            const link = `<a href="${this.escapeHtml(hrefs[0])}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(host)}</a>`;
            return `<div class="explanation-source"><i class="fas fa-book" aria-hidden="true"></i> <strong>Source:</strong> ${link}</div>`;
        }
        const links = hrefs.map((h, i) => `<a href="${this.escapeHtml(h)}" target="_blank" rel="noopener noreferrer">${i + 1}</a>`).join(' &middot; ');
        return `<div class="explanation-source"><i class="fas fa-book" aria-hidden="true"></i> <strong>Sources:</strong> ${links}</div>`;
    }

    // Cross-sell a recommended paid pack on the results screen (e.g. CLF-C02 -> SAA-C03).
    renderRecommendedPro(metadata) {
        const rec = metadata && metadata.recommendedPro;
        const url = rec && this.safeUrl(rec.url);
        if (!url) return '';
        const title = this.escapeHtml(rec.title || 'Recommended pack');
        const blurb = this.escapeHtml(rec.blurb || '');
        return `<div class="recommended-pro"><i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i> <strong>${title}</strong><p>${blurb}</p><a class="recommended-pro-cta" href="${this.escapeHtml(url)}" target="_blank" rel="noopener noreferrer">View pack</a></div>`;
    }

    displayOptions(question) {
        const container = document.getElementById('options-container');
        container.innerHTML = '';

        const questionType = window.ExamApp.normalizeQuestionType(question);
        const isSequence = (questionType === 'SEQUENCE');
    const isYesNoMatrix = (questionType === 'YES_NO_MATRIX');
    const isDragSelect = (questionType === 'DRAG_DROP_SELECT');
    const isMulti = Array.isArray(question.correct) && !isSequence && !isYesNoMatrix && !isDragSelect;

        if (isSequence) {
            const hint = document.createElement('div');
            hint.className = 'multi-select-hint';
            hint.textContent = 'Arrange the steps in the correct order (drag or use arrows)';
            container.appendChild(hint);

            const sequenceList = document.createElement('div');
            sequenceList.className = 'sequence-single-list';
            sequenceList.id = 'sequence-list';
            container.appendChild(sequenceList);

            // Initialize with randomized order on first view
            if (!Array.isArray(this.selectedAnswers[this.currentQuestionIndex]) || this.selectedAnswers[this.currentQuestionIndex].length === 0) {
                const indices = question.options.map((_, idx) => idx);
                // Shuffle the indices
                for (let i = indices.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [indices[i], indices[j]] = [indices[j], indices[i]];
                }
                this.selectedAnswers[this.currentQuestionIndex] = indices;
            }

            const render = () => {
                const order = this.selectedAnswers[this.currentQuestionIndex] || [];
                sequenceList.innerHTML = '';

                order.forEach((optIndex, pos) => {
                    const item = document.createElement('div');
                    item.className = 'sequence-item';
                    item.draggable = true;
                    item.dataset.position = pos;

                    item.innerHTML = `
                        <span class="sequence-drag-handle"><i class="fas fa-grip-vertical"></i></span>
                        <span class="sequence-pos">${pos + 1}.</span>
                        <span class="sequence-text">${this.escapeHtml(question.options[optIndex])}</span>
                        <span class="sequence-actions">
                            <button type="button" class="seq-btn up" title="Move up"><i class="fas fa-chevron-up"></i></button>
                            <button type="button" class="seq-btn down" title="Move down"><i class="fas fa-chevron-down"></i></button>
                        </span>
                    `;

                    const up = item.querySelector('.up');
                    const down = item.querySelector('.down');
                    up.disabled = pos === 0;
                    down.disabled = pos === order.length - 1;

                    up.addEventListener('click', () => {
                        if (pos > 0) {
                            const arr = [...order];
                            [arr[pos - 1], arr[pos]] = [arr[pos], arr[pos - 1]];
                            this.selectedAnswers[this.currentQuestionIndex] = arr;
                            render();
                            this.handleAnswerChanged();
                        }
                    });

                    down.addEventListener('click', () => {
                        if (pos < order.length - 1) {
                            const arr = [...order];
                            [arr[pos], arr[pos + 1]] = [arr[pos + 1], arr[pos]];
                            this.selectedAnswers[this.currentQuestionIndex] = arr;
                            render();
                            this.handleAnswerChanged();
                        }
                    });

                    // Drag and drop functionality
                    item.addEventListener('dragstart', (e) => {
                        item.classList.add('dragging');
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', pos);
                    });

                    item.addEventListener('dragend', () => {
                        item.classList.remove('dragging');
                    });

                    item.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        const dragging = sequenceList.querySelector('.dragging');
                        if (dragging && dragging !== item) {
                            const rect = item.getBoundingClientRect();
                            const midpoint = rect.top + rect.height / 2;
                            if (e.clientY < midpoint) {
                                sequenceList.insertBefore(dragging, item);
                            } else {
                                sequenceList.insertBefore(dragging, item.nextSibling);
                            }
                        }
                    });

                    item.addEventListener('drop', (e) => {
                        e.preventDefault();
                        // Rebuild order array based on current DOM order
                        const newOrder = [];
                        sequenceList.querySelectorAll('.sequence-item').forEach((el) => {
                            const oldPos = parseInt(el.dataset.position);
                            newOrder.push(order[oldPos]);
                        });
                        this.selectedAnswers[this.currentQuestionIndex] = newOrder;
                        render();
                        this.handleAnswerChanged();
                    });

                    sequenceList.appendChild(item);
                });

                const items = sequenceList.querySelectorAll('.sequence-item');
                if (items[this.focusedSequencePos]) {
                    items[this.focusedSequencePos].classList.add('keyboard-focused');
                }
            };

            render();
            return;
        }

        if (isYesNoMatrix) {
            const hint = document.createElement('div');
            hint.className = 'multi-select-hint';
            hint.textContent = 'Select Yes or No for each statement';
            container.appendChild(hint);

            const table = document.createElement('div');
            table.className = 'yn-matrix';
            const statements = Array.isArray(question.statements) ? question.statements : [];

            // Show warning if no statements found
            if (statements.length === 0) {
                const warning = document.createElement('div');
                warning.style.cssText = 'background:#fff3cd;border:2px solid #ffc107;border-radius:12px;padding:20px;margin:10px 0;text-align:center;color:#856404;';
                warning.innerHTML = `
                    <i class="fas fa-exclamation-triangle" style="font-size:32px;margin-bottom:10px;"></i>
                    <h4 style="margin:10px 0;">Incomplete Question Data</h4>
                    <p style="margin:5px 0;">This YES/NO Matrix question has no statements defined.</p>
                    <p style="margin:5px 0;font-size:13px;">Question ID: ${question.id || 'N/A'}</p>
                `;
                container.appendChild(warning);
                return;
            }

            if (!Array.isArray(this.selectedAnswers[this.currentQuestionIndex])) {
                this.selectedAnswers[this.currentQuestionIndex] = new Array(statements.length).fill(undefined);
            }
            const renderRow = (idx, text) => {
                const row = document.createElement('div');
                row.className = 'yn-row';
                const label = document.createElement('div');
                label.className = 'yn-label';
                label.textContent = text;
                const controls = document.createElement('div');
                controls.className = 'yn-controls';
                const yes = document.createElement('button');
                yes.type = 'button';
                yes.className = 'yn-btn yes';
                yes.textContent = 'Yes';
                const no = document.createElement('button');
                no.type = 'button';
                no.className = 'yn-btn no';
                no.textContent = 'No';
                const sync = () => {
                    const sel = this.selectedAnswers[this.currentQuestionIndex] || [];
                    yes.classList.toggle('selected', sel[idx] === 0);
                    no.classList.toggle('selected', sel[idx] === 1);
                };
                yes.addEventListener('click', () => {
                    const sel = this.selectedAnswers[this.currentQuestionIndex] || [];
                    sel[idx] = 0; // Yes maps to option index 0
                    this.selectedAnswers[this.currentQuestionIndex] = sel;
                    sync();
                    this.handleAnswerChanged();
                });
                no.addEventListener('click', () => {
                    const sel = this.selectedAnswers[this.currentQuestionIndex] || [];
                    sel[idx] = 1; // No maps to option index 1
                    this.selectedAnswers[this.currentQuestionIndex] = sel;
                    sync();
                    this.handleAnswerChanged();
                });
                controls.appendChild(yes);
                controls.appendChild(no);
                row.appendChild(label);
                row.appendChild(controls);
                sync();
                return row;
            };
            statements.forEach((s, i) => table.appendChild(renderRow(i, s)));
            container.appendChild(table);

            const rows = table.querySelectorAll('.yn-row');
            if (rows[this.focusedMatrixRow]) {
                rows[this.focusedMatrixRow].classList.add('keyboard-focused');
            }
            return;
        }

        if (isDragSelect) {
            const required = question.drag_select_required || (Array.isArray(question.correct) ? question.correct.length : 0);
            const hint = document.createElement('div');
            hint.className = 'multi-select-hint';
            hint.textContent = `Select ${required} correct option(s)`;
            container.appendChild(hint);

            const wrap = document.createElement('div');
            wrap.className = 'ddselect-wrap';
            const source = document.createElement('div');
            source.className = 'ddselect-source';
            source.setAttribute('role', 'group');
            source.setAttribute('aria-label', 'Available options');
            const target = document.createElement('div');
            target.className = 'ddselect-target';
            target.setAttribute('role', 'group');
            target.setAttribute('aria-label', 'Selected options');
            const targetTitle = document.createElement('div');
            targetTitle.className = 'ddselect-title';
            targetTitle.textContent = 'Your selections';
            target.appendChild(targetTitle);

            if (!Array.isArray(this.selectedAnswers[this.currentQuestionIndex])) {
                this.selectedAnswers[this.currentQuestionIndex] = [];
            }
            const sel = this.selectedAnswers[this.currentQuestionIndex];

            const render = () => {
                source.innerHTML = '';
                // Remove existing chips except the title
                Array.from(target.querySelectorAll('.ddselect-chip')).forEach(e => e.remove());
                question.options.forEach((opt, idx) => {
                    const inSel = sel.includes(idx);
                    if (!inSel) {
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'ddselect-btn';
                        btn.dataset.optionIndex = idx;
                        const optionLetter = String.fromCharCode(65 + idx);
                        btn.setAttribute('aria-label', `Select option ${optionLetter}: ${opt}`);
                        const letter = document.createElement('span');
                        letter.className = 'option-letter';
                        letter.textContent = optionLetter;
                        const text = document.createElement('span');
                        text.className = 'option-text';
                        text.textContent = opt;
                        btn.replaceChildren(letter, text);
                        btn.addEventListener('click', () => {
                            if (sel.length < required && !sel.includes(idx)) {
                                sel.push(idx);
                                this.selectedAnswers[this.currentQuestionIndex] = sel;
                                render();
                                this.handleAnswerChanged();
                            }
                        });
                        source.appendChild(btn);
                    }
                });
                sel.forEach((idx, pos) => {
                    const chip = document.createElement('div');
                    chip.className = 'ddselect-chip';
                    const chipIndex = document.createElement('span');
                    chipIndex.className = 'chip-index';
                    chipIndex.textContent = `${pos + 1}.`;
                    const chipText = document.createElement('span');
                    chipText.className = 'chip-text';
                    chipText.textContent = question.options[idx];
                    const rm = document.createElement('button');
                    rm.type = 'button';
                    rm.className = 'chip-remove';
                    rm.dataset.optionIndex = idx;
                    rm.setAttribute('aria-label', `Remove selection ${pos + 1}: ${question.options[idx]}`);
                    const icon = document.createElement('i');
                    icon.className = 'fas fa-times';
                    icon.setAttribute('aria-hidden', 'true');
                    rm.appendChild(icon);
                    rm.addEventListener('click', () => {
                        const i = sel.indexOf(idx);
                        if (i >= 0) sel.splice(i, 1);
                        this.selectedAnswers[this.currentQuestionIndex] = sel;
                        render();
                        this.handleAnswerChanged();
                    });
                    chip.appendChild(chipIndex);
                    chip.appendChild(chipText);
                    chip.appendChild(rm);
                    target.appendChild(chip);
                });
            };
            render();

            wrap.appendChild(source);
            wrap.appendChild(target);
            container.appendChild(wrap);
            return;
        }
        if (isMulti) {
            const hint = document.createElement('div');
            hint.className = 'multi-select-hint';
            hint.textContent = 'Select all that apply';
            container.appendChild(hint);
        }

        question.options.forEach((option, index) => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option';

            const input = document.createElement('input');
            input.type = isMulti ? 'checkbox' : 'radio';
            input.name = 'answer';
            input.id = `option-${index}`;
            input.value = index;

            const saved = this.selectedAnswers[this.currentQuestionIndex];
            if (isMulti && Array.isArray(saved)) {
                input.checked = saved.includes(index);
            } else if (!isMulti) {
                input.checked = saved === index;
            }

            input.addEventListener('change', (e) => {
                if (isMulti) {
                    const arr = Array.isArray(this.selectedAnswers[this.currentQuestionIndex]) ? [...this.selectedAnswers[this.currentQuestionIndex]] : [];
                    if (e.target.checked) {
                        if (!arr.includes(index)) arr.push(index);
                    } else {
                        const pos = arr.indexOf(index);
                        if (pos !== -1) arr.splice(pos, 1);
                    }
                    this.selectedAnswers[this.currentQuestionIndex] = arr;
                } else {
                    if (e.target.checked) this.selectedAnswers[this.currentQuestionIndex] = index;
                }
                this.updateOptionStyles();
                this.handleAnswerChanged();
            });

            const label = document.createElement('label');
            label.htmlFor = `option-${index}`;
            label.innerHTML = `<span class="option-letter">${String.fromCharCode(65 + index)}</span><span class="option-text">${this.escapeHtml(option)}</span>`;

            optionDiv.appendChild(input);
            optionDiv.appendChild(label);
            container.appendChild(optionDiv);
        });
    }

    updateOptionStyles() {
        // Add visual feedback for selected options
        document.querySelectorAll('.option').forEach(option => {
            const input = option.querySelector('input');
            option.classList.toggle('selected', input.checked);
        });
    }

    showAnswer() {
        const question = this.getCurrentQuestions()[this.currentQuestionIndex];
        const userAnswer = this.selectedAnswers[this.currentQuestionIndex];
        const correctAnswer = question.correct;
        const questionType = window.ExamApp.normalizeQuestionType(question);
        const isSequence = (questionType === 'SEQUENCE');
        const isYesNoMatrix = (questionType === 'YES_NO_MATRIX');
        const isDragSelect = (questionType === 'DRAG_DROP_SELECT');
        const isMulti = Array.isArray(correctAnswer) && !isSequence && !isYesNoMatrix && !isDragSelect;

        const isCorrect = this.isAnswerCorrect(question, userAnswer);

        // Show feedback
        const feedback = document.getElementById('answer-feedback');
        const status = feedback.querySelector('.feedback-status');
        const correctAnswerDiv = feedback.querySelector('.correct-answer');
        const explanationDiv = feedback.querySelector('.explanation');

        status.innerHTML = isCorrect
            ? '<i class="fas fa-check-circle" style="color: #28a745;"></i> Correct!'
            : '<i class="fas fa-times-circle" style="color: #dc3545;"></i> Incorrect';

        if (isSequence) {
            const letters = (correctAnswer || []).map(i => `${String.fromCharCode(65 + i)}. ${this.escapeHtml(question.options[i])}`);
            correctAnswerDiv.innerHTML = `<strong>Correct Order:</strong> ${letters.join(' → ')}`;
        } else if (isYesNoMatrix) {
            const statements = Array.isArray(question.statements) ? question.statements : [];
            const yn = (v) => v === 0 ? 'Yes' : 'No';
            const rows = statements.map((s, i) => `<div class="yn-solution-row"><span class="yn-solution-label">${this.escapeHtml(s)}</span><span class="yn-solution-value">${yn(correctAnswer[i])}</span></div>`);
            correctAnswerDiv.innerHTML = `<strong>Correct Responses:</strong><div class="yn-solution">${rows.join('')}</div>`;
        } else if (isDragSelect || Array.isArray(correctAnswer)) {
            const letters = correctAnswer.map(i => `${String.fromCharCode(65 + i)}. ${this.escapeHtml(question.options[i])}`);
            correctAnswerDiv.innerHTML = `<strong>Correct Selection(s):</strong> ${letters.join(' | ')}`;
        } else {
            correctAnswerDiv.innerHTML = `<strong>Correct Answer:</strong> ${String.fromCharCode(65 + correctAnswer)}. ${this.escapeHtml(question.options[correctAnswer])}`;
        }

        const referenceHtml = this.renderReferenceLink(question);
        if (question.explanation) {
            explanationDiv.innerHTML = `<strong>Explanation:</strong><br>${this.formatQuestionText(question.explanation)}${referenceHtml}`;
        } else {
            explanationDiv.innerHTML = referenceHtml;
        }

        // Display explanation images
        this.displayExplanationImages(question);

        feedback.setAttribute('role', 'status');
        feedback.setAttribute('aria-live', 'polite');
        window.ExamApp.setElementHidden(feedback, false);

        // Update option styles to show correct/incorrect (skip for sequence type)
        if (!isSequence && !isYesNoMatrix && !isDragSelect) {
            document.querySelectorAll('.option').forEach((option, index) => {
                const input = option.querySelector('input');
                option.classList.remove('correct', 'incorrect', 'user-selected', 'correct-answer', 'incorrect-answer');
                const isUserSelected = isMulti
                    ? Array.isArray(userAnswer) && userAnswer.includes(index)
                    : index === userAnswer;

                if (input) input.checked = isUserSelected;
                option.classList.toggle('selected', isUserSelected);
                option.classList.toggle('user-selected', isUserSelected);

                if (isMulti) {
                    if (correctAnswer.includes(index)) option.classList.add('correct');
                    if (Array.isArray(userAnswer) && userAnswer.includes(index) && !correctAnswer.includes(index)) {
                        option.classList.add('incorrect', 'user-selected', 'incorrect-answer');
                    }
                    if (Array.isArray(userAnswer) && userAnswer.includes(index) && correctAnswer.includes(index)) {
                        option.classList.add('correct-answer');
                    }
                } else {
                    if (index === correctAnswer) option.classList.add('correct');
                    if (index === userAnswer && userAnswer !== correctAnswer) {
                        option.classList.add('incorrect', 'user-selected', 'incorrect-answer');
                    }
                    if (index === userAnswer && userAnswer === correctAnswer) {
                        option.classList.add('correct-answer');
                    }
                }
            });
        }

        this.recordStudyAnswer(question, isCorrect, userAnswer);
    }

    handleAnswerChanged() {
        this.updateNavigator();
        const feedback = document.getElementById('answer-feedback');
        if (this.isStudyMode() && feedback && !feedback.hidden) {
            this.closeFeedback();
        }
    }

    closeFeedback() {
        window.ExamApp.setElementHidden(document.getElementById('answer-feedback'), true);
        // Reset option styles for standard choices only
        document.querySelectorAll('.option').forEach(option => {
            option.classList.remove('correct', 'incorrect', 'user-selected', 'correct-answer', 'incorrect-answer');
            const input = option.querySelector('input');
            if (input) option.classList.toggle('selected', input.checked);
        });
    }

    nextQuestion() {
        const questions = this.getCurrentQuestions();
        if (this.currentQuestionIndex < questions.length - 1) {
            this.showQuestion(this.currentQuestionIndex + 1);
        }
    }

    previousQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.showQuestion(this.currentQuestionIndex - 1);
        }
    }

    toggleMarkForReview() {
        if (this.isStudyMode()) return;
        const index = this.currentQuestionIndex;
        if (this.markedForReview.has(index)) {
            this.markedForReview.delete(index);
        } else {
            this.markedForReview.add(index);
        }

        const markReviewButton = document.getElementById('mark-review-btn');
        if (markReviewButton) {
            markReviewButton.classList.toggle('marked', this.markedForReview.has(index));
        }
    }


    getStudyAnswerKey(question, index = this.currentQuestionIndex) {
        const scheduler = window.ExamApp.studyScheduler;
        const questionId = scheduler?.getQuestionId(question, index) || String(question?.id || index + 1);
        return { questionId, answerKey: `${index}:${questionId}` };
    }

    async saveStudyResult(question, index, isCorrect, userAnswer, options = {}) {
        if (!this.isStudyMode()) return;
        const { questionId, answerKey } = this.getStudyAnswerKey(question, index);

        const wasAnswered = this.isAnswerProvided(userAnswer);
        this.studySessionResults.set(answerKey, { questionId, isCorrect, wasAnswered });

        try {
            await window.ExamApp.studyStorage?.recordQuestionResult(this.currentExam, questionId, isCorrect, {
                sessionId: this.studySessionId
            });
        } catch (error) {
            window.ExamApp.warn('Failed to record study answer', error);
        }

        if (options.trackEvent !== false) {
            window.ExamApp?.analytics?.trackStudyQuestionAnswered(this.currentExam, {
                isCorrect,
                wasAnswered
            });
        }
    }

    async recordStudyAnswer(question, isCorrect, userAnswer) {
        await this.saveStudyResult(question, this.currentQuestionIndex, isCorrect, userAnswer);
    }

    getStudyFinalSummary(questions) {
        const summary = { reviewedCount: 0, correctCount: 0, incorrectCount: 0, skippedCount: 0 };
        questions.forEach((question, index) => {
            const userAnswer = this.selectedAnswers[index];
            if (!this.isAnswerProvided(userAnswer)) {
                summary.skippedCount++;
                return;
            }

            summary.reviewedCount++;
            if (this.isAnswerCorrect(question, userAnswer)) {
                summary.correctCount++;
            } else {
                summary.incorrectCount++;
            }
        });
        return summary;
    }

    async persistFinalStudyAnswers(questions) {
        const saves = [];
        questions.forEach((question, index) => {
            const userAnswer = this.selectedAnswers[index];
            if (!this.isAnswerProvided(userAnswer)) return;

            const isCorrect = this.isAnswerCorrect(question, userAnswer);
            const { answerKey } = this.getStudyAnswerKey(question, index);
            const previous = this.studySessionResults.get(answerKey);
            if (previous && previous.isCorrect === isCorrect && previous.wasAnswered === true) return;

            saves.push(this.saveStudyResult(question, index, isCorrect, userAnswer, { trackEvent: false }));
        });
        await Promise.all(saves);
    }

    reviewMarkedQuestions() {
        if (!this.markedForReview || this.markedForReview.size === 0) {
            alert('No questions marked for review.');
            return;
        }
        const firstMarked = Math.min(...this.markedForReview);
        this.currentQuestionIndex = firstMarked;
        this.showQuestion(firstMarked);
    }

    startTimer() {
        this.timerManager.stop();

        const durationMinutes = Number(this.examData?.[this.currentExam]?.duration);
        const safeMinutes = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 45;
        const duration = safeMinutes * 60; // Convert to seconds

        // Render immediately (avoids showing stale placeholder like 45:00)
        const renderTime = (remaining) => {
            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;
            const el = document.getElementById('timer');
            if (el) {
                el.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        };
        renderTime(duration);

        this.timerManager.start(
            duration,
            (remaining) => {
                renderTime(remaining);
                // Timer warning states
                const timerEl = document.getElementById('timer');
                if (timerEl) {
                    if (remaining <= 300) { // 5 minutes
                        timerEl.classList.add('timer-danger');
                        timerEl.classList.remove('timer-warning');
                    } else if (remaining <= 600) { // 10 minutes
                        timerEl.classList.add('timer-warning');
                        timerEl.classList.remove('timer-danger');
                    }
                }
            },
            () => {
                this.finishExam(true);
            }
        );
    }

        isAnswerProvided(answer) {
            return isExamAnswerProvided(answer);
        }

        getUnansweredQuestionIndexes(questions) {
            const unanswered = [];
            questions.forEach((_, index) => {
                if (!this.isAnswerProvided(this.selectedAnswers[index])) {
                    unanswered.push(index);
                }
            });
            return unanswered;
        }

        showFinishExamConfirmation(unansweredIndexes, totalQuestions) {
            const existing = document.getElementById('finish-exam-confirm-modal');
            if (existing) existing.remove();

            const unansweredCount = unansweredIndexes.length;
            const answeredCount = Math.max(0, totalQuestions - unansweredCount);
            const hasUnanswered = unansweredCount > 0;

            const overlay = document.createElement('div');
            overlay.id = 'finish-exam-confirm-modal';
            overlay.className = 'exam-confirm-overlay';

            const dialog = document.createElement('div');
            dialog.className = 'exam-confirm-dialog';
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.setAttribute('aria-labelledby', 'finish-confirm-title');
            dialog.setAttribute('aria-describedby', 'finish-confirm-message');

            const iconWrap = document.createElement('div');
            iconWrap.className = `exam-confirm-icon ${hasUnanswered ? 'warning' : 'ready'}`;
            const icon = document.createElement('i');
            icon.className = hasUnanswered ? 'fas fa-exclamation-triangle' : 'fas fa-check-circle';
            icon.setAttribute('aria-hidden', 'true');
            iconWrap.appendChild(icon);

            const title = document.createElement('h2');
            title.id = 'finish-confirm-title';
            title.textContent = hasUnanswered ? 'Finish with unanswered questions?' : 'Finish exam?';

            const message = document.createElement('p');
            message.id = 'finish-confirm-message';
            message.textContent = hasUnanswered
                ? `You still have ${unansweredCount} unanswered question${unansweredCount === 1 ? '' : 's'}. Review them before submitting, or finish now to see your report.`
                : 'Submit your answers and open the final report.';

            const summary = document.createElement('div');
            summary.className = 'exam-confirm-summary';

            const addMetric = (labelText, valueText, extraClass = '') => {
                const metric = document.createElement('div');
                metric.className = `exam-confirm-metric ${extraClass}`.trim();
                const label = document.createElement('span');
                label.textContent = labelText;
                const value = document.createElement('strong');
                value.textContent = valueText;
                metric.appendChild(label);
                metric.appendChild(value);
                summary.appendChild(metric);
            };

            addMetric('Answered', `${answeredCount}/${totalQuestions}`);
            addMetric('Unanswered', String(unansweredCount), hasUnanswered ? 'is-warning' : '');

            const actions = document.createElement('div');
            actions.className = 'exam-confirm-actions';

            const createButton = (className, iconClass, labelText) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = className;
                const buttonIcon = document.createElement('i');
                buttonIcon.className = iconClass;
                buttonIcon.setAttribute('aria-hidden', 'true');
                const label = document.createElement('span');
                label.textContent = labelText;
                button.appendChild(buttonIcon);
                button.appendChild(label);
                return button;
            };

            const reviewButton = createButton(
                'exam-confirm-btn secondary',
                hasUnanswered ? 'fas fa-list' : 'fas fa-arrow-left',
                hasUnanswered ? 'Review unanswered' : 'Keep working'
            );
            const finishButton = createButton('exam-confirm-btn primary', 'fas fa-check', 'Finish Exam');

            const appShell = document.querySelector('.container');
            const hadAriaHidden = appShell?.hasAttribute('aria-hidden') || false;
            const previousAriaHidden = appShell?.getAttribute('aria-hidden');
            const supportsInert = Boolean(appShell && 'inert' in appShell);
            const previousInert = supportsInert ? appShell.inert : false;

            if (appShell) {
                appShell.setAttribute('aria-hidden', 'true');
                if (supportsInert) appShell.inert = true;
            }

            const getFocusableElements = () => Array.from(dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
                .filter(element => !element.disabled && element.getAttribute('aria-hidden') !== 'true');

            const close = (returnFocus = true) => {
                document.removeEventListener('keydown', handleKeydown);
                if (appShell) {
                    if (hadAriaHidden) {
                        appShell.setAttribute('aria-hidden', previousAriaHidden);
                    } else {
                        appShell.removeAttribute('aria-hidden');
                    }
                    if (supportsInert) appShell.inert = previousInert;
                }
                overlay.remove();
                if (returnFocus) document.getElementById('finish-exam')?.focus();
            };

            const handleKeydown = (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    close();
                    return;
                }

                if (event.key === 'Tab') {
                    const focusableElements = getFocusableElements();
                    if (focusableElements.length === 0) {
                        event.preventDefault();
                        return;
                    }

                    const firstElement = focusableElements[0];
                    const lastElement = focusableElements[focusableElements.length - 1];

                    if (event.shiftKey && (document.activeElement === firstElement || !dialog.contains(document.activeElement))) {
                        event.preventDefault();
                        lastElement.focus();
                    } else if (!event.shiftKey && document.activeElement === lastElement) {
                        event.preventDefault();
                        firstElement.focus();
                    }
                }
            };

            reviewButton.addEventListener('click', () => {
                const firstUnanswered = unansweredIndexes[0];
                close(false);
                if (Number.isInteger(firstUnanswered)) {
                    this.showQuestion(firstUnanswered);
                } else {
                    document.getElementById('finish-exam')?.focus();
                }
            });

            finishButton.addEventListener('click', () => {
                close(false);
                this.finishExam(true);
            });

            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) close();
            });

            actions.appendChild(reviewButton);
            actions.appendChild(finishButton);
            dialog.appendChild(iconWrap);
            dialog.appendChild(title);
            dialog.appendChild(message);
            dialog.appendChild(summary);
            dialog.appendChild(actions);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            document.addEventListener('keydown', handleKeydown);

            (hasUnanswered ? reviewButton : finishButton).focus();
        }

    finishExam(forceFinish = false) {
        if (this.isStudyMode()) {
            this.finishStudySession();
            return;
        }

        if (!forceFinish) {
            const questions = this.getCurrentQuestions();
            this.showFinishExamConfirmation(this.getUnansweredQuestionIndexes(questions), questions.length);
            return;
        }

        // Remove keyboard shortcuts listener
        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }

        this.timerManager.stop();

        // Calculate results
        const questions = this.getCurrentQuestions();
        let correct = 0;
        let incorrect = 0;

        questions.forEach((question, index) => {
            const ua = this.selectedAnswers[index];
            const wasAnswered = this.isAnswerProvided(ua);
            if (this.isAnswerCorrect(question, ua)) {
                correct++;
            } else if (wasAnswered) {
                incorrect++;
            }
        });

        const score = Math.round((correct / questions.length) * 100);
        const passed = score >= this.examData[this.currentExam].passScore;

        // Calculate time spent
        const timeSpent = Math.round((new Date() - this.startTime) / 1000 / 60);

        // Update results screen
        this.showResults(score, passed, correct, incorrect, questions.length, timeSpent);
        this.showScreen('results-screen');
    }

    setResultsCopy(mode) {
        const scoreLabel = document.querySelector('.score-label');
        const metaLabels = document.querySelectorAll('.summary-meta .meta-label');
        const insightTitle = document.querySelector('.insights-header h3');
        const insightDescription = document.querySelector('.insights-header p');
        const hint = document.querySelector('.insight-hint span');

        if (mode === 'study') {
            if (scoreLabel) scoreLabel.textContent = 'Study Accuracy';
            if (metaLabels[0]) metaLabels[0].textContent = 'Questions reviewed';
            if (metaLabels[1]) metaLabels[1].textContent = 'Due at start';
            if (insightTitle) {
                insightTitle.replaceChildren();
                const icon = document.createElement('i');
                icon.setAttribute('aria-hidden', 'true');
                icon.className = 'fas fa-brain';
                insightTitle.append(icon, document.createTextNode(' Study Insights'));
            }
            if (insightDescription) insightDescription.textContent = 'Review how this study session went before returning to the queue.';
            if (hint) hint.textContent = 'Weak and due questions move earlier in future study sessions.';
            return;
        }

        if (scoreLabel) scoreLabel.textContent = 'Final Score';
        if (metaLabels[0]) metaLabels[0].textContent = 'Questions answered';
        if (metaLabels[1]) metaLabels[1].textContent = 'Passing threshold';
        if (insightTitle) {
            insightTitle.replaceChildren();
            const icon = document.createElement('i');
            icon.setAttribute('aria-hidden', 'true');
            icon.className = 'fas fa-chart-line';
            insightTitle.append(icon, document.createTextNode(' Performance Insights'));
        }
        if (insightDescription) insightDescription.textContent = 'See how this session compares to the target score.';
        if (hint) hint.textContent = 'Use Retake Exam to immediately replay with updated question order.';
    }

    async finishStudySession() {
        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }

        this.timerManager.stop();
        const questions = this.getCurrentQuestions();
        const stats = this.getStudyFinalSummary(questions);
        await this.persistFinalStudyAnswers(questions);

        const reviewedCount = Number(stats.reviewedCount || 0);
        const correctCount = Number(stats.correctCount || 0);
        const incorrectCount = Number(stats.incorrectCount || 0);
        const accuracy = reviewedCount > 0 ? Math.round((correctCount / reviewedCount) * 100) : 0;
        const timeSpent = Math.round((new Date() - this.startTime) / 1000 / 60);

        this.showStudyResults(accuracy, correctCount, incorrectCount, reviewedCount, questions.length, timeSpent);
        this.showScreen('results-screen');

        window.ExamApp?.analytics?.trackStudyCompleted(this.currentExam, {
            questionCount: questions.length,
            answeredCount: reviewedCount,
            correctCount,
            timeSpent
        });
    }

    showStudyResults(accuracy, correct, incorrect, reviewed, total, timeSpent) {
        this.setResultsCopy('study');

        const statusIcon = document.getElementById('result-status-icon');
        const statusText = document.getElementById('result-status');
        if (statusIcon) {
            statusIcon.innerHTML = '<i class="fas fa-check-circle" aria-hidden="true"></i>';
            statusIcon.className = 'status-icon studied';
        }
        if (statusText) {
            statusText.textContent = 'STUDY DONE';
            statusText.className = 'result-status result-status-chip studied';
        }

        const summaryCard = document.getElementById('resultsSummaryCard');
        if (summaryCard) {
            summaryCard.classList.remove('passed', 'failed');
            summaryCard.classList.add('studied');
        }

        document.getElementById('percentage-score').textContent = `${accuracy}%`;
        document.getElementById('correct-count').textContent = correct;
        document.getElementById('incorrect-count').textContent = incorrect;
        document.getElementById('time-spent').textContent = `${timeSpent}min`;
        const timeSecondary = document.getElementById('time-spent-secondary');
        if (timeSecondary) timeSecondary.textContent = `${timeSpent}min`;

        const examNameEl = document.getElementById('exam-name-result');
        if (examNameEl) {
            examNameEl.textContent = this.examData[this.currentExam].name;
            examNameEl.className = `exam-name-pill exam-name-badge ${this.currentExam}`;
        }

        const reviewedBase = Math.max(1, reviewed);
        const correctPercentage = (correct / reviewedBase) * 100;
        const incorrectPercentage = (incorrect / reviewedBase) * 100;
        document.getElementById('correct-progress').style.width = `${correctPercentage}%`;
        document.getElementById('incorrect-progress').style.width = `${incorrectPercentage}%`;

        const accuracyText = document.getElementById('accuracy-percentage');
        if (accuracyText) accuracyText.textContent = `${accuracy}%`;
        const missedText = document.getElementById('missed-percentage');
        if (missedText) missedText.textContent = reviewed > 0 ? `${Math.round(incorrectPercentage)}%` : '0%';

        const totalQuestionsEl = document.getElementById('total-questions-result');
        if (totalQuestionsEl) totalQuestionsEl.textContent = `${reviewed}/${total}`;
        const passTargetEl = document.getElementById('pass-score-target');
        if (passTargetEl) passTargetEl.textContent = `${this.studyQueueSummary?.dueCount ?? 0}`;
        const scoreVsPass = document.getElementById('score-vs-pass');
        if (scoreVsPass) scoreVsPass.textContent = `${accuracy}% accuracy`;

        const scoreRing = document.getElementById('scoreRing');
        if (scoreRing) {
            const clampedScore = Math.max(0, Math.min(100, accuracy));
            scoreRing.style.setProperty('--score-deg', `${clampedScore * 3.6}deg`);
        }

        this.generateDetailedReview();
    }

    showResults(score, passed, correct, incorrect, total, timeSpent) {
        this.setResultsCopy('exam');

        // Update result status
        const statusIcon = document.getElementById('result-status-icon');
        const statusText = document.getElementById('result-status');

        if (passed) {
            statusIcon.innerHTML = '<i class="fas fa-check-circle" aria-hidden="true"></i>';
            statusIcon.className = 'status-icon passed';
            statusText.textContent = 'PASSED';
            statusText.className = 'result-status result-status-chip passed';
        } else {
            statusIcon.innerHTML = '<i class="fas fa-exclamation" aria-hidden="true"></i>';
            statusIcon.className = 'status-icon failed';
            statusText.textContent = 'FAILED';
            statusText.className = 'result-status result-status-chip failed';
        }
        const summaryCard = document.getElementById('resultsSummaryCard');
        if (summaryCard) {
            summaryCard.classList.remove('studied');
            summaryCard.classList.toggle('passed', passed);
            summaryCard.classList.toggle('failed', !passed);
        }

        // Update scores
        document.getElementById('percentage-score').textContent = `${score}%`;
        document.getElementById('correct-count').textContent = correct;
        document.getElementById('incorrect-count').textContent = incorrect;
        document.getElementById('time-spent').textContent = `${timeSpent}min`;
        const timeSecondary = document.getElementById('time-spent-secondary');
        if (timeSecondary) timeSecondary.textContent = `${timeSpent}min`;

        // Update exam name in results
        const examNameEl = document.getElementById('exam-name-result');
        if (examNameEl) {
            examNameEl.textContent = this.examData[this.currentExam].name;
            examNameEl.className = `exam-name-pill exam-name-badge ${this.currentExam}`;
        }

        // Update progress bars
        const correctPercentage = (correct / total) * 100;
        const incorrectPercentage = (incorrect / total) * 100;

        document.getElementById('correct-progress').style.width = `${correctPercentage}%`;
        document.getElementById('incorrect-progress').style.width = `${incorrectPercentage}%`;

        const accuracyText = document.getElementById('accuracy-percentage');
        if (accuracyText) accuracyText.textContent = `${Math.round(correctPercentage)}%`;
        const missedText = document.getElementById('missed-percentage');
        if (missedText) missedText.textContent = `${Math.round(incorrectPercentage)}%`;

        const totalQuestionsEl = document.getElementById('total-questions-result');
        if (totalQuestionsEl) totalQuestionsEl.textContent = total;
        const passTargetEl = document.getElementById('pass-score-target');
        if (passTargetEl) passTargetEl.textContent = `${this.examData[this.currentExam].passScore}%`;
        const scoreVsPass = document.getElementById('score-vs-pass');
        if (scoreVsPass) scoreVsPass.textContent = `${score}% / ${this.examData[this.currentExam].passScore}%`;

        const scoreRing = document.getElementById('scoreRing');
        if (scoreRing) {
            const clampedScore = Math.max(0, Math.min(100, score));
            scoreRing.style.setProperty('--score-deg', `${clampedScore * 3.6}deg`);
        }

        // Generate detailed review
        this.generateDetailedReview();

        // Recommended next pack (cross-sell), shown only when metadata provides one
        const recSlot = document.getElementById('results-recommended-pro');
        if (recSlot) {
            recSlot.innerHTML = this.renderRecommendedPro(this.examData[this.currentExam]);
            const cta = recSlot.querySelector('.recommended-pro-cta');
            if (cta) cta.addEventListener('click', () => {
                window.ExamApp?.analytics?.trackProUnlockClicked?.(this.currentExam);
            });
        }

        // Save progress
        this.saveProgress(score, passed, timeSpent);

        window.ExamApp?.analytics?.trackExamCompleted(this.currentExam, {
            score,
            passed,
            timeSpent,
            questionCount: total
        });
    }

    generateDetailedReview(page = 0) {
        const questions = this.getCurrentQuestions();
        const container = document.getElementById('detailed-review');
        if (!container) return;

        const perPage = 10;
        const start = page * perPage;
        const end = Math.min(start + perPage, questions.length);
        const totalPages = Math.ceil(questions.length / perPage);
        this.reviewPage = page;

        let html = '<h3 class="section-title"><i class="fas fa-list-check"></i> Detailed Review</h3><div class="review-list">';

        for (let index = start; index < end; index++) {
            const question = questions[index];
            const userAnswer = this.selectedAnswers[index];
            const correctAnswer = question.correct;
            const questionType = window.ExamApp.normalizeQuestionType(question);
            const isSequence = (questionType === 'SEQUENCE');
            const isYesNoMatrix = (questionType === 'YES_NO_MATRIX');

            const isCorrect = this.isAnswerCorrect(question, userAnswer);
            const wasAnswered = this.isAnswerProvided(userAnswer);
            const statusClass = !wasAnswered ? 'skipped' : (isCorrect ? 'correct' : 'incorrect');
            const statusIcon = !wasAnswered ? 'fa-minus-circle' : (isCorrect ? 'fa-check-circle' : 'fa-times-circle');
            const statusText = !wasAnswered ? 'Skipped' : (isCorrect ? 'Correct' : 'Incorrect');

            // Format user answer
            let userAnswerText = 'Not answered';
            if (wasAnswered) {
                if (isSequence) {
                    userAnswerText = (Array.isArray(userAnswer) ? userAnswer : []).map(i => String.fromCharCode(65 + i)).join(' → ');
                } else if (isYesNoMatrix) {
                    const yn = (v) => v === 0 ? 'Yes' : 'No';
                    userAnswerText = (Array.isArray(userAnswer) ? userAnswer : []).map(yn).join(', ');
                } else if (Array.isArray(userAnswer)) {
                    userAnswerText = userAnswer.map(i => String.fromCharCode(65 + i)).join(', ');
                } else {
                    userAnswerText = String.fromCharCode(65 + userAnswer);
                }
            }

            // Format correct answer
            let correctAnswerText;
            if (isSequence) {
                correctAnswerText = (Array.isArray(correctAnswer) ? correctAnswer : []).map(i => String.fromCharCode(65 + i)).join(' → ');
            } else if (isYesNoMatrix) {
                const yn = (v) => v === 0 ? 'Yes' : 'No';
                correctAnswerText = (Array.isArray(correctAnswer) ? correctAnswer : []).map(yn).join(', ');
            } else if (Array.isArray(correctAnswer)) {
                correctAnswerText = correctAnswer.map(i => String.fromCharCode(65 + i)).join(', ');
            } else {
                correctAnswerText = String.fromCharCode(65 + correctAnswer);
            }

            html += `
                <div class="review-item ${statusClass}">
                    <div class="review-header">
                        <span class="review-number">Q${index + 1}</span>
                        <span class="review-status ${statusClass}">
                            <i class="fas ${statusIcon}"></i> ${statusText}
                        </span>
                    </div>
                    <div class="review-question">${this.formatQuestionText(question.question)}</div>
                    <div class="review-answers">
                        <div class="review-answer-row">
                            <span class="review-label">Your Answer:</span>
                            <span class="review-value ${statusClass}">${userAnswerText}</span>
                        </div>
                        ${!isCorrect ? `<div class="review-answer-row">
                            <span class="review-label">Correct Answer:</span>
                            <span class="review-value correct">${correctAnswerText}</span>
                        </div>` : ''}
                        ${(question.explanation || question.reference || (question.explanation_images && question.explanation_images.length > 0)) ? `
                        <div class="review-explanation-box" data-q-index="${index}">
                            ${question.explanation ? `
                            <span class="review-label">Justification:</span>
                            <span class="explanation-text">${this.formatQuestionText(question.explanation)}</span>
                            ` : ''}
                            <div class="review-explanation-images explanation-images-container"></div>
                            ${this.renderReferenceLink(question)}
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        html += '</div>';

        // Add pagination controls
        if (totalPages > 1) {
            html += '<div class="review-pagination">';
            if (page > 0) {
                html += `<button class="review-page-btn" data-page="${page - 1}">&larr; Previous</button>`;
            }
            html += `<span class="review-page-info">Page ${page + 1} of ${totalPages}</span>`;
            if (end < questions.length) {
                html += `<button class="review-page-btn" data-page="${page + 1}">Next &rarr;</button>`;
            }
            html += '</div>';
        }

        container.innerHTML = html;

        // Render explanation images inside detailed review cards
        container.querySelectorAll('.review-explanation-box[data-q-index]').forEach(box => {
            const qIndex = parseInt(box.dataset.qIndex, 10);
            const imgContainer = box.querySelector('.review-explanation-images');
            if (imgContainer && questions[qIndex]) {
                this.renderExplanationImagesForContainer(questions[qIndex], imgContainer);
            }
        });

        // Bind pagination button events
        container.querySelectorAll('.review-page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetPage = parseInt(btn.dataset.page, 10);
                this.generateDetailedReview(targetPage);
                container.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    }

    getQuestionStableId(question, fallbackIndex) {
        const rawId = String(question?.id ?? '').trim() || `question-${fallbackIndex + 1}`;
        return window.ExamApp.studyScheduler?.normalizeQuestionId?.(rawId) || rawId;
    }

    cloneAnswerForStorage(answer) {
        if (Array.isArray(answer)) return answer.map(value => Number.isInteger(value) ? value : String(value));
        if (Number.isInteger(answer)) return answer;
        if (answer === undefined || answer === null || answer === '') return null;
        return String(answer);
    }

    normalizeStoredAnswer(question, answer) {
        const type = window.ExamApp.normalizeQuestionType(question);
        const optionIndexMap = Array.isArray(question?._optionIndexMap) ? question._optionIndexMap : null;

        if (!optionIndexMap || ['SEQUENCE', 'YES_NO_MATRIX', 'DRAG_DROP_SELECT'].includes(type)) {
            return this.cloneAnswerForStorage(answer);
        }

        if (Array.isArray(answer)) {
            return answer.map(index => Number.isInteger(index) && optionIndexMap[index] !== undefined ? optionIndexMap[index] : index);
        }

        if (Number.isInteger(answer)) {
            return optionIndexMap[answer] !== undefined ? optionIndexMap[answer] : answer;
        }

        return this.cloneAnswerForStorage(answer);
    }

    buildAttemptQuestionResults(questions) {
        return questions.map((question, index) => {
            const userAnswer = this.selectedAnswers[index];
            const skipped = !this.isAnswerProvided(userAnswer);
            return {
                questionId: this.getQuestionStableId(question, index),
                order: index + 1,
                userAnswer: skipped ? null : this.normalizeStoredAnswer(question, userAnswer),
                correct: skipped ? false : this.isAnswerCorrect(question, userAnswer),
                skipped
            };
        });
    }

    trimAttemptReviewDetails(progress, keepDetailedCount = this.attemptReviewDetailLimit) {
        const attempts = Array.isArray(progress?.attempts) ? progress.attempts : [];
        const detailed = attempts.filter(attempt => Array.isArray(attempt.questionResults) && attempt.questionResults.length > 0);
        const keepIds = new Set(detailed.slice(-Math.max(0, keepDetailedCount)).map(attempt => attempt.attemptId || attempt.date));

        attempts.forEach(attempt => {
            const attemptKey = attempt.attemptId || attempt.date;
            if (Array.isArray(attempt.questionResults) && !keepIds.has(attemptKey)) {
                delete attempt.questionResults;
                attempt.hasReviewDetails = false;
            }
        });
    }

    saveProgressToStorage(examKey, progress) {
        this.trimAttemptReviewDetails(progress);
        const examId = String(examKey || '').replace(/_progress$/, '');
        const mirrorToIndexedDB = () => {
            if (window.ExamApp.examStorage && window.ExamApp.isSafeExamId(examId)) {
                window.ExamApp.examStorage.putProgress(examId, progress).catch(error => {
                    window.ExamApp.warn(`Failed to mirror ${examId} progress to IndexedDB:`, error);
                });
            }
        };
        try {
            localStorage.setItem(examKey, JSON.stringify(progress));
            mirrorToIndexedDB();
            return true;
        } catch (error) {
            if (!(error.name === 'QuotaExceededError' || error.code === 22)) throw error;
        }

        this.trimAttemptReviewDetails(progress, 1);
        localStorage.setItem(examKey, JSON.stringify(progress));
        mirrorToIndexedDB();
        return true;
    }

    saveProgress(score, passed, timeSpent) {
        const examKey = `${this.currentExam}_progress`;
        let progress = JSON.parse(localStorage.getItem(examKey) || '{"attempts": [], "bestScore": 0, "totalPassed": 0}');
        const questions = this.getCurrentQuestions();
        const questionResults = this.buildAttemptQuestionResults(questions);
        const incorrectCount = questionResults.filter(result => !result.correct && !result.skipped).length;
        const skippedCount = questionResults.filter(result => result.skipped).length;

        const attempt = {
            attemptId: this.generateLocalId('attempt'),
            date: new Date().toISOString(),
            score: score,
            passed: passed,
            timeSpent: timeSpent,
            questionCount: questions.length,
            correctCount: questionResults.filter(result => result.correct).length,
            incorrectCount,
            skippedCount,
            hasReviewDetails: true,
            questionResults,
            modules: this.examData[this.currentExam]?.selectedModules || null
        };

        progress.attempts.push(attempt);
        progress.bestScore = Math.max(progress.bestScore, score);
        if (passed) progress.totalPassed++;

        try {
            this.saveProgressToStorage(examKey, progress);
            window.ExamApp.addToRegistry(window.ExamApp.STORAGE_KEYS.progress, this.currentExam);
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                window.ExamApp.warn('localStorage quota exceeded, progress not saved');
                alert('Storage is full. Your progress could not be saved. Please clear some old exam data and try again.');
            } else {
                throw e;
            }
        }

        window.dispatchEvent(new CustomEvent('progress-updated'));
    }

    updateProgressDisplay() {
        // Update progress display for current exam (if selected)
        if (this.currentExam) {
            const examKey = `${this.currentExam}_progress`;
            const progress = JSON.parse(localStorage.getItem(examKey) || '{"attempts": [], "bestScore": 0, "totalPassed": 0}');

            document.getElementById('total-attempts').textContent = progress.attempts.length;
            document.getElementById('best-score').textContent = progress.attempts.length > 0 ? `${progress.bestScore || 0}%` : '-';

            const passRate = progress.attempts.length > 0 ?
                Math.round((progress.totalPassed / progress.attempts.length) * 100) : 0;
            document.getElementById('pass-rate').textContent = progress.attempts.length > 0 ? `${passRate}%` : '-';
        } else {
            // On homepage, show global stats from all exams
            let totalAttempts = 0;
            let bestScoreOverall = 0;
            let totalPassed = 0;

            const progressExamIds = window.ExamApp.getRegistry(window.ExamApp.STORAGE_KEYS.progress);
            if (progressExamIds.length > 0) {
                progressExamIds.forEach((examId) => {
                    const key = `${examId}_progress`;
                    try {
                        const progress = JSON.parse(localStorage.getItem(key));
                        if (progress && progress.attempts) {
                            totalAttempts += progress.attempts.length;
                            bestScoreOverall = Math.max(bestScoreOverall, progress.bestScore || 0);
                            totalPassed += progress.totalPassed || 0;
                        }
                    } catch (e) {
                        // Skip invalid progress data
                    }
                });
            } else {
                const len1 = localStorage.length;
                for (let i = 0; i < len1; i++) {
                    const key = localStorage.key(i);
                    if (key && key.endsWith('_progress')) {
                        try {
                            const progress = JSON.parse(localStorage.getItem(key));
                            if (progress && progress.attempts) {
                                totalAttempts += progress.attempts.length;
                                bestScoreOverall = Math.max(bestScoreOverall, progress.bestScore || 0);
                                totalPassed += progress.totalPassed || 0;
                            }
                        } catch (e) {}
                    }
                }
            }

            const totalAttemptsEl = document.getElementById('total-attempts');
            const bestScoreEl = document.getElementById('best-score');
            const passRateEl = document.getElementById('pass-rate');

            if (totalAttemptsEl) totalAttemptsEl.textContent = totalAttempts;
            if (bestScoreEl) bestScoreEl.textContent = totalAttempts > 0 ? `${bestScoreOverall}%` : '-';

            const passRate = totalAttempts > 0 ? Math.round((totalPassed / totalAttempts) * 100) : 0;
            if (passRateEl) passRateEl.textContent = totalAttempts > 0 ? `${passRate}%` : '-';
        }
    }

    restartExam() {
        // Reset and restart current exam
        if (this.currentExam) {
            if (this.isStudyMode()) {
                this.startStudyMode();
            } else {
                this.startExam();
            }
        } else {
            this.showScreen('welcome-screen');
        }
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
            window.ExamApp.setElementHidden(screen, true);
        });
        const target = document.getElementById(screenId);
        target.classList.add('active');
        window.ExamApp.setElementHidden(target, false);
    }

    toggleTheme() {
        document.body.classList.toggle('dark-mode');

        // Update theme icon
        document.querySelectorAll('.theme-icon').forEach(icon => {
            if (document.body.classList.contains('dark-mode')) {
                icon.className = 'fas fa-sun theme-icon';
            } else {
                icon.className = 'fas fa-moon theme-icon';
            }
        });

        // Save theme preference
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    // Load saved theme, or respect OS preference if no saved preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        document.querySelectorAll('.theme-icon').forEach(icon => {
            icon.className = 'fas fa-sun theme-icon';
        });
    } else if (!savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.classList.add('dark-mode');
        document.querySelectorAll('.theme-icon').forEach(icon => {
            icon.className = 'fas fa-sun theme-icon';
        });
    }

    // Ensure dynamic exams are loaded (server mode) before simulator instantiation.
    if (window.examsLoadedPromise) {
        try {
            await window.examsLoadedPromise;
        } catch (_) {
            // ignore loader failures (file:// mode)
        }
    }

    // Initialize simulator
    window.ExamApp = window.ExamApp || {};
    window.ExamApp.examSimulator = new MultiExamSimulator();
    window.examSimulator = window.ExamApp.examSimulator; // backwards compat
});

// Make functions available globally for HTML onclick handlers
window.showProgressStatistics = function() {
    // Gather progress from all exams
    const allProgress = {};
    let totalAttempts = 0;
    let totalExams = 0;

    const progressExamIds = window.ExamApp.getRegistry(window.ExamApp.STORAGE_KEYS.progress);
    const collect = (examId) => {
        if (!window.ExamApp.isSafeExamId(examId)) return;
            try {
                const progress = JSON.parse(localStorage.getItem(`${examId}_progress`));
                if (progress && progress.attempts && progress.attempts.length > 0) {
                    allProgress[examId] = progress;
                    totalAttempts += progress.attempts.length;
                    totalExams++;
                    window.ExamApp.addToRegistry(window.ExamApp.STORAGE_KEYS.progress, examId);
                }
            } catch (e) {
                window.ExamApp.warn(`Failed to parse progress for ${examId}:`, e);
            }
    };

    if (progressExamIds.length > 0) {
        progressExamIds.forEach(collect);
    } else {
        const len2 = localStorage.length;
        for (let i = 0; i < len2; i++) {
            const key = localStorage.key(i);
            if (key && key.endsWith('_progress')) {
                collect(key.replace('_progress', ''));
            }
        }
    }

    if (totalExams === 0) {
        if (typeof window.showCustomAlert === 'function') {
            window.showCustomAlert('No Progress Found', 'Complete some exams first to start tracking your progress!', 'info');
        } else {
            alert('No progress data found. Complete some exams first!');
        }
        return;
    }

    // Create modal with progress statistics
    showProgressModal(allProgress);
};

window.exportProgress = async function() {
    // Gather all progress data
    const allProgress = {};

    const progressExamIds = window.ExamApp.getRegistry(window.ExamApp.STORAGE_KEYS.progress);
    const collect = (examId) => {
        if (!window.ExamApp.isSafeExamId(examId)) return;
            try {
                const progress = JSON.parse(localStorage.getItem(`${examId}_progress`));
                if (progress) {
                    allProgress[examId] = progress;
                    window.ExamApp.addToRegistry(window.ExamApp.STORAGE_KEYS.progress, examId);
                }
            } catch (e) {
                window.ExamApp.warn(`Failed to parse progress for ${examId}:`, e);
            }
    };

    if (progressExamIds.length > 0) {
        progressExamIds.forEach(collect);
    } else {
        const len3 = localStorage.length;
        for (let i = 0; i < len3; i++) {
            const key = localStorage.key(i);
            if (key && key.endsWith('_progress')) {
                collect(key.replace('_progress', ''));
            }
        }
    }

    if (Object.keys(allProgress).length === 0) {
        if (typeof window.showCustomAlert === 'function') {
            window.showCustomAlert('No Progress to Export', 'There is no progress history to export at this time.', 'info');
        } else {
            alert('No progress data to export.');
        }
        return;
    }

    // Create export data with metadata
    const exportData = {
        exportDate: new Date().toISOString(),
        version: '1.0',
        exams: allProgress
    };

    // Optionally protect the backup with a passphrase (AES-GCM).
    const secureTransfer = window.ExamApp?.secureTransfer;
    let payload = exportData;
    let encrypted = false;
    if (secureTransfer && typeof window.showCustomConfirm === 'function') {
        const wantsEncryption = await window.showCustomConfirm(
            'Protect this backup?',
            'Encrypt the exported progress with a passphrase? You will need the same passphrase to import it again.',
            { confirmLabel: 'Encrypt', cancelLabel: 'Export plain' }
        );
        if (wantsEncryption) {
            const passphrase = await secureTransfer.promptPassphrase({
                title: 'Set export passphrase',
                message: 'Choose a passphrase to encrypt this backup. Keep it safe — it cannot be recovered.',
                confirmLabel: 'Encrypt & export',
                requireConfirmation: true
            });
            if (passphrase === null) {
                return; // user cancelled
            }
            try {
                payload = await secureTransfer.encrypt(exportData, passphrase);
                encrypted = true;
            } catch (error) {
                window.ExamApp.warn('Encryption failed:', error);
                if (typeof window.showCustomAlert === 'function') {
                    window.showCustomAlert('Encryption Failed', error.message || 'Could not encrypt the backup.', 'error');
                }
                return;
            }
        }
    }

    // Download as JSON
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStamp = new Date().toISOString().split('T')[0];
    a.download = encrypted
        ? `exam-progress-${dateStamp}.encrypted.json`
        : `exam-progress-${dateStamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (typeof window.showCustomAlert === 'function') {
        window.showCustomAlert('Export Complete', 'Your progress history has been successfully exported.', 'success');
    } else {
        alert('Progress data exported successfully!');
    }

    window.ExamApp?.analytics?.trackEvent('export_progress');
};

function showProgressModal(allProgress) {
    const modal = document.createElement('div');
    modal.id = 'progress-stats-modal';
    modal.className = 'progress-modal-overlay';

    const content = document.createElement('div');
    content.className = 'progress-modal-content';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'progress-modal-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close progress statistics');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => modal.remove());
    content.appendChild(closeBtn);

    const title = document.createElement('h2');
    title.className = 'progress-modal-title';
    title.appendChild(createProgressIcon('fas fa-chart-line'));
    title.appendChild(document.createTextNode(' Progress Statistics'));
    content.appendChild(title);

    const list = document.createElement('div');
    list.style.cssText = 'display:grid;gap:20px;';

    Object.entries(allProgress).forEach(([examId, progress]) => {
        const examName = getExamName(examId);
        const attempts = progress.attempts || [];
        const bestScore = progress.bestScore || 0;
        const totalPassed = progress.totalPassed || 0;
        const passRate = attempts.length > 0 ? Math.round((totalPassed / attempts.length) * 100) : 0;
        const avgScore = attempts.length > 0 ? Math.round(attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length) : 0;
        const recentAttempts = attempts.slice(-5);
        const trend = calculateTrend(recentAttempts);

        const card = document.createElement('div');
        card.style.cssText = 'background:linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);border-radius:12px;padding:20px;border:2px solid #dee2e6;';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;gap:12px;flex-wrap:wrap;';
        const heading = document.createElement('h3');
        heading.style.cssText = 'margin:0;color:#1e3c72;font-size:22px;';
        heading.appendChild(createProgressIcon('fas fa-graduation-cap'));
        heading.appendChild(document.createTextNode(` ${examName}`));
        header.appendChild(heading);

        const best = document.createElement('span');
        best.style.cssText = `background:${bestScore >= 70 ? '#28a745' : '#dc3545'};color:white;padding:6px 12px;border-radius:20px;font-size:14px;font-weight:bold;`;
        best.textContent = `Best: ${bestScore}%`;
        header.appendChild(best);
        card.appendChild(header);

        const metrics = document.createElement('div');
        metrics.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:15px;';
        metrics.appendChild(createMetricCard('Attempts', String(attempts.length), '#1e3c72'));
        metrics.appendChild(createMetricCard('Avg Score', `${avgScore}%`, '#007bff'));
        metrics.appendChild(createMetricCard('Pass Rate', `${passRate}%`, '#28a745'));
        metrics.appendChild(createMetricCard('Trend', trend, '#1e3c72'));
        card.appendChild(metrics);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'view-attempts-btn';
        button.style.cssText = 'width:100%;padding:12px;background:linear-gradient(135deg,#1e3c72,#2a5298);color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;';
        button.appendChild(createProgressIcon('fas fa-list'));
        button.appendChild(document.createTextNode(' View All Attempts'));
        button.addEventListener('click', () => showExamAttempts(examId));
        card.appendChild(button);

        list.appendChild(card);
    });

    content.appendChild(list);
    modal.appendChild(content);
    document.body.appendChild(modal);

    // Click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

function createProgressIcon(className) {
    const icon = document.createElement('i');
    icon.className = className;
    icon.setAttribute('aria-hidden', 'true');
    return icon;
}

function createMetricCard(label, value, color) {
    const card = document.createElement('div');
    card.style.cssText = 'background:white;padding:15px;border-radius:8px;text-align:center;';
    const labelEl = document.createElement('div');
    labelEl.style.cssText = 'color:#6c757d;font-size:12px;text-transform:uppercase;margin-bottom:5px;';
    labelEl.textContent = label;
    const valueEl = document.createElement('div');
    valueEl.style.cssText = `font-size:24px;font-weight:bold;color:${color};`;
    valueEl.textContent = value;
    card.appendChild(labelEl);
    card.appendChild(valueEl);
    return card;
}

function calculateTrend(attempts) {
    if (attempts.length < 2) return '➖';
    const recent = attempts.slice(-3);
    const scores = recent.map(a => a.score);
    const avg1 = scores.slice(0, Math.ceil(scores.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(scores.length / 2);
    const avg2 = scores.slice(Math.ceil(scores.length / 2)).reduce((a, b) => a + b, 0) / Math.floor(scores.length / 2);
    const diff = avg2 - avg1;
    if (diff > 5) return '📈';
    if (diff < -5) return '📉';
    return '➖';
}

function getExamName(examId) {
    if (window.userExams && window.userExams[examId] && window.userExams[examId].metadata) {
        return window.userExams[examId].metadata.name || examId.toUpperCase();
    }
    return examId.toUpperCase();
}

window.showExamAttempts = function(examId) {
    const examKey = `${examId}_progress`;
    const progress = JSON.parse(localStorage.getItem(examKey) || '{"attempts": []}');
    const attempts = progress.attempts || [];

    if (attempts.length === 0) {
        if (typeof window.showCustomAlert === 'function') {
            window.showCustomAlert('No Attempts', 'You haven\'t started this exam yet.', 'info');
        } else {
            alert('No attempts found for this exam.');
        }
        return;
    }

    // Remove existing modal if any
    const existing = document.getElementById('progress-stats-modal');
    if (existing) existing.remove();

    // Create modal
    const modal = document.createElement('div');
    modal.id = 'progress-stats-modal';
    modal.className = 'progress-modal-overlay';

    const content = document.createElement('div');
    content.className = 'progress-modal-content';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'progress-modal-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close attempt history');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => modal.remove());
    content.appendChild(closeBtn);

    const title = document.createElement('h2');
    title.className = 'progress-modal-title';
    title.appendChild(createProgressIcon('fas fa-history'));
    title.appendChild(document.createTextNode(` ${getExamName(examId)} - Attempt History`));
    content.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.style.cssText = 'color:#6c757d;margin-bottom:25px;';
    subtitle.textContent = `All ${attempts.length} attempts sorted by most recent`;
    content.appendChild(subtitle);

    const list = document.createElement('div');
    list.style.cssText = 'display:grid;gap:12px;';

    // Sort by date (most recent first)
    const sortedAttempts = [...attempts].reverse();

    sortedAttempts.forEach((attempt, index) => {
        const attemptNum = attempts.length - index;
        const date = new Date(attempt.date);
        const dateStr = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        const passed = attempt.passed;
        const statusColor = passed ? '#28a745' : '#dc3545';
        const statusIcon = passed ? 'fa-check-circle' : 'fa-times-circle';
        const statusText = passed ? 'PASSED' : 'FAILED';

        const card = document.createElement('div');
        card.style.cssText = `background:${passed ? 'linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%)' : 'linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%)'};border-radius:10px;padding:16px;border:2px solid ${passed ? '#28a745' : '#dc3545'};`;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;';

        const left = document.createElement('div');
        const attemptTitle = document.createElement('div');
        attemptTitle.style.cssText = 'font-weight:bold;font-size:16px;color:#212529;margin-bottom:4px;';
        attemptTitle.appendChild(createProgressIcon('fas fa-clipboard-check'));
        attemptTitle.appendChild(document.createTextNode(` Attempt #${attemptNum}`));
        left.appendChild(attemptTitle);

        const dateLine = document.createElement('div');
        dateLine.style.cssText = 'font-size:13px;color:#6c757d;';
        dateLine.appendChild(createProgressIcon('fas fa-calendar-alt'));
        dateLine.appendChild(document.createTextNode(` ${dateStr}`));
        left.appendChild(dateLine);

        if (attempt.modules && Array.isArray(attempt.modules) && attempt.modules.length > 0) {
            const modulesLine = document.createElement('div');
            modulesLine.style.cssText = 'font-size:12px;color:#495057;margin-top:6px;display:flex;align-items:center;gap:4px;flex-wrap:wrap;line-height:1.4;';

            const tagIcon = createProgressIcon('fas fa-tags');
            tagIcon.style.color = '#6c757d';
            modulesLine.appendChild(tagIcon);

            const modulesLabel = document.createElement('span');
            modulesLabel.style.fontWeight = '600';
            modulesLabel.textContent = 'Modules: ';
            modulesLine.appendChild(modulesLabel);

            const modulesText = document.createElement('span');
            modulesText.textContent = attempt.modules.join(', ');
            modulesText.style.cssText = 'background:rgba(0,0,0,0.06);padding:2px 6px;border-radius:4px;font-style:italic;display:inline-block;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            modulesText.title = attempt.modules.join(', '); // Show full list on hover

            modulesLine.appendChild(modulesText);
            left.appendChild(modulesLine);
        }

        row.appendChild(left);

        const right = document.createElement('div');
        right.style.cssText = 'display:flex;align-items:center;gap:20px;flex-wrap:wrap;';
        right.appendChild(createAttemptMetric('Score', `${attempt.score}%`, statusColor, '28px'));
        right.appendChild(createAttemptMetric('Time', `${attempt.timeSpent}min`, '#007bff', '20px'));

        const status = document.createElement('div');
        status.style.cssText = `background:${statusColor};color:white;padding:8px 16px;border-radius:20px;font-weight:bold;font-size:13px;`;
        status.appendChild(createProgressIcon(`fas ${statusIcon}`));
        status.appendChild(document.createTextNode(` ${statusText}`));
        right.appendChild(status);

        row.appendChild(right);
        card.appendChild(row);

        if (window.homepage && Array.isArray(attempt.questionResults) && attempt.questionResults.length > 0) {
            const actions = document.createElement('div');
            actions.className = 'progress-attempt-actions';

            const reviewButton = document.createElement('button');
            reviewButton.type = 'button';
            reviewButton.className = 'progress-attempt-btn primary';
            reviewButton.appendChild(createProgressIcon('fas fa-list-check'));
            reviewButton.appendChild(document.createTextNode(' Review'));
            reviewButton.addEventListener('click', () => {
                modal.remove();
                window.homepage.openAttemptReview(examId, attempt, attempts.length - index - 1);
            });
            actions.appendChild(reviewButton);

            const missedIds = window.homepage.getAttemptMissedQuestionIds(attempt);
            const studyButton = document.createElement('button');
            studyButton.type = 'button';
            studyButton.disabled = missedIds.length === 0;
            studyButton.className = 'progress-attempt-btn secondary';
            studyButton.appendChild(createProgressIcon('fas fa-brain'));
            studyButton.appendChild(document.createTextNode(missedIds.length > 0 ? ` Study missed (${missedIds.length})` : ' No misses'));
            studyButton.addEventListener('click', () => window.homepage.startMissedStudy(examId, attempt));
            actions.appendChild(studyButton);

            card.appendChild(actions);
        }
        list.appendChild(card);
    });

    content.appendChild(list);

    const footer = document.createElement('div');
    footer.style.cssText = 'margin-top:20px;text-align:center;';
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'back-to-overview-btn';
    backBtn.style.cssText = 'padding:10px 20px;background:#6c757d;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;';
    backBtn.appendChild(createProgressIcon('fas fa-arrow-left'));
    backBtn.appendChild(document.createTextNode(' Back to Overview'));
    backBtn.addEventListener('click', () => {
        modal.remove();
        window.showProgressStatistics();
    });
    footer.appendChild(backBtn);
    content.appendChild(footer);

    modal.appendChild(content);
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
};

function createAttemptMetric(label, value, color, size) {
    const metric = document.createElement('div');
    metric.style.cssText = 'text-align:center;';
    const labelEl = document.createElement('div');
    labelEl.style.cssText = 'color:#6c757d;font-size:11px;text-transform:uppercase;margin-bottom:3px;';
    labelEl.textContent = label;
    const valueEl = document.createElement('div');
    valueEl.style.cssText = `font-size:${size};font-weight:bold;color:${color};`;
    valueEl.textContent = value;
    metric.appendChild(labelEl);
    metric.appendChild(valueEl);
    return metric;
}
