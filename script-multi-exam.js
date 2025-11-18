// Multi-Exam Simulator - AI-900 and AI-102 Support
// Supports categorized images (question images vs explanation images)

class MultiExamSimulator {
    constructor() {
        this.currentExam = null;
    this.activeQuestions = null; // holds the sampled & randomized questions for the session
        this.examData = {
            'ai900': {
                name: 'AI-900',
                fullName: 'Azure AI Fundamentals',
                duration: 45,
                questionCount: 45,
                passScore: 75,
                questions: [],
                modules: [
                    { icon: 'fas fa-brain', name: 'AI Workloads & Services' },
                    { icon: 'fas fa-robot', name: 'Machine Learning Principles' },
                    { icon: 'fas fa-eye', name: 'Computer Vision Workloads' },
                    { icon: 'fas fa-language', name: 'Natural Language Processing' },
                    { icon: 'fas fa-magic', name: 'Generative AI Workloads' }
                ],
                resources: [
                    { icon: 'fab fa-microsoft', name: 'Official Exam Page', url: 'https://docs.microsoft.com/en-us/learn/certifications/exams/ai-900' },
                    { icon: 'fas fa-graduation-cap', name: 'AI Fundamentals Path', url: 'https://docs.microsoft.com/en-us/learn/paths/get-started-with-artificial-intelligence-on-azure/' },
                    { icon: 'fas fa-cogs', name: 'Azure AI Services', url: 'https://docs.microsoft.com/en-us/azure/cognitive-services/' }
                ]
            },
            'ai102': {
                name: 'AI-102',
                fullName: 'Azure AI Engineer Associate',
                duration: 150,
                questionCount: 45,
                passScore: 70,
                questions: [],
                modules: [
                    { icon: 'fas fa-language', name: 'Language Understanding (LUIS)' },
                    { icon: 'fas fa-robot', name: 'Bot Framework' },
                    { icon: 'fas fa-eye', name: 'Computer Vision Services' },
                    { icon: 'fas fa-search', name: 'Cognitive Search' },
                    { icon: 'fas fa-microphone', name: 'Speech Services' },
                    { icon: 'fas fa-file-alt', name: 'Form Recognizer' },
                    { icon: 'fas fa-brain', name: 'Text Analytics' },
                    { icon: 'fas fa-exchange-alt', name: 'Translator' }
                ],
                resources: [
                    { icon: 'fab fa-microsoft', name: 'Official Exam Page', url: 'https://docs.microsoft.com/en-us/learn/certifications/exams/ai-102' },
                    { icon: 'fas fa-graduation-cap', name: 'AI Engineer Path', url: 'https://docs.microsoft.com/en-us/learn/paths/azure-ai-engineer/' },
                    { icon: 'fas fa-code', name: 'AI SDKs & APIs', url: 'https://docs.microsoft.com/en-us/azure/cognitive-services/cognitive-services-apis-create-account' }
                ]
            }
        };

        this.currentQuestionIndex = 0;
        this.selectedAnswers = {};
        this.markedForReview = new Set();
        this.startTime = null;
        this.timer = null;

        this.init();
    }

    init() {
        this.loadQuestions();
        this.bindEvents();
        this.updateProgressDisplay();

        // Exam-only mode: if exam param is provided, auto-start in this page
        const params = new URLSearchParams(window.location.search);
        const examParam = params.get('exam');
        if (examParam && this.examData[examParam]) {
            this.currentExam = examParam;
            let started = false;
            const maybeStart = () => {
                if (!started && this.examData[this.currentExam].questions.length > 0) {
                    started = true;
                    this.startExam();
                }
            };
            if (examParam === 'ai102') {
                // If loader already populated, use it immediately
                if (typeof window.ai102Questions !== 'undefined' && window.ai102Questions.getAllQuestions) {
                    const got = window.ai102Questions.getAllQuestions();
                    if (Array.isArray(got) && got.length > 0) {
                        this.examData['ai102'].questions = got;
                        maybeStart();
                    }
                }
                // Also listen for readiness in case data arrives slightly later
                document.addEventListener('ai102QuestionsReady', () => {
                    if (typeof window.ai102Questions !== 'undefined' && window.ai102Questions.getAllQuestions) {
                        this.examData['ai102'].questions = window.ai102Questions.getAllQuestions();
                        maybeStart();
                    }
                });
            } else {
                // For AI-900 or other types, start when questions present
                setTimeout(maybeStart, 50);
            }
        }

        // If custom exam requested via URL, load it and start
        this.loadCustomExamIfRequested().then((loaded)=>{
            if (loaded) {
                this.startExam();
            }
        });

        // When AI-102 async data is ready, refresh cached questions and UI
        document.addEventListener('ai102QuestionsReady', (e) => {
            if (typeof window.ai102Questions !== 'undefined' && window.ai102Questions.getAllQuestions) {
                this.examData['ai102'].questions = window.ai102Questions.getAllQuestions();
                // Update the AI-102 card questions stat if on home
                const ai102Card = document.querySelector('.exam-card.ai102 .exam-stat-number');
                if (ai102Card) ai102Card.textContent = this.examData['ai102'].questions.length;
            }
        });

        // Auto-refresh question banks if overrides change (even across tabs)
        window.addEventListener('storage', (ev) => {
            if (ev.key === 'custom_ai900_questions' || ev.key === 'custom_ai102_questions') {
                console.log('Detected override change in storage. Reloading question banks.');
                this.loadQuestions();
                // If currently in an exam, we won't disrupt the session, but new sessions will use fresh data.
                // Update home cards if present
                const ai900Card = document.querySelector('.exam-card.ai900 .exam-stat-number');
                if (ai900Card) ai900Card.textContent = this.examData['ai900'].questions.length;
                const ai102Card2 = document.querySelector('.exam-card.ai102 .exam-stat-number');
                if (ai102Card2) ai102Card2.textContent = this.examData['ai102'].questions.length;
            }
        });
    }

    // Helper: return the active question set for the session or the master list
    getCurrentQuestions() {
        const master = this.examData[this.currentExam]?.questions || [];
        return Array.isArray(this.activeQuestions) && this.activeQuestions.length > 0 ? this.activeQuestions : master;
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

        // Group by module (null/undefined -> 'Uncategorized')
        const buckets = new Map();
        for (const q of all) {
            const key = (q && q.module) ? String(q.module) : 'Uncategorized';
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(q);
        }
        // Shuffle each bucket
        for (const arr of buckets.values()) this.shuffle(arr);

        const groups = Array.from(buckets.entries());
        // Sort groups by size desc to spread remainder fairly
        groups.sort((a,b)=>b[1].length - a[1].length);

        const k = groups.length;
        const base = Math.floor(count / k);
        let remainder = count % k;
        const selected = [];
        const remaindersPool = [];

        // First pass: take base (+1 for first remainder groups) from each bucket
        for (let i=0;i<groups.length;i++) {
            const arr = groups[i][1];
            const target = Math.min(arr.length, base + (remainder>0 ? 1 : 0));
            if (remainder>0) remainder--;
            const take = arr.splice(0, target);
            selected.push(...take);
            if (arr.length) remaindersPool.push(arr);
        }

        // If still short (due to small buckets), fill round-robin from remaining buckets
        let idx = 0;
        while (selected.length < count && remaindersPool.length > 0) {
            const arr = remaindersPool[idx % remaindersPool.length];
            if (arr.length > 0) selected.push(arr.shift());
            // Remove empty arrays
            for (let i = remaindersPool.length - 1; i >= 0; i--) {
                if (remaindersPool[i].length === 0) remaindersPool.splice(i, 1);
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
        if (q.question_type === 'SEQUENCE' || q.question_type === 'YES_NO_MATRIX' || q.question_type === 'DRAG_DROP_SELECT') {
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
        return q;
    }

    loadQuestions() {
        // Load AI-900 questions (prefer embedded dump if present)
        if (Array.isArray(window.ai900Dump)) {
            this.examData['ai900'].questions = window.ai900Dump;
        } else if (typeof getAllQuestions === 'function') {
            this.examData['ai900'].questions = getAllQuestions();
        }

        // Load AI-102 questions: prefer built integration (ai102_questions_text_only.js) which fetches ./ai102-extractor/out/ai102_dump.json
        if (typeof window.ai102Questions !== 'undefined' && window.ai102Questions.getAllQuestions) {
            this.examData['ai102'].questions = window.ai102Questions.getAllQuestions();
        }

        // Optional local overrides from localStorage (created by the visual editor)
        try {
            const override900 = localStorage.getItem('custom_ai900_questions');
            if (override900) {
                const parsed900 = JSON.parse(override900);
                if (Array.isArray(parsed900) && parsed900.length > 0) {
                    console.log('Using local override for AI-900 questions');
                    this.examData['ai900'].questions = parsed900;
                }
            }
        } catch (e) {
            console.warn('Failed to parse custom_ai900_questions override:', e);
        }

        try {
            const override102 = localStorage.getItem('custom_ai102_questions');
            if (override102) {
                const parsed102 = JSON.parse(override102);
                if (Array.isArray(parsed102) && parsed102.length > 0) {
                    console.log('Using local override for AI-102 questions');
                    this.examData['ai102'].questions = parsed102;
                }
            }
        } catch (e) {
            console.warn('Failed to parse custom_ai102_questions override:', e);
        }

        console.log('Loaded questions:', {
            'ai900': this.examData['ai900'].questions.length,
            'ai102': this.examData['ai102'].questions.length
        });
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
            const url = `exam.html?exam=${encodeURIComponent(this.currentExam)}`;
            window.open(url, '_blank');
        });

        // Start custom exam from home
        document.getElementById('start-custom-exam')?.addEventListener('click', () => {
            const code = (document.getElementById('custom-exam-code')?.value || '').trim();
            if (!code) { alert('Enter a custom exam code'); return; }
            const url = `exam.html?exam=custom&code=${encodeURIComponent(code)}`;
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
    }

    selectExam(examType) {
        if (!this.examData[examType]) return;

        // If AI-102 selected and not yet loaded, try to fetch and proceed when ready
        if (examType === 'ai102' && this.examData['ai102'].questions.length === 0) {
            if (window.ai102Questions && typeof window.ai102Questions.fetchAndPrepare === 'function') {
                window.ai102Questions.fetchAndPrepare().then(() => {
                    this.examData['ai102'].questions = window.ai102Questions.getAllQuestions();
                    if (this.examData['ai102'].questions.length === 0) {
                        alert('AI-102 questions are not available yet.');
                        return;
                    }
                    this._completeExamSelection(examType);
                });
                return;
            } else {
                alert('AI-102 questions are not available yet.');
                return;
            }
        }

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
            // Try localStorage override first
            try {
                const raw = localStorage.getItem(`custom_${code}_questions`);
                if (raw) {
                    const data = JSON.parse(raw);
                    if (Array.isArray(data) && data.length) {
                        this.examData['custom'] = {
                            name: code.toUpperCase(), fullName: code, duration: 60, questionCount: 45, passScore: 70, questions: data,
                            modules: [], resources: []
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
                    if (Array.isArray(data) && data.length) {
                        this.examData['custom'] = {
                            name: code.toUpperCase(), fullName: code, duration: 60, questionCount: 45, passScore: 70, questions: data,
                            modules: [], resources: []
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

        console.log(`Selected exam: ${examType}`, exam);
    }

    updateExamInfo(exam) {
        document.getElementById('current-exam-name').textContent = exam.name;
        document.getElementById('exam-duration').textContent = `${exam.duration} minutes`;
        document.getElementById('exam-questions').textContent = `${exam.questionCount} questions`;
        document.getElementById('exam-pass-score').textContent = `${exam.passScore}%`;
        document.getElementById('exam-images').textContent = exam.name === 'AI-102' ? 'With HD Images' : 'With Images';
    }

    updateModulesAndResources(exam) {
        // Update modules list
        const modulesList = document.getElementById('modules-list');
        modulesList.innerHTML = '';
        exam.modules.forEach(module => {
            const li = document.createElement('li');
            li.innerHTML = `<i class="${module.icon}"></i> ${module.name}`;
            modulesList.appendChild(li);
        });

        // Update resources list
        const resourcesList = document.getElementById('resources-list');
        resourcesList.innerHTML = '';
        exam.resources.forEach(resource => {
            const a = document.createElement('a');
            a.href = resource.url;
            a.target = '_blank';
            a.className = 'resource-compact';
            a.innerHTML = `<i class="${resource.icon}"></i> ${resource.name}`;
            resourcesList.appendChild(a);
        });
    }

    startExam() {
        if (!this.currentExam) {
            alert('Please select an exam first.');
            return;
        }

        // Ensure dataset is loaded before starting, particularly for AI-102
        if (this.currentExam === 'ai102') {
            const have = (this.examData['ai102'].questions || []).length;
            if (have === 0) {
                // Try to pull from loader immediately
                if (window.ai102Questions && typeof window.ai102Questions.getAllQuestions === 'function') {
                    const got = window.ai102Questions.getAllQuestions();
                    if (Array.isArray(got) && got.length > 0) {
                        this.examData['ai102'].questions = got;
                    }
                }
            }
            if ((this.examData['ai102'].questions || []).length === 0) {
                // Wait for readiness, then start
                const handler = () => {
                    if (window.ai102Questions && typeof window.ai102Questions.getAllQuestions === 'function') {
                        this.examData['ai102'].questions = window.ai102Questions.getAllQuestions();
                    }
                    document.removeEventListener('ai102QuestionsReady', handler);
                    this.startExam();
                };
                document.addEventListener('ai102QuestionsReady', handler);
                return;
            }
        }

        // Reset exam state
        this.currentQuestionIndex = 0;
        this.selectedAnswers = {};
        this.markedForReview = new Set();
        this.startTime = new Date();

        // Update exam badge in header
        document.getElementById('current-exam-badge').textContent = this.examData[this.currentExam].name;
        document.getElementById('current-exam-badge').className = `exam-badge ${this.currentExam}`;

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
    this.showQuestion(0);
        
        // Switch to exam screen
        this.showScreen('exam-screen');
    }

    showQuestion(index) {
        const questions = this.getCurrentQuestions();
        if (index < 0 || index >= questions.length) return;

        this.currentQuestionIndex = index;
    const question = questions[index];

        // Update question display
        document.getElementById('question-number').textContent = `Question ${index + 1}`;
        document.getElementById('question-text').innerHTML = this.formatQuestionText(question.question);
        
        // Update question counter
        document.getElementById('question-counter').textContent = `${index + 1} / ${questions.length}`;
        
        // Update progress bar
        const progress = ((index + 1) / questions.length) * 100;
        document.getElementById('progress-fill').style.width = `${progress}%`;

        // Show question type indicator for AI-102
        this.showQuestionTypeIndicator(question);

        // Display question images (AI-102 feature)
        this.displayQuestionImages(question);

    // Update options
    this.displayOptions(question);

    // Update navigation buttons
        document.getElementById('prev-btn').disabled = index === 0;
        document.getElementById('next-btn').style.display = index === questions.length - 1 ? 'none' : 'block';
        document.getElementById('finish-exam').style.display = index === questions.length - 1 ? 'block' : 'none';

        // Update mark for review button
        const isMarked = this.markedForReview.has(index);
        document.getElementById('mark-review-btn').classList.toggle('marked', isMarked);

        // Hide answer feedback
        this.closeFeedback();
    }

    showQuestionTypeIndicator(question) {
        const indicator = document.getElementById('question-type-indicator');
        const typeText = document.getElementById('question-type-text');
        
        if (question.question_type && question.question_type !== 'STANDARD') {
            const typeMap = {
                'DRAG_DROP': { text: 'Drag & Drop Question', icon: 'fas fa-arrows-alt' },
                'DRAG_DROP_SELECT': { text: 'Drag & Drop (Select) Question', icon: 'fas fa-hand-pointer' },
                'HOTSPOT': { text: 'Hotspot Question', icon: 'fas fa-crosshairs' },
                'SEQUENCE': { text: 'Sequence (Ordering) Question', icon: 'fas fa-sort-amount-down' },
                'YES_NO_MATRIX': { text: 'Yes/No Matrix Question', icon: 'fas fa-th-list' }
            };
            
            const type = typeMap[question.question_type] || { text: question.question_type, icon: 'fas fa-question' };
            
            typeText.innerHTML = `<i class="${type.icon}"></i> ${type.text}`;
            indicator.style.display = 'block';
            indicator.className = `question-type-indicator ${question.question_type.toLowerCase()}`;
        } else {
            indicator.style.display = 'none';
        }
    }

    displayQuestionImages(question) {
        const container = document.getElementById('question-images');
        container.innerHTML = '';

        // Show question images if available (AI-102 feature)
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
                        // Handles: 'images/ai900/file.jpg' -> 'file.jpg'
                        let filename = imageInfo.filename;
                        if (filename.includes('/')) {
                            filename = filename.split('/').pop();
                        } else if (filename.includes('\\')) {
                            filename = filename.split('\\').pop();
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
                                    <small>Image not available: ${filename}</small>
                                </div>
                            `;
                        };
                        
                        imageWrapper.appendChild(img);
                    } catch (error) {
                        console.warn(`Failed to load image: ${imageInfo.filename}`, error);
                        imageWrapper.innerHTML = `
                            <div class="image-error">
                                <i class="fas fa-exclamation-triangle"></i>
                                <small>Failed to load: ${imageInfo.filename}</small>
                            </div>
                        `;
                    }
                })();
            });
        }
    }

    displayExplanationImages(question) {
        const container = document.getElementById('explanation-images');
        container.innerHTML = '';

        // Show explanation images if available (AI-102 feature)
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
                        // Handles: 'images/ai900/file.jpg' -> 'file.jpg'
                        let filename = imageInfo.filename;
                        if (filename.includes('/')) {
                            filename = filename.split('/').pop();
                        } else if (filename.includes('\\')) {
                            filename = filename.split('\\').pop();
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
                                    <small>Image not available: ${filename}</small>
                                </div>
                            `;
                        };
                        
                        imageWrapper.appendChild(img);
                    } catch (error) {
                        console.warn(`Failed to load image: ${imageInfo.filename}`, error);
                        imageWrapper.innerHTML = `
                            <div class="image-error">
                                <i class="fas fa-exclamation-triangle"></i>
                                <small>Failed to load: ${imageInfo.filename}</small>
                            </div>
                        `;
                    }
                })();
            });
        }
    }

    formatQuestionText(text) {
        // Handle line breaks and formatting
        let formattedText = text.replace(/\\n/g, '<br>').replace(/✑/g, '•');
        
        // Process Markdown images if processQuestionContent is available
        if (typeof processQuestionContent === 'function') {
            formattedText = processQuestionContent(formattedText);
        }
        
        return formattedText;
    }

    displayOptions(question) {
        const container = document.getElementById('options-container');
        container.innerHTML = '';

        const isSequence = (question.question_type === 'SEQUENCE');
    const isYesNoMatrix = (question.question_type === 'YES_NO_MATRIX');
    const isDragSelect = (question.question_type === 'DRAG_DROP_SELECT');
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
                        <span class="sequence-text">${question.options[optIndex]}</span>
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
                        }
                    });

                    down.addEventListener('click', () => {
                        if (pos < order.length - 1) {
                            const arr = [...order];
                            [arr[pos], arr[pos + 1]] = [arr[pos + 1], arr[pos]];
                            this.selectedAnswers[this.currentQuestionIndex] = arr;
                            render();
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
                    });

                    sequenceList.appendChild(item);
                });
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
                });
                no.addEventListener('click', () => {
                    const sel = this.selectedAnswers[this.currentQuestionIndex] || [];
                    sel[idx] = 1; // No maps to option index 1
                    this.selectedAnswers[this.currentQuestionIndex] = sel;
                    sync();
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
            const target = document.createElement('div');
            target.className = 'ddselect-target';
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
                        btn.innerHTML = `<span class="option-letter">${String.fromCharCode(65 + idx)}</span><span class="option-text">${opt}</span>`;
                        btn.addEventListener('click', () => {
                            if (sel.length < required && !sel.includes(idx)) {
                                sel.push(idx);
                                this.selectedAnswers[this.currentQuestionIndex] = sel;
                                render();
                            }
                        });
                        source.appendChild(btn);
                    }
                });
                sel.forEach((idx, pos) => {
                    const chip = document.createElement('div');
                    chip.className = 'ddselect-chip';
                    chip.innerHTML = `<span class="chip-index">${pos + 1}.</span> <span class="chip-text">${question.options[idx]}</span>`;
                    const rm = document.createElement('button');
                    rm.type = 'button';
                    rm.className = 'chip-remove';
                    rm.innerHTML = '<i class="fas fa-times"></i>';
                    rm.addEventListener('click', () => {
                        const i = sel.indexOf(idx);
                        if (i >= 0) sel.splice(i, 1);
                        this.selectedAnswers[this.currentQuestionIndex] = sel;
                        render();
                    });
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
            });

            const label = document.createElement('label');
            label.htmlFor = `option-${index}`;
            label.innerHTML = `<span class="option-letter">${String.fromCharCode(65 + index)}</span><span class="option-text">${option}</span>`;

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
    const isSequence = (question.question_type === 'SEQUENCE');
    const isYesNoMatrix = (question.question_type === 'YES_NO_MATRIX');
    const isDragSelect = (question.question_type === 'DRAG_DROP_SELECT');
    const isMulti = Array.isArray(correctAnswer) && !isSequence && !isYesNoMatrix && !isDragSelect;

        let isCorrect;
        if (isSequence) {
            const ua = Array.isArray(userAnswer) ? [...userAnswer] : [];
            const ca = Array.isArray(correctAnswer) ? [...correctAnswer] : [];
            isCorrect = ua.length > 0 && ua.length === ca.length && ua.every((v, i) => v === ca[i]);
        } else if (isYesNoMatrix) {
            const ua = Array.isArray(userAnswer) ? [...userAnswer] : [];
            const ca = Array.isArray(correctAnswer) ? [...correctAnswer] : [];
            isCorrect = ua.length > 0 && ua.length === ca.length && ua.every((v, i) => v === ca[i]);
        } else if (isDragSelect) {
            const ua = Array.isArray(userAnswer) ? [...new Set(userAnswer)].sort((a,b)=>a-b) : [];
            const ca = Array.isArray(correctAnswer) ? [...new Set(correctAnswer)].sort((a,b)=>a-b) : [];
            isCorrect = ua.length > 0 && ua.length === ca.length && ua.every((v,i)=>v===ca[i]);
        } else if (isMulti) {
            const ua = Array.isArray(userAnswer) ? [...new Set(userAnswer)].sort((a,b)=>a-b) : [];
            const ca = [...new Set(correctAnswer)].sort((a,b)=>a-b);
            isCorrect = ua.length > 0 && ua.length === ca.length && ua.every((v,i)=>v===ca[i]);
        } else {
            isCorrect = userAnswer === correctAnswer;
        }
        
        // Show feedback
        const feedback = document.getElementById('answer-feedback');
        const status = feedback.querySelector('.feedback-status');
        const correctAnswerDiv = feedback.querySelector('.correct-answer');
        const explanationDiv = feedback.querySelector('.explanation');
        
        status.innerHTML = isCorrect 
            ? '<i class="fas fa-check-circle" style="color: #28a745;"></i> Correct!'
            : '<i class="fas fa-times-circle" style="color: #dc3545;"></i> Incorrect';
        
        if (isSequence) {
            const letters = (correctAnswer || []).map(i => `${String.fromCharCode(65 + i)}. ${question.options[i]}`);
            correctAnswerDiv.innerHTML = `<strong>Correct Order:</strong> ${letters.join(' → ')}`;
        } else if (isYesNoMatrix) {
            const statements = Array.isArray(question.statements) ? question.statements : [];
            const yn = (v) => v === 0 ? 'Yes' : 'No';
            const rows = statements.map((s, i) => `<div class="yn-solution-row"><span class="yn-solution-label">${s}</span><span class="yn-solution-value">${yn(correctAnswer[i])}</span></div>`);
            correctAnswerDiv.innerHTML = `<strong>Correct Responses:</strong><div class="yn-solution">${rows.join('')}</div>`;
        } else if (isDragSelect || Array.isArray(correctAnswer)) {
            const letters = correctAnswer.map(i => `${String.fromCharCode(65 + i)}. ${question.options[i]}`);
            correctAnswerDiv.innerHTML = `<strong>Correct Selection(s):</strong> ${letters.join(' | ')}`;
        } else {
            correctAnswerDiv.innerHTML = `<strong>Correct Answer:</strong> ${String.fromCharCode(65 + correctAnswer)}. ${question.options[correctAnswer]}`;
        }
        
        if (question.explanation) {
            explanationDiv.innerHTML = `<strong>Explanation:</strong><br>${this.formatQuestionText(question.explanation)}`;
        } else {
            explanationDiv.innerHTML = '';
        }

        // Display explanation images
        this.displayExplanationImages(question);
        
        feedback.style.display = 'block';
        
        // Update option styles to show correct/incorrect (skip for sequence type)
    if (!isSequence && !isYesNoMatrix && !isDragSelect) {
            document.querySelectorAll('.option').forEach((option, index) => {
                const input = option.querySelector('input');
                option.classList.remove('correct', 'incorrect', 'user-selected', 'correct-answer', 'incorrect-answer');
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
    }

    closeFeedback() {
        document.getElementById('answer-feedback').style.display = 'none';
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
        const index = this.currentQuestionIndex;
        if (this.markedForReview.has(index)) {
            this.markedForReview.delete(index);
        } else {
            this.markedForReview.add(index);
        }
        
        document.getElementById('mark-review-btn').classList.toggle('marked', this.markedForReview.has(index));
    }

    startTimer() {
        const duration = this.examData[this.currentExam].duration * 60; // Convert to seconds
        let remainingTime = duration;
        
        this.timer = setInterval(() => {
            const minutes = Math.floor(remainingTime / 60);
            const seconds = remainingTime % 60;
            
            document.getElementById('timer').textContent = 
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            if (remainingTime <= 0) {
                clearInterval(this.timer);
                this.finishExam();
            }
            
            remainingTime--;
        }, 1000);
    }

    finishExam() {
        clearInterval(this.timer);
        
        // Calculate results
        const questions = this.getCurrentQuestions();
        let correct = 0;
        let incorrect = 0;
        
        questions.forEach((question, index) => {
            const ua = this.selectedAnswers[index];
            const ca = question.correct;
            const isSequence = (question.question_type === 'SEQUENCE');
            const isYesNoMatrix = (question.question_type === 'YES_NO_MATRIX');
            const isDragSelect = (question.question_type === 'DRAG_DROP_SELECT');
            if (Array.isArray(ca)) {
                if (isSequence) {
                    const u = Array.isArray(ua) ? [...ua] : [];
                    const c = [...ca];
                    if (u.length > 0 && u.length === c.length && u.every((v,i)=>v===c[i])) correct++;
                    else if (u.length > 0) incorrect++;
                } else if (isYesNoMatrix) {
                    const u = Array.isArray(ua) ? [...ua] : [];
                    const c = [...ca];
                    if (u.length > 0 && u.length === c.length && u.every((v,i)=>v===c[i])) correct++;
                    else if (u.length > 0) incorrect++;
                } else {
                    const u = Array.isArray(ua) ? [...new Set(ua)].sort((a,b)=>a-b) : [];
                    const c = [...new Set(ca)].sort((a,b)=>a-b);
                    if (u.length > 0 && u.length === c.length && u.every((v,i)=>v===c[i])) correct++;
                    else if (u.length > 0) incorrect++;
                }
            } else {
                if (ua === ca) correct++;
                else if (ua !== undefined) incorrect++;
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

    showResults(score, passed, correct, incorrect, total, timeSpent) {
        // Update result status
        const statusIcon = document.getElementById('result-status-icon');
        const statusText = document.getElementById('result-status');
        
        if (passed) {
            statusIcon.innerHTML = '<i class="fas fa-check-circle"></i>';
            statusIcon.className = 'status-icon passed';
            statusText.textContent = 'PASSED';
            statusText.className = 'result-status result-status-chip passed';
        } else {
            statusIcon.innerHTML = '<i class="fas fa-times-circle"></i>';
            statusIcon.className = 'status-icon failed';
            statusText.textContent = 'FAILED';
            statusText.className = 'result-status result-status-chip failed';
        }
        const summaryCard = document.getElementById('resultsSummaryCard');
        if (summaryCard) {
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

        // Save progress
        this.saveProgress(score, passed, timeSpent);
    }

    generateDetailedReview() {
        const questions = this.getCurrentQuestions();
        const container = document.getElementById('detailed-review');
        if (!container) return;

        let html = '<h3 class="section-title"><i class="fas fa-list-check"></i> Detailed Review</h3><div class="review-list">';

        questions.forEach((question, index) => {
            const userAnswer = this.selectedAnswers[index];
            const correctAnswer = question.correct;
            const isSequence = (question.question_type === 'SEQUENCE');
            const isYesNoMatrix = (question.question_type === 'YES_NO_MATRIX');
            const isDragSelect = (question.question_type === 'DRAG_DROP_SELECT');
            const isMulti = Array.isArray(correctAnswer) && !isSequence && !isYesNoMatrix && !isDragSelect;

            let isCorrect;
            if (isSequence) {
                const ua = Array.isArray(userAnswer) ? [...userAnswer] : [];
                const ca = Array.isArray(correctAnswer) ? [...correctAnswer] : [];
                isCorrect = ua.length > 0 && ua.length === ca.length && ua.every((v, i) => v === ca[i]);
            } else if (isYesNoMatrix) {
                const ua = Array.isArray(userAnswer) ? [...userAnswer] : [];
                const ca = Array.isArray(correctAnswer) ? [...correctAnswer] : [];
                isCorrect = ua.length > 0 && ua.length === ca.length && ua.every((v, i) => v === ca[i]);
            } else if (isDragSelect) {
                const ua = Array.isArray(userAnswer) ? [...new Set(userAnswer)].sort((a,b)=>a-b) : [];
                const ca = Array.isArray(correctAnswer) ? [...new Set(correctAnswer)].sort((a,b)=>a-b) : [];
                isCorrect = ua.length > 0 && ua.length === ca.length && ua.every((v,i)=>v===ca[i]);
            } else if (isMulti) {
                const ua = Array.isArray(userAnswer) ? [...new Set(userAnswer)].sort((a,b)=>a-b) : [];
                const ca = [...new Set(correctAnswer)].sort((a,b)=>a-b);
                isCorrect = ua.length > 0 && ua.length === ca.length && ua.every((v,i)=>v===ca[i]);
            } else {
                isCorrect = userAnswer === correctAnswer;
            }

            const wasAnswered = userAnswer !== undefined && userAnswer !== null && (Array.isArray(userAnswer) ? userAnswer.length > 0 : true);
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
                    <div class="review-question">${question.question.substring(0, 120)}${question.question.length > 120 ? '...' : ''}</div>
                    <div class="review-answers">
                        <div class="review-answer-row">
                            <span class="review-label">Your Answer:</span>
                            <span class="review-value ${statusClass}">${userAnswerText}</span>
                        </div>
                        ${!isCorrect ? `<div class="review-answer-row">
                            <span class="review-label">Correct Answer:</span>
                            <span class="review-value correct">${correctAnswerText}</span>
                        </div>` : ''}
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    saveProgress(score, passed, timeSpent) {
        const examKey = `${this.currentExam}_progress`;
        let progress = JSON.parse(localStorage.getItem(examKey) || '{"attempts": [], "bestScore": 0, "totalPassed": 0}');
        
        const attempt = {
            date: new Date().toISOString(),
            score: score,
            passed: passed,
            timeSpent: timeSpent
        };
        
        progress.attempts.push(attempt);
        progress.bestScore = Math.max(progress.bestScore, score);
        if (passed) progress.totalPassed++;
        
        localStorage.setItem(examKey, JSON.stringify(progress));

        if (window.homepage && typeof window.homepage.refreshHeroPreview === 'function') {
            try {
                window.homepage.refreshHeroPreview();
            } catch (error) {
                console.warn('Failed to refresh hero preview after saving progress:', error);
            }
        }
    }

    updateProgressDisplay() {
        // Update progress display for current exam (if selected)
        if (this.currentExam) {
            const examKey = `${this.currentExam}_progress`;
            const progress = JSON.parse(localStorage.getItem(examKey) || '{"attempts": [], "bestScore": 0, "totalPassed": 0}');

            document.getElementById('total-attempts').textContent = progress.attempts.length;
            document.getElementById('best-score').textContent = progress.bestScore ? `${progress.bestScore}%` : '-';

            const passRate = progress.attempts.length > 0 ?
                Math.round((progress.totalPassed / progress.attempts.length) * 100) : 0;
            document.getElementById('pass-rate').textContent = progress.attempts.length > 0 ? `${passRate}%` : '-';
        } else {
            // On homepage, show global stats from all exams
            let totalAttempts = 0;
            let bestScoreOverall = 0;
            let totalPassed = 0;

            // Check all exams in localStorage
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.endsWith('_progress')) {
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
                }
            }

            const totalAttemptsEl = document.getElementById('total-attempts');
            const bestScoreEl = document.getElementById('best-score');
            const passRateEl = document.getElementById('pass-rate');

            if (totalAttemptsEl) totalAttemptsEl.textContent = totalAttempts;
            if (bestScoreEl) bestScoreEl.textContent = bestScoreOverall > 0 ? `${bestScoreOverall}%` : '-';

            const passRate = totalAttempts > 0 ? Math.round((totalPassed / totalAttempts) * 100) : 0;
            if (passRateEl) passRateEl.textContent = totalAttempts > 0 ? `${passRate}%` : '-';
        }
    }

    restartExam() {
        // Reset and restart current exam
        if (this.currentExam) {
            this.startExam();
        } else {
            this.showScreen('welcome-screen');
        }
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
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
document.addEventListener('DOMContentLoaded', () => {
    // Load saved theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        document.querySelectorAll('.theme-icon').forEach(icon => {
            icon.className = 'fas fa-sun theme-icon';
        });
    }
    
    // Initialize simulator
    window.examSimulator = new MultiExamSimulator();
});

// Make functions available globally for HTML onclick handlers
window.showProgressStatistics = function() {
    // Gather progress from all exams
    const allProgress = {};
    let totalAttempts = 0;
    let totalExams = 0;

    // Check all possible exam IDs in localStorage
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.endsWith('_progress')) {
            const examId = key.replace('_progress', '');
            try {
                const progress = JSON.parse(localStorage.getItem(key));
                if (progress && progress.attempts && progress.attempts.length > 0) {
                    allProgress[examId] = progress;
                    totalAttempts += progress.attempts.length;
                    totalExams++;
                }
            } catch (e) {
                console.warn(`Failed to parse progress for ${examId}:`, e);
            }
        }
    }

    if (totalExams === 0) {
        alert('No progress data found. Complete some exams first!');
        return;
    }

    // Create modal with progress statistics
    showProgressModal(allProgress);
};

window.exportProgress = function() {
    // Gather all progress data
    const allProgress = {};

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.endsWith('_progress')) {
            const examId = key.replace('_progress', '');
            try {
                const progress = JSON.parse(localStorage.getItem(key));
                if (progress) {
                    allProgress[examId] = progress;
                }
            } catch (e) {
                console.warn(`Failed to parse progress for ${examId}:`, e);
            }
        }
    }

    if (Object.keys(allProgress).length === 0) {
        alert('No progress data to export.');
        return;
    }

    // Create export data with metadata
    const exportData = {
        exportDate: new Date().toISOString(),
        version: '1.0',
        exams: allProgress
    };

    // Download as JSON
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exam-progress-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alert('Progress data exported successfully!');
};

function showProgressModal(allProgress) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'progress-stats-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;overflow:auto;padding:20px;';

    // Create modal content
    const content = document.createElement('div');
    content.style.cssText = 'background:white;border-radius:16px;max-width:1000px;width:100%;max-height:90vh;overflow:auto;position:relative;';

    // Build HTML content
    let html = `
        <div style="padding:30px;">
            <button onclick="document.getElementById('progress-stats-modal').remove()"
                style="position:absolute;top:15px;right:15px;background:transparent;border:none;font-size:28px;cursor:pointer;color:#666;line-height:1;">
                &times;
            </button>

            <h2 style="margin:0 0 25px 0;color:#1e3c72;font-size:28px;">
                <i class="fas fa-chart-line"></i> Progress Statistics
            </h2>

            <div style="display:grid;gap:20px;">
    `;

    // For each exam, show statistics
    Object.entries(allProgress).forEach(([examId, progress]) => {
        const examName = getExamName(examId);
        const attempts = progress.attempts || [];
        const bestScore = progress.bestScore || 0;
        const totalPassed = progress.totalPassed || 0;
        const passRate = attempts.length > 0 ? Math.round((totalPassed / attempts.length) * 100) : 0;
        const avgScore = attempts.length > 0 ? Math.round(attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length) : 0;

        // Calculate recent trend
        const recentAttempts = attempts.slice(-5);
        const trend = calculateTrend(recentAttempts);

        html += `
            <div style="background:linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);border-radius:12px;padding:20px;border:2px solid #dee2e6;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
                    <h3 style="margin:0;color:#1e3c72;font-size:22px;">
                        <i class="fas fa-graduation-cap"></i> ${examName}
                    </h3>
                    <span style="background:${bestScore >= 70 ? '#28a745' : '#dc3545'};color:white;padding:6px 12px;border-radius:20px;font-size:14px;font-weight:bold;">
                        Best: ${bestScore}%
                    </span>
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:15px;">
                    <div style="background:white;padding:15px;border-radius:8px;text-align:center;">
                        <div style="color:#6c757d;font-size:12px;text-transform:uppercase;margin-bottom:5px;">Attempts</div>
                        <div style="font-size:24px;font-weight:bold;color:#1e3c72;">${attempts.length}</div>
                    </div>
                    <div style="background:white;padding:15px;border-radius:8px;text-align:center;">
                        <div style="color:#6c757d;font-size:12px;text-transform:uppercase;margin-bottom:5px;">Avg Score</div>
                        <div style="font-size:24px;font-weight:bold;color:#007bff;">${avgScore}%</div>
                    </div>
                    <div style="background:white;padding:15px;border-radius:8px;text-align:center;">
                        <div style="color:#6c757d;font-size:12px;text-transform:uppercase;margin-bottom:5px;">Pass Rate</div>
                        <div style="font-size:24px;font-weight:bold;color:#28a745;">${passRate}%</div>
                    </div>
                    <div style="background:white;padding:15px;border-radius:8px;text-align:center;">
                        <div style="color:#6c757d;font-size:12px;text-transform:uppercase;margin-bottom:5px;">Trend</div>
                        <div style="font-size:24px;font-weight:bold;">${trend}</div>
                    </div>
                </div>

                <button onclick="showExamAttempts('${examId}')"
                    style="width:100%;padding:12px;background:linear-gradient(135deg,#1e3c72,#2a5298);color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;">
                    <i class="fas fa-list"></i> View All Attempts
                </button>
            </div>
        `;
    });

    html += `
            </div>
        </div>
    `;

    content.innerHTML = html;
    modal.appendChild(content);
    document.body.appendChild(modal);

    // Click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
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
    const names = {
        'ai900': 'AI-900 (Azure AI Fundamentals)',
        'ai102': 'AI-102 (Azure AI Engineer)',
        'ai300': 'AI-300',
        'dump': 'Custom Dump'
    };
    return names[examId] || examId.toUpperCase();
}

window.showExamAttempts = function(examId) {
    const examKey = `${examId}_progress`;
    const progress = JSON.parse(localStorage.getItem(examKey) || '{"attempts": []}');
    const attempts = progress.attempts || [];

    if (attempts.length === 0) {
        alert('No attempts found for this exam.');
        return;
    }

    // Remove existing modal if any
    const existing = document.getElementById('progress-stats-modal');
    if (existing) existing.remove();

    // Create modal
    const modal = document.createElement('div');
    modal.id = 'progress-stats-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;overflow:auto;padding:20px;';

    const content = document.createElement('div');
    content.style.cssText = 'background:white;border-radius:16px;max-width:900px;width:100%;max-height:90vh;overflow:auto;position:relative;';

    let html = `
        <div style="padding:30px;">
            <button onclick="document.getElementById('progress-stats-modal').remove()"
                style="position:absolute;top:15px;right:15px;background:transparent;border:none;font-size:28px;cursor:pointer;color:#666;line-height:1;">
                &times;
            </button>

            <h2 style="margin:0 0 10px 0;color:#1e3c72;font-size:26px;">
                <i class="fas fa-history"></i> ${getExamName(examId)} - Attempt History
            </h2>
            <p style="color:#6c757d;margin-bottom:25px;">All ${attempts.length} attempts sorted by most recent</p>

            <div style="display:grid;gap:12px;">
    `;

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

        html += `
            <div style="background:${passed ? 'linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%)' : 'linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%)'};
                border-radius:10px;padding:16px;border:2px solid ${passed ? '#28a745' : '#dc3545'};">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                    <div>
                        <div style="font-weight:bold;font-size:16px;color:#212529;margin-bottom:4px;">
                            <i class="fas fa-clipboard-check"></i> Attempt #${attemptNum}
                        </div>
                        <div style="font-size:13px;color:#6c757d;">
                            <i class="fas fa-calendar-alt"></i> ${dateStr}
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:20px;">
                        <div style="text-align:center;">
                            <div style="color:#6c757d;font-size:11px;text-transform:uppercase;margin-bottom:3px;">Score</div>
                            <div style="font-size:28px;font-weight:bold;color:${statusColor};">${attempt.score}%</div>
                        </div>
                        <div style="text-align:center;">
                            <div style="color:#6c757d;font-size:11px;text-transform:uppercase;margin-bottom:3px;">Time</div>
                            <div style="font-size:20px;font-weight:bold;color:#007bff;">${attempt.timeSpent}min</div>
                        </div>
                        <div style="background:${statusColor};color:white;padding:8px 16px;border-radius:20px;font-weight:bold;font-size:13px;">
                            <i class="fas ${statusIcon}"></i> ${statusText}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    html += `
            </div>

            <div style="margin-top:20px;text-align:center;">
                <button onclick="document.getElementById('progress-stats-modal').remove();window.showProgressStatistics();"
                    style="padding:10px 20px;background:#6c757d;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;">
                    <i class="fas fa-arrow-left"></i> Back to Overview
                </button>
            </div>
        </div>
    `;

    content.innerHTML = html;
    modal.appendChild(content);
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
};