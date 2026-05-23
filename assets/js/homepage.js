// Dynamic Home Page Management
class HomePage {
constructor() {
this.examSelection = document.getElementById('exam-selection');
this.noExamsSection = document.getElementById('no-exams-section');
this.dropZone = document.getElementById('drop-zone');
this.browseButton = document.getElementById('browse-files');
this.fileInput = null;
this.currentExamInfo = document.getElementById('current-exam-info');
this.startExamCta = document.querySelector('.start-exam-cta');
this.modulesSection = document.getElementById('modules-section');
this.modulesList = document.getElementById('modules-list');
this.resourcesList = document.getElementById('resources-list');
this.heroImportBtn = document.getElementById('hero-import-btn');
this.addExamBtn = document.getElementById('add-exam-btn');
this.heroViewProgressBtn = document.getElementById('hero-view-progress');
this.heroManageExamsBtn = document.getElementById('hero-manage-exams');
this.previewActionBtn = document.getElementById('preview-action-btn');
this.previewActionLabel = this.previewActionBtn?.querySelector('span');
this.previewExamName = document.getElementById('preview-exam-name');
this.previewSubtitle = document.getElementById('preview-exam-subtitle');
this.previewStatusPill = document.getElementById('preview-status-pill');
this.previewLastScore = document.getElementById('preview-last-score');
this.previewLastDate = document.getElementById('preview-last-date');
this.previewBestScore = document.getElementById('preview-best-score');
this.previewBestExam = document.getElementById('preview-best-exam');
this.previewTimeSpent = document.getElementById('preview-time-spent');
this.previewPassRate = document.getElementById('preview-pass-rate');
this.previewHighlights = document.getElementById('preview-highlights');
this.activeExamsCount = document.getElementById('active-exams-count');
this.totalQuestionsCount = document.getElementById('total-questions-count');
this.imageSupportFlag = document.getElementById('image-support-flag');
this.selectedExamId = null;
this.availableExams = new Map();
this.progressRefreshTimer = null;

this.init();
}

async init() {
this.updateLocalOnlyLinks();
await this.loadAvailableExams();
this.placeDetailsPanel();
this.setupEventListeners();
this.setupConfigModal();
this.setupProgressRefreshListeners();
this.refreshProgressUI();
}

updateLocalOnlyLinks() {
const isPublicPages = window.location.hostname === 'rmssantos.github.io';
document.querySelectorAll('.local-only-public-link').forEach((element) => {
	window.ExamApp.setElementHidden(element, isPublicPages);
});
}

placeDetailsPanel(examId = null) {
const detailsPanel = document.getElementById('exam-details-placeholder');
const librarySection = document.querySelector('.exam-library-section');
if (!detailsPanel || !librarySection || !this.examSelection) return;

if (examId) {
	const selectedCard = Array.from(this.examSelection.querySelectorAll('.exam-card'))
		.find(card => card.dataset.exam === examId);
	if (selectedCard) {
		selectedCard.insertAdjacentElement('afterend', detailsPanel);
		return;
	}
}

if (detailsPanel.parentElement !== librarySection) {
	librarySection.insertBefore(detailsPanel, this.examSelection);
}
}

async loadAvailableExams() {
try {
const exams = await window.examManager.detectAvailableExams();
this.availableExams = exams;
window.ExamApp.log('Detected exams:', exams.size, 'exams');
window.ExamApp.log('Exam IDs:', Array.from(exams.keys()));
window.ExamApp.log('All window.userExams:', window.userExams ? Object.keys(window.userExams) : []);
window.ExamApp.log('Active exams:', window.examManager.getActiveExamIds());
this.renderExamCards(exams);
this.updateHeroStats(exams);
if (this.selectedExamId && !exams.has(this.selectedExamId)) {
	this.selectedExamId = null;
}
this.refreshHeroPreview();
} catch (error) {
console.error('Failed to load exams:', error);
this.showNoExamsSection();
this.updateHeroStats(new Map());
}
}

renderExamCards(exams) {
if (exams.size === 0) {
this.showNoExamsSection();
return;
}

// Hide "No Exams" section and show exam cards
this.hideNoExamsSection();
const detailsPanel = document.getElementById('exam-details-placeholder');
if (detailsPanel?.parentElement === this.examSelection) {
	detailsPanel.remove();
}
this.examSelection.innerHTML = '';

const fragment = document.createDocumentFragment();
exams.forEach((examData, examId) => {
const card = this.createExamCard(examId, examData);
fragment.appendChild(card);
});
this.examSelection.appendChild(fragment);
this.placeDetailsPanel();

// Show compact import button when exams exist
this.showCompactImportButton();
this.refreshStudySummaries();
}

updateHeroStats(exams) {
const activeCount = exams.size;
let totalQuestions = 0;
let hasImages = false;

exams.forEach((examData) => {
const metadata = examData.metadata || {};
totalQuestions += metadata.totalQuestions || metadata.questionCount || 0;
if (examData.hasImages) {
	hasImages = true;
}
});

if (this.activeExamsCount) {
this.activeExamsCount.textContent = activeCount;
}
if (this.totalQuestionsCount) {
this.totalQuestionsCount.textContent = totalQuestions || '—';
}
if (this.imageSupportFlag) {
this.imageSupportFlag.textContent = hasImages ? 'Images detected' : 'Auto-detecting';
this.imageSupportFlag.classList.toggle('has-images', hasImages);
}
}

safeIconClass(icon, fallback = 'fas fa-book') {
const value = String(icon || '').trim();
return /^[a-zA-Z0-9 _-]+$/.test(value) ? value : fallback;
}

normalizeModuleName(module) {
return String(typeof module === 'string' ? module : module?.name || module || '').trim();
}

getModuleNames(modules) {
return (Array.isArray(modules) ? modules : [])
	.map(module => this.normalizeModuleName(module))
	.filter(Boolean);
}

safeExternalUrl(url) {
const value = String(url || '').trim();
if (!value) return '#';

try {
const parsed = new URL(value, window.location.href);
return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '#';
} catch (_) {
return '#';
}
}

createIcon(iconClass, extraClass = '') {
const icon = document.createElement('i');
icon.setAttribute('aria-hidden', 'true');
icon.className = [this.safeIconClass(iconClass), extraClass].filter(Boolean).join(' ');
return icon;
}

appendTextElement(parent, tagName, className, text) {
const element = document.createElement(tagName);
if (className) element.className = className;
element.textContent = text;
parent.appendChild(element);
return element;
}

createExamStat(number, label) {
const stat = document.createElement('div');
stat.className = 'exam-stat';
this.appendTextElement(stat, 'span', 'exam-stat-number', number);
this.appendTextElement(stat, 'span', 'exam-stat-label', label);
return stat;
}

createExamCard(examId, examData) {
const metadata = examData.metadata || {};
const questionCount = metadata.questionCount || 45;
const declaredTotalQuestions = Number(metadata.totalQuestions);
const hasDeclaredTotalQuestions = Number.isFinite(declaredTotalQuestions) && Number.isInteger(declaredTotalQuestions) && declaredTotalQuestions > 0;
const totalQuestions = hasDeclaredTotalQuestions ? declaredTotalQuestions : questionCount;

const card = document.createElement('div');
card.className = `exam-card ${this.getCardClass(examId)}`;
card.dataset.exam = examId;

const deleteBtn = document.createElement('button');
deleteBtn.className = 'exam-delete';
deleteBtn.type = 'button';
deleteBtn.title = 'Hide exam';
deleteBtn.setAttribute('aria-label', 'Hide exam');
deleteBtn.appendChild(this.createIcon('fas fa-eye-slash'));
card.appendChild(deleteBtn);

this.appendTextElement(card, 'div', 'exam-badge', metadata.badge || 'Custom');
card.appendChild(this.createIcon(metadata.icon || 'fas fa-book', 'exam-icon'));
this.appendTextElement(card, 'div', 'exam-title', metadata.name || examId.toUpperCase());
this.appendTextElement(card, 'div', 'exam-subtitle', metadata.fullName || 'Custom Exam');

const stats = document.createElement('div');
stats.className = 'exam-stats';
stats.appendChild(this.createExamStat(String(questionCount), 'Questions'));
stats.appendChild(this.createExamStat(String(metadata.duration || 45), 'Minutes'));
stats.appendChild(this.createExamStat(`${metadata.passScore || 75}%`, 'Pass Score'));
card.appendChild(stats);

if (hasDeclaredTotalQuestions) {
const totalLabel = totalQuestions > questionCount
	? `From ${totalQuestions} total questions`
	: `${totalQuestions} total questions in dump`;
this.appendTextElement(card, 'div', 'exam-total-info', totalLabel);
}

const studyInfo = document.createElement('div');
studyInfo.className = 'exam-study-info';
studyInfo.dataset.studySummaryFor = examId;
studyInfo.textContent = 'Study: —';
card.appendChild(studyInfo);

const actions = document.createElement('div');
actions.className = 'exam-card-actions';

const startButton = document.createElement('button');
startButton.type = 'button';
startButton.className = 'exam-card-start';
startButton.appendChild(this.createIcon('fas fa-play'));
startButton.appendChild(document.createTextNode(' Start'));
startButton.addEventListener('click', (e) => {
	e.stopPropagation();
	this.selectExam(examId);
	this.startSelectedExam();
});
actions.appendChild(startButton);

const studyButton = document.createElement('button');
studyButton.type = 'button';
studyButton.className = 'exam-card-study';
studyButton.appendChild(this.createIcon('fas fa-brain'));
studyButton.appendChild(document.createTextNode(' Study'));
studyButton.addEventListener('click', (e) => {
	e.stopPropagation();
	this.selectExam(examId);
	this.startSelectedExam('study');
});
actions.appendChild(studyButton);
card.appendChild(actions);

if (examData.hasImages) {
const feature = document.createElement('div');
feature.className = 'exam-feature';
feature.appendChild(this.createIcon('fas fa-images'));
feature.appendChild(document.createTextNode(' With Images'));
card.appendChild(feature);
}

// Bind deactivate button via addEventListener instead of inline onclick
if (deleteBtn) {
deleteBtn.addEventListener('click', (e) => {
	e.stopPropagation();
	homepage.deactivateExam(examId);
});
}

card.addEventListener('click', (e) => {
if (!e.target.closest('.exam-delete')) {
	this.selectExam(examId);
}
});

return card;
}

getCardClass(examId) {
const cardClasses = {
	sc900: 'exam-sc900',
	ab730: 'exam-ab730',
	ab731: 'exam-ab731'
};
return cardClasses[String(examId || '').toLowerCase()] || 'custom';
}

selectExam(examId) {
// Update the global exam simulator with the selected exam
if (window.examSimulator) {
window.examSimulator.currentExam = examId;

// Load exam data into the simulator
const examData = window.userExams[examId];
if (examData) {
	window.examSimulator.examData[examId] = {
		name: examData.metadata.name,
		fullName: examData.metadata.fullName,
		duration: examData.metadata.duration,
		questionCount: examData.metadata.questionCount,
		passScore: examData.metadata.passScore,
		questions: examData.questions,
		modules: examData.metadata.modules || [],
		resources: examData.metadata.resources || []
	};
}
}

// Always update UI regardless of examSimulator state
this.selectedExamId = examId;
this.highlightSelectedCard(examId);
this.showExamDetailsPlaceholder(examId);
this.refreshHeroPreview();
}

showExamInfo(examId) {
const examData = window.userExams[examId];
if (!examData) return;
const metadata = examData.metadata || {};

const durationEl = document.getElementById('exam-duration');
const questionsEl = document.getElementById('exam-questions');
const passScoreEl = document.getElementById('exam-pass-score');
const imagesEl = document.getElementById('exam-images');

document.getElementById('current-exam-name').textContent = metadata.name || examId.toUpperCase();
if (durationEl) durationEl.textContent = `${metadata.duration || 45} minutes`;
if (questionsEl) questionsEl.textContent = `${metadata.questionCount || examData.questions.length} questions`;
if (passScoreEl) passScoreEl.textContent = `${metadata.passScore || 70}%`;
if (imagesEl) {
imagesEl.textContent = examData.hasImages ? 'Includes images' : 'No images detected';
imagesEl.classList.toggle('has-images', !!examData.hasImages);
}

if (this.currentExamInfo) this.currentExamInfo.style.display = 'block';
if (this.startExamCta) this.startExamCta.style.display = 'block';

this.renderModules(metadata.modules);
this.renderResources(metadata.resources);
}

renderModules(modules) {
if (!this.modulesSection || !this.modulesList) return;
if (Array.isArray(modules) && modules.length > 0) {
this.modulesSection.style.display = 'block';
this.modulesList.innerHTML = '';
modules.forEach(module => {
const li = document.createElement('li');
const icon = typeof module === 'string' ? 'fas fa-check-circle' : module.icon || 'fas fa-check-circle';
const name = typeof module === 'string' ? module : module.name || String(module || '');
li.appendChild(this.createIcon(icon));
li.appendChild(document.createTextNode(` ${name}`));
this.modulesList.appendChild(li);
});
} else {
this.modulesSection.style.display = 'none';
this.modulesList.innerHTML = '';
}
}

renderResources(resources) {
if (!this.resourcesList) return;
if (Array.isArray(resources) && resources.length > 0) {
this.resourcesList.innerHTML = '';
resources.forEach(resource => {
const link = document.createElement('a');
link.href = this.safeExternalUrl(resource.url);
link.target = '_blank';
link.rel = 'noopener noreferrer';
link.className = 'resource-link';
link.appendChild(this.createIcon(resource.icon || 'fas fa-link'));
link.appendChild(document.createTextNode(` ${resource.name || 'Reference'}`));
this.resourcesList.appendChild(link);
});
} else {
this.resourcesList.innerHTML = '';
this.appendTextElement(this.resourcesList, 'p', 'muted', 'Add resource links in metadata to show quick shortcuts.');
}
}

highlightSelectedCard(examId) {
document.querySelectorAll('.exam-card').forEach(card => {
card.classList.toggle('selected', card.dataset.exam === examId);
});
}

showExamDetailsPlaceholder(examId) {
const examData = window.userExams[examId];
if (!examData) return;

const metadata = examData.metadata || {};
const stats = this.getProgressStats(examId);
const placeholder = document.getElementById('exam-details-placeholder');
this.placeDetailsPanel(examId);

// Populate details
document.getElementById('details-exam-name').textContent = metadata.name || examId.toUpperCase();
document.getElementById('details-exam-subtitle').textContent = metadata.fullName || 'Practice exam';
document.getElementById('details-exam-duration').textContent = `${metadata.duration || 45} min`;
document.getElementById('details-exam-questions').textContent = `${metadata.questionCount || examData.questions.length}`;
document.getElementById('details-exam-pass-score').textContent = `${metadata.passScore || 70}%`;
document.getElementById('details-exam-images').textContent = examData.hasImages ? 'Yes' : 'No';

// Populate progress
this.renderDetailsProgress(examId, stats);
this.updateDetailsStudySummary(examId);

// Populate modules and resources
const modulesSection = document.getElementById('details-modules-section');
const modulesList = document.getElementById('details-modules-list');
const resourcesList = document.getElementById('details-resources-list');
const moduleNames = this.getModuleNames(metadata.modules);

if (moduleNames.length > 0) {
modulesSection.style.display = 'block';
modulesList.innerHTML = '';
modulesList.className = 'modules-list selectable-list';
modulesList.dataset.exam = examId;

const moduleQuestionCounts = new Map();
examData.questions.forEach(question => {
	const moduleKey = this.normalizeModuleName(question.module).toLowerCase();
	if (!moduleKey) return;
	moduleQuestionCounts.set(moduleKey, (moduleQuestionCounts.get(moduleKey) || 0) + 1);
});

const setModuleChecked = (item, checked) => {
	item.classList.toggle('checked', checked);
	item.setAttribute('aria-checked', String(checked));
};

const toggleModuleItem = item => {
	setModuleChecked(item, !item.classList.contains('checked'));
	this.updateSelectedQuestionsCount(examId);
};

// Clear any existing controls first to avoid duplicates
const existingControls = modulesSection.querySelector('.modules-select-controls');
if (existingControls) {
	existingControls.remove();
}

// Create Select All / Deselect All controls
const selectControls = document.createElement('div');
selectControls.className = 'modules-select-controls';

const selectAllBtn = document.createElement('button');
selectAllBtn.className = 'modules-select-btn';
selectAllBtn.type = 'button';
selectAllBtn.textContent = 'Select All';

const separator = document.createElement('span');
separator.className = 'modules-select-separator';
separator.textContent = '|';

const selectNoneBtn = document.createElement('button');
selectNoneBtn.className = 'modules-select-btn';
selectNoneBtn.type = 'button';
selectNoneBtn.textContent = 'Deselect All';

selectControls.appendChild(selectAllBtn);
selectControls.appendChild(separator);
selectControls.appendChild(selectNoneBtn);

modulesList.parentNode.insertBefore(selectControls, modulesList);

metadata.modules.forEach(module => {
	const name = this.normalizeModuleName(module);
	if (!name) return;
	const iconClass = typeof module === 'string' ? 'fas fa-graduation-cap' : module.icon || 'fas fa-graduation-cap';
	const qCount = moduleQuestionCounts.get(name.toLowerCase()) || 0;

	const li = document.createElement('li');
	li.className = 'checked';
	li.dataset.module = name;
	li.tabIndex = 0;
	li.setAttribute('role', 'checkbox');
	li.setAttribute('aria-checked', 'true');

	const contentWrapper = document.createElement('div');
	contentWrapper.className = 'module-item-content';

	const checkboxWrapper = document.createElement('div');
	checkboxWrapper.className = 'module-checkbox-wrapper';

	const checkboxCustom = document.createElement('div');
	checkboxCustom.className = 'module-checkbox-custom';

	checkboxWrapper.appendChild(checkboxCustom);
	contentWrapper.appendChild(checkboxWrapper);

	if (iconClass) {
		contentWrapper.appendChild(this.createIcon(iconClass, 'module-icon'));
	}

	const titleSpan = document.createElement('span');
	titleSpan.className = 'module-item-title';
	titleSpan.textContent = name;
	contentWrapper.appendChild(titleSpan);

	const badgeSpan = document.createElement('span');
	badgeSpan.className = 'module-qcount-badge';
	badgeSpan.textContent = `${qCount} Qs`;

	li.appendChild(contentWrapper);
	li.appendChild(badgeSpan);

	li.addEventListener('click', () => toggleModuleItem(li));
	li.addEventListener('keydown', event => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			toggleModuleItem(li);
		}
	});

	modulesList.appendChild(li);
});

// Click handlers for Select All / Deselect All
selectAllBtn.addEventListener('click', () => {
	modulesList.querySelectorAll('li').forEach(li => setModuleChecked(li, true));
	this.updateSelectedQuestionsCount(examId);
});

selectNoneBtn.addEventListener('click', () => {
	modulesList.querySelectorAll('li').forEach(li => setModuleChecked(li, false));
	this.updateSelectedQuestionsCount(examId);
});

// Initialize selected questions count
this.updateSelectedQuestionsCount(examId);

if (metadata.resources && metadata.resources.length > 0) {
	resourcesList.innerHTML = '';
	metadata.resources.forEach(resource => {
	const link = document.createElement('a');
	link.href = this.safeExternalUrl(resource.url);
	link.target = '_blank';
	link.rel = 'noopener noreferrer';
	link.appendChild(this.createIcon(resource.icon || 'fas fa-link'));
	link.appendChild(document.createTextNode(` ${resource.name || 'Reference'}`));
	resourcesList.appendChild(link);
	});
} else {
	resourcesList.innerHTML = '';
	this.appendTextElement(resourcesList, 'p', 'muted', 'No resources available');
}
} else {
modulesSection.style.display = 'none';
delete modulesList.dataset.exam;
// Clear controls if hidden
const existingControls = modulesSection.querySelector('.modules-select-controls');
if (existingControls) {
	existingControls.remove();
}
}

// Setup start button
const startBtn = document.getElementById('details-start-exam');
startBtn.onclick = () => {
this.startSelectedExam();
};

const studyBtn = document.getElementById('details-start-study');
if (studyBtn) {
studyBtn.onclick = () => {
this.startSelectedExam('study');
};
}

const reviewBtn = document.getElementById('details-review-attempts');
if (reviewBtn) {
reviewBtn.onclick = () => {
this.openAttemptHistory(examId);
};
}

// Setup close button
const closeBtn = document.getElementById('btn-close-details');
closeBtn.onclick = () => {
placeholder.classList.remove('visible');
};

// Show placeholder and keep the details panel close to the selected card.
placeholder.classList.add('visible');
setTimeout(() => {
placeholder.scrollIntoView({ behavior: 'smooth', block: 'start' });
}, 100);
}

handlePreviewAction() {
if (this.selectedExamId) {
this.startSelectedExam();
} else {
this.scrollToExamLibrary();
}
}

startSelectedExam(mode = 'exam') {
	if (!this.selectedExamId) {
		window.showCustomAlert('Select an Exam', 'Please select an exam card from the library before proceeding.', 'warning');
		return;
	}

	const examData = window.userExams[this.selectedExamId];
	const metadata = examData?.metadata || {};
	const moduleNames = this.getModuleNames(metadata.modules);
	const routeParams = { exam: this.selectedExamId };
	if (mode === 'study') {
		routeParams.mode = 'study';
	}

	if (moduleNames.length > 0) {
		const modulesList = document.getElementById('details-modules-list');
		const panelMatchesExam = modulesList?.dataset.exam === this.selectedExamId;
		const selectedModules = panelMatchesExam
			? Array.from(modulesList.querySelectorAll('li.checked')).map(li => li.dataset.module).filter(Boolean)
			: moduleNames;

		if (selectedModules.length === 0) {
			window.showCustomAlert('No Modules Selected', 'Please select at least one module to start practicing.', 'warning');
			return;
		}

		routeParams.modules = JSON.stringify(selectedModules);
	}

	const simulator = window.ExamApp?.examSimulator || window.examSimulator;
	if (simulator?.currentExam !== this.selectedExamId) {
		this.selectExam(this.selectedExamId);
	}

	const routeName = mode === 'study' ? 'study' : 'exam';
	const url = window.ExamApp.router?.buildUrl(routeName, routeParams)
		|| `exam.html?${new URLSearchParams(routeParams).toString()}`;
	window.open(url, '_blank');
}

updateSelectedQuestionsCount(examId) {
	const examData = window.userExams[examId];
	if (!examData) return;

	const metadata = examData.metadata || {};
	const modulesList = document.getElementById('details-modules-list');
		if (!modulesList) return;
	const checkedItems = modulesList.querySelectorAll('li.checked');

	if (!metadata.modules || metadata.modules.length === 0) {
		const total = examData.questions.length;
		document.getElementById('details-exam-questions').textContent = `${metadata.questionCount || total}`;
		return;
	}

	const selectedModuleNames = Array.from(checkedItems)
		.map(li => this.normalizeModuleName(li.dataset.module).toLowerCase())
		.filter(Boolean);

	const selectedPoolCount = examData.questions.filter(q => {
		return q.module && selectedModuleNames.includes(q.module.trim().toLowerCase());
	}).length;

	const totalPoolCount = examData.questions.length;

	document.getElementById('details-exam-questions').textContent = `${selectedPoolCount} / ${totalPoolCount}`;
}

scrollToExamLibrary() {
const library = document.querySelector('.exam-library');
if (library) {
library.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
}

refreshHeroPreview() {
if (!this.previewExamName) return;
const fallbackExamId = this.getMostRecentExamWithProgress();
const examId = this.selectedExamId || fallbackExamId;
const examData = examId ? (this.availableExams.get(examId) || window.userExams[examId]) : null;
const metadata = examData?.metadata || {};
const stats = examId ? this.getProgressStats(examId) : null;

if (examData) {
this.previewExamName.textContent = metadata.name || examId.toUpperCase();
this.previewSubtitle.textContent = metadata.fullName || 'Ready when you are.';
if (stats) {
	this.previewLastScore.textContent = `${stats.lastScore}%`;
	this.previewLastDate.textContent = stats.lastDate ? `Last attempt ${this.formatRelativeDate(stats.lastDate)}` : 'Recent attempt';
	this.previewBestScore.textContent = stats.bestScore != null ? `${stats.bestScore}%` : '—';
	this.previewBestExam.textContent = `${stats.attempts} attempt${stats.attempts === 1 ? '' : 's'}`;
	this.previewTimeSpent.textContent = this.formatDuration(stats.avgTime);
	this.previewPassRate.textContent = stats.passRate != null ? `Pass rate ${stats.passRate}%` : 'Pass rate —';
	if (this.previewStatusPill) {
		this.setStatusPill(stats.passRate >= 70 ? 'fas fa-check' : 'fas fa-flag', stats.passRate >= 70 ? 'On track' : 'Keep practicing');
		this.previewStatusPill.classList.toggle('success', stats.passRate >= 70);
		this.previewStatusPill.classList.toggle('warning', stats.passRate >= 70 ? false : !!stats.attempts);
	}
} else {
	this.previewLastScore.textContent = '—';
	this.previewLastDate.textContent = 'No attempts yet';
	this.previewBestScore.textContent = '—';
	this.previewBestExam.textContent = 'No sessions yet';
	this.previewTimeSpent.textContent = '—';
	this.previewPassRate.textContent = 'Pass rate —';
	if (this.previewStatusPill) {
		this.previewStatusPill.classList.remove('success', 'warning');
		this.setStatusPill('fas fa-hourglass-half', 'Waiting for attempts');
	}
}
this.updatePreviewHighlights(metadata, examData);
} else {
this.previewExamName.textContent = 'You\'re ready to practice';
this.previewSubtitle.textContent = 'Import an exam pack or open the editor to get started.';
this.previewLastScore.textContent = '—';
this.previewLastDate.textContent = 'No attempts yet';
this.previewBestScore.textContent = '—';
this.previewBestExam.textContent = '—';
this.previewTimeSpent.textContent = '—';
this.previewPassRate.textContent = 'Pass rate —';
if (this.previewStatusPill) {
	this.previewStatusPill.classList.remove('success', 'warning');
	this.setStatusPill('fas fa-hourglass-half', 'Waiting for attempts');
}
if (this.previewHighlights) {
	this.renderPreviewChips(['Import exams to begin', 'Track progress per exam', 'Detailed analysis unlocked']);
}
}

if (this.previewActionLabel) {
this.previewActionLabel.textContent = this.selectedExamId ? 'Start practice now' : 'Browse exam library';
}
}

setupProgressRefreshListeners() {
window.addEventListener('storage', (event) => {
if (event.storageArea === localStorage && this.isProgressStorageKey(event.key)) {
	this.scheduleProgressRefresh();
}
});

window.addEventListener('progress-updated', () => this.scheduleProgressRefresh());
window.addEventListener('study-progress-updated', () => this.scheduleProgressRefresh());
window.addEventListener('focus', () => this.scheduleProgressRefresh());
window.addEventListener('pageshow', () => this.scheduleProgressRefresh());
document.addEventListener('visibilitychange', () => {
if (!document.hidden) this.scheduleProgressRefresh();
});
}

isProgressStorageKey(key) {
return key === null || key === window.ExamApp.STORAGE_KEYS.progress || String(key).endsWith('_progress');
}

scheduleProgressRefresh() {
if (this.progressRefreshTimer) clearTimeout(this.progressRefreshTimer);
this.progressRefreshTimer = setTimeout(() => {
	this.progressRefreshTimer = null;
	this.refreshProgressUI();
}, 50);
}

refreshProgressUI() {
if (typeof window.examSimulator?.updateProgressDisplay === 'function') {
	window.examSimulator.updateProgressDisplay();
}

this.refreshSelectedExamProgress();
this.refreshStudySummaries();
this.refreshHeroPreview();
}

async getStudySummary(examId) {
const examData = this.availableExams.get(examId) || window.userExams[examId];
const questions = Array.isArray(examData?.questions) ? examData.questions : [];
if (!questions.length || !window.ExamApp.studyStorage) return null;
try {
	return await window.ExamApp.studyStorage.getExamSummary(examId, questions);
} catch (error) {
	window.ExamApp.warn('Failed to load study summary for', examId, error);
	return null;
}
}

formatStudyDue(summary) {
if (!summary) return 'Study: —';
const due = Number(summary.dueReviewCount || 0);
const weak = Number(summary.weakCount || 0);
const fresh = Number(summary.newCount || 0);
return `Study: ${weak} weak · ${due} due · ${fresh} new`;
}

async refreshStudySummaries() {
const summaryNodes = Array.from(document.querySelectorAll('[data-study-summary-for]'));
await Promise.all(summaryNodes.map(async (node) => {
	const examId = node.dataset.studySummaryFor;
	const summary = await this.getStudySummary(examId);
	node.textContent = this.formatStudyDue(summary);
}));

if (this.selectedExamId) {
	this.updateDetailsStudySummary(this.selectedExamId);
}
}

async updateDetailsStudySummary(examId) {
const queueEl = document.getElementById('details-study-queue');
const masteredEl = document.getElementById('details-mastered');
const summary = await this.getStudySummary(examId);
if (!summary) {
	if (queueEl) queueEl.textContent = '—';
	if (masteredEl) masteredEl.textContent = '—';
	return;
}
const due = Number(summary.dueReviewCount || 0);
const weak = Number(summary.weakCount || 0);
const fresh = Number(summary.newCount || 0);
if (queueEl) queueEl.textContent = `${weak} weak · ${due} due · ${fresh} new`;
if (masteredEl) masteredEl.textContent = `${summary.learnedCount || 0}/${summary.totalQuestions || 0}`;

const stats = this.getProgressStats(examId);
this.renderDetailsProgress(examId, stats, summary);
}

renderDetailsProgress(examId, stats, studySummary = null) {
const readiness = document.getElementById('details-readiness');
const lastAttempt = document.getElementById('details-last-attempt');
const bestScore = document.getElementById('details-best-score');
const trend = document.getElementById('details-progress-trend');
const reviewBtn = document.getElementById('details-review-attempts');

if (readiness) readiness.textContent = this.getReadinessLabel(stats, studySummary);
if (lastAttempt) {
	lastAttempt.textContent = stats?.lastScore != null
		? `${stats.lastScore}% · ${this.formatRelativeDate(stats.lastDate) || 'recent'}`
		: 'No attempts';
}
if (bestScore) bestScore.textContent = stats?.bestScore != null ? `${stats.bestScore}%` : '—';
if (trend) trend.textContent = stats?.trendLabel || '—';
if (reviewBtn) {
	const hasAttempts = Boolean(stats?.attempts);
	reviewBtn.disabled = !hasAttempts;
	reviewBtn.classList.toggle('is-disabled', !hasAttempts);
	reviewBtn.title = hasAttempts ? 'Review previous attempts' : 'Complete an exam to unlock attempt review';
}
}

getReadinessLabel(stats, studySummary = null) {
if (!stats?.attempts && !studySummary?.seenCount) return 'Not enough data';
const weak = Number(studySummary?.weakCount || 0);
if (stats?.lastScore != null && stats.lastScore < 70) return 'Needs work';
if (weak > 0) return 'Review weak spots';
if (stats?.passRate >= 70 || stats?.lastScore >= 70) return 'On track';
return 'Building';
}

refreshSelectedExamProgress() {
if (!this.selectedExamId) return;

const placeholder = document.getElementById('exam-details-placeholder');
if (!placeholder?.classList.contains('visible')) return;

const stats = this.getProgressStats(this.selectedExamId);
this.renderDetailsProgress(this.selectedExamId, stats);
}

updatePreviewHighlights(metadata, examData) {
if (!this.previewHighlights) return;
const chips = [];
const questionCount = metadata.questionCount || examData?.questions?.length;
const duration = metadata.duration || 0;
if (questionCount) chips.push(`${questionCount} questions`);
if (duration) chips.push(`${duration} minutes`);
if (metadata.modules?.length) chips.push(`${metadata.modules.length} modules`);
if (examData?.hasImages) chips.push('Includes images');
if (chips.length === 0) chips.push('Import data to unlock stats');
this.renderPreviewChips(chips);
}

setStatusPill(iconClass, label) {
if (!this.previewStatusPill) return;
this.previewStatusPill.innerHTML = '';
this.previewStatusPill.appendChild(this.createIcon(iconClass));
this.previewStatusPill.appendChild(document.createTextNode(` ${label}`));
}

renderPreviewChips(chips) {
if (!this.previewHighlights) return;
this.previewHighlights.innerHTML = '';
chips.forEach(chip => {
this.appendTextElement(this.previewHighlights, 'span', 'flag-chip', chip);
});
}

getProgressStats(examId) {
try {
const raw = localStorage.getItem(`${examId}_progress`);
if (!raw) return null;
const progress = JSON.parse(raw);
if (!progress?.attempts?.length) return null;
const attempts = progress.attempts;
const lastAttempt = attempts[attempts.length - 1];
const previousAttempt = attempts.length > 1 ? attempts[attempts.length - 2] : null;
const avgTime = attempts.reduce((sum, attempt) => sum + (attempt.timeSpent || 0), 0) / attempts.length;
const passRate = attempts.length ? Math.round(((progress.totalPassed || 0) / attempts.length) * 100) : null;
const trendDelta = previousAttempt ? Number(lastAttempt.score || 0) - Number(previousAttempt.score || 0) : null;
const detailedAttempts = attempts.filter(attempt => Array.isArray(attempt.questionResults) && attempt.questionResults.length > 0).length;
return {
	attempts: attempts.length,
	lastScore: lastAttempt.score,
	lastDate: lastAttempt.date,
	bestScore: progress.bestScore ?? lastAttempt.score,
	avgTime,
	passRate,
	trendDelta,
	trendLabel: trendDelta == null ? '—' : `${trendDelta >= 0 ? '+' : ''}${trendDelta} pts`,
	detailedAttempts,
	lastAttempt
};
} catch (error) {
window.ExamApp.warn('Failed to parse progress stats for', examId, error);
return null;
}
}

getProgressForExam(examId) {
try {
	const raw = localStorage.getItem(`${examId}_progress`);
	const progress = raw ? JSON.parse(raw) : null;
	return progress && Array.isArray(progress.attempts) ? progress : { attempts: [] };
} catch (error) {
	window.ExamApp.warn('Failed to parse progress for', examId, error);
	return { attempts: [] };
}
}

openAttemptHistory(examId) {
const progress = this.getProgressForExam(examId);
const attempts = progress.attempts || [];
if (attempts.length === 0) {
	window.showCustomAlert('No Attempts', 'Complete an exam attempt first to unlock review history.', 'info');
	return;
}

document.getElementById('attempt-history-modal')?.remove();
const overlay = document.createElement('div');
overlay.id = 'attempt-history-modal';
overlay.className = 'progress-modal-overlay attempt-review-overlay';

const content = document.createElement('div');
content.className = 'progress-modal-content attempt-history-content';
const closeBtn = this.createModalCloseButton('Close attempt history', () => overlay.remove());
content.appendChild(closeBtn);

const title = document.createElement('h2');
title.className = 'progress-modal-title';
title.appendChild(this.createIcon('fas fa-history'));
title.appendChild(document.createTextNode(` ${this.getExamName(examId)} Attempts`));
content.appendChild(title);

const subtitle = document.createElement('p');
subtitle.className = 'attempt-history-subtitle';
subtitle.textContent = `${attempts.length} attempt${attempts.length === 1 ? '' : 's'} saved locally in this browser.`;
content.appendChild(subtitle);

const list = document.createElement('div');
list.className = 'attempt-history-list';
attempts.slice().reverse().forEach((attempt, reverseIndex) => {
	const originalIndex = attempts.length - reverseIndex - 1;
	list.appendChild(this.createAttemptHistoryCard(examId, attempt, originalIndex));
});
content.appendChild(list);

overlay.appendChild(content);
overlay.addEventListener('click', event => {
	if (event.target === overlay) overlay.remove();
});
document.body.appendChild(overlay);
window.ExamApp?.analytics?.trackEvent('attempt_history_opened');
}

createModalCloseButton(label, onClick) {
const button = document.createElement('button');
button.className = 'progress-modal-close';
button.type = 'button';
button.setAttribute('aria-label', label);
button.textContent = '×';
button.addEventListener('click', onClick);
return button;
}

getExamName(examId) {
const examData = this.getExamDataForReview(examId);
return examData?.metadata?.name || examId.toUpperCase();
}

getExamDataForReview(examId) {
return this.availableExams.get(examId)
	|| window.examManager?.availableExams?.get?.(examId)
	|| window.userExams?.[examId]
	|| null;
}

createAttemptHistoryCard(examId, attempt, originalIndex) {
const card = document.createElement('article');
card.className = `attempt-history-card ${attempt.passed ? 'passed' : 'failed'}`;

const summary = document.createElement('div');
summary.className = 'attempt-history-summary';

const title = document.createElement('div');
title.className = 'attempt-history-title';
title.appendChild(this.createIcon(attempt.passed ? 'fas fa-check-circle' : 'fas fa-times-circle'));
title.appendChild(document.createTextNode(` Attempt #${originalIndex + 1}`));
summary.appendChild(title);

const date = document.createElement('div');
date.className = 'attempt-history-date';
date.textContent = this.formatAttemptDate(attempt.date);
summary.appendChild(date);
card.appendChild(summary);

const metrics = document.createElement('div');
metrics.className = 'attempt-history-metrics';
metrics.appendChild(this.createSmallMetric('Score', `${attempt.score ?? 0}%`));
metrics.appendChild(this.createSmallMetric('Time', `${attempt.timeSpent ?? 0} min`));
metrics.appendChild(this.createSmallMetric('Questions', String(attempt.questionCount || attempt.questionResults?.length || '—')));
card.appendChild(metrics);

const actions = document.createElement('div');
actions.className = 'attempt-history-actions';
const hasDetails = Array.isArray(attempt.questionResults) && attempt.questionResults.length > 0;

const reviewButton = document.createElement('button');
reviewButton.type = 'button';
reviewButton.className = 'attempt-action-btn primary';
reviewButton.disabled = !hasDetails;
reviewButton.appendChild(this.createIcon('fas fa-list-check'));
reviewButton.appendChild(document.createTextNode(hasDetails ? 'Review' : 'Review unavailable'));
reviewButton.addEventListener('click', () => this.openAttemptReview(examId, attempt, originalIndex));
actions.appendChild(reviewButton);

const missedCount = this.getAttemptMissedQuestionIds(attempt).length;
const studyButton = document.createElement('button');
studyButton.type = 'button';
studyButton.className = 'attempt-action-btn secondary';
studyButton.disabled = missedCount === 0;
studyButton.appendChild(this.createIcon('fas fa-brain'));
studyButton.appendChild(document.createTextNode(missedCount > 0 ? `Study missed (${missedCount})` : 'No misses'));
studyButton.addEventListener('click', () => this.startMissedStudy(examId, attempt));
actions.appendChild(studyButton);
card.appendChild(actions);

return card;
}

createSmallMetric(label, value) {
const metric = document.createElement('div');
metric.className = 'attempt-small-metric';
this.appendTextElement(metric, 'span', 'attempt-small-label', label);
this.appendTextElement(metric, 'strong', 'attempt-small-value', value);
return metric;
}

formatAttemptDate(dateString) {
const date = new Date(dateString);
if (Number.isNaN(date.getTime())) return 'Unknown date';
return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

openAttemptReview(examId, attempt, originalIndex) {
if (!Array.isArray(attempt.questionResults) || attempt.questionResults.length === 0) {
	window.showCustomAlert('Review Unavailable', 'Detailed review is available for attempts completed after this feature was added.', 'info');
	return;
}

document.getElementById('attempt-review-modal')?.remove();
const overlay = document.createElement('div');
overlay.id = 'attempt-review-modal';
overlay.className = 'progress-modal-overlay attempt-review-overlay';

const content = document.createElement('div');
content.className = 'progress-modal-content attempt-review-content';
content.appendChild(this.createModalCloseButton('Close attempt review', () => overlay.remove()));

const title = document.createElement('h2');
title.className = 'progress-modal-title';
title.appendChild(this.createIcon('fas fa-clipboard-check'));
title.appendChild(document.createTextNode(` ${this.getExamName(examId)} · Attempt #${originalIndex + 1}`));
content.appendChild(title);

const summary = document.createElement('div');
summary.className = 'attempt-review-summary';
summary.appendChild(this.createSmallMetric('Score', `${attempt.score ?? 0}%`));
summary.appendChild(this.createSmallMetric('Correct', String(attempt.correctCount ?? attempt.questionResults.filter(result => result.correct).length)));
summary.appendChild(this.createSmallMetric('Missed', String(this.getAttemptMissedQuestionIds(attempt).length)));
summary.appendChild(this.createSmallMetric('Time', `${attempt.timeSpent ?? 0} min`));
content.appendChild(summary);

const missedIds = this.getAttemptMissedQuestionIds(attempt);
const actions = document.createElement('div');
actions.className = 'attempt-review-actions';
const studyMissed = document.createElement('button');
studyMissed.type = 'button';
studyMissed.className = 'attempt-action-btn secondary';
studyMissed.disabled = missedIds.length === 0;
studyMissed.appendChild(this.createIcon('fas fa-brain'));
studyMissed.appendChild(document.createTextNode(missedIds.length > 0 ? `Study missed (${missedIds.length})` : 'No missed questions'));
studyMissed.addEventListener('click', () => this.startMissedStudy(examId, attempt));
actions.appendChild(studyMissed);
content.appendChild(actions);

const list = document.createElement('div');
list.className = 'attempt-review-list';
attempt.questionResults.forEach(result => {
	list.appendChild(this.createAttemptReviewItem(examId, result));
});
content.appendChild(list);

overlay.appendChild(content);
overlay.addEventListener('click', event => {
	if (event.target === overlay) overlay.remove();
});
document.body.appendChild(overlay);
window.ExamApp?.analytics?.trackAttemptReviewOpened?.(examId, {
	hasQuestionDetails: true,
	questionCount: attempt.questionResults.length
});
}

createAttemptReviewItem(examId, result) {
const question = this.findQuestionById(examId, result.questionId);
const item = document.createElement('article');
const status = result.skipped ? 'skipped' : (result.correct ? 'correct' : 'incorrect');
item.className = `attempt-review-item ${status}`;

const header = document.createElement('div');
header.className = 'attempt-review-item-header';
this.appendTextElement(header, 'span', 'attempt-review-number', `Q${result.order || ''}`.trim());
const statusEl = this.appendTextElement(header, 'span', `attempt-review-status ${status}`, result.skipped ? 'Skipped' : (result.correct ? 'Correct' : 'Incorrect'));
statusEl.prepend(this.createIcon(result.skipped ? 'fas fa-minus-circle' : (result.correct ? 'fas fa-check-circle' : 'fas fa-times-circle')));
item.appendChild(header);

if (!question) {
	this.appendTextElement(item, 'div', 'attempt-review-question missing', 'Question no longer exists in the current dump.');
	return item;
}

this.appendTextElement(item, 'div', 'attempt-review-question', question.question || 'Question text is unavailable.');

const answers = document.createElement('div');
answers.className = 'attempt-review-answers';
this.appendAnswerRow(answers, 'Your Answer', this.formatStoredAnswer(question, result.userAnswer));
if (!result.correct && question.correct !== undefined && question.correct !== null) {
	this.appendAnswerRow(answers, 'Correct Answer', this.formatStoredAnswer(question, question.correct), 'correct');
}
item.appendChild(answers);

if (question?.explanation) {
	const explanation = document.createElement('div');
	explanation.className = 'attempt-review-explanation';
	this.appendTextElement(explanation, 'span', 'attempt-review-label', 'Justification');
	this.appendTextElement(explanation, 'p', '', question.explanation);
	item.appendChild(explanation);
}

return item;
}

appendAnswerRow(parent, label, value, extraClass = '') {
const row = document.createElement('div');
row.className = 'attempt-answer-row';
this.appendTextElement(row, 'span', 'attempt-review-label', label);
this.appendTextElement(row, 'strong', ['attempt-answer-value', extraClass].filter(Boolean).join(' '), value);
parent.appendChild(row);
}

findQuestionById(examId, questionId) {
const questions = this.getExamDataForReview(examId)?.questions || [];
const normalize = window.ExamApp.studyScheduler?.normalizeQuestionId || (value => String(value || '').trim());
const wanted = normalize(questionId);
return questions.find((question, index) => normalize(question?.id || `question-${index + 1}`) === wanted) || null;
}

formatStoredAnswer(question, answer) {
if (!question || answer === null || answer === undefined || answer === '') return 'Not answered';
const type = window.ExamApp.normalizeQuestionType(question);
if (type === 'YES_NO_MATRIX') {
	return (Array.isArray(answer) ? answer : []).map(value => value === 0 ? 'Yes' : 'No').join(', ') || 'Not answered';
}
if (Array.isArray(answer)) {
	return answer.map(index => Number.isInteger(index) ? String.fromCharCode(65 + index) : String(index)).join(', ') || 'Not answered';
}
if (Number.isInteger(answer)) return String.fromCharCode(65 + answer);
return String(answer);
}

getAttemptMissedQuestionIds(attempt) {
return (Array.isArray(attempt?.questionResults) ? attempt.questionResults : [])
	.filter(result => result.skipped || !result.correct)
	.map(result => String(result.questionId || '').trim())
	.filter(Boolean);
}

startMissedStudy(examId, attempt) {
const questionIds = this.getAttemptMissedQuestionIds(attempt);
if (questionIds.length === 0) {
	window.showCustomAlert('No Missed Questions', 'This attempt has no missed or skipped questions to study.', 'success');
	return;
}

try {
	sessionStorage.setItem(`study_focus_${examId}`, JSON.stringify({
		attemptId: attempt.attemptId || null,
		questionIds,
		createdAt: new Date().toISOString()
	}));
} catch (error) {
	window.ExamApp.warn('Failed to prepare missed-question study session', error);
	window.showCustomAlert('Could Not Start Study', 'The browser could not prepare the missed-question queue.', 'error');
	return;
}

const routeParams = { exam: examId, mode: 'study', focus: 'missed' };
if (Array.isArray(attempt.modules) && attempt.modules.length > 0) {
	routeParams.modules = JSON.stringify(attempt.modules);
}
window.ExamApp?.analytics?.trackStudyMissedStarted?.(examId, { questionCount: questionIds.length });
const url = window.ExamApp.router?.buildUrl('study', routeParams)
	|| `exam.html?${new URLSearchParams(routeParams).toString()}`;
window.open(url, '_blank');
}

getMostRecentExamWithProgress() {
let latestExamId = null;
let latestDate = 0;
const updateLatest = (examId, progress) => {
const attempts = progress?.attempts;
if (attempts && attempts.length) {
	const lastDate = new Date(attempts[attempts.length - 1].date).getTime();
	if (lastDate > latestDate) {
		latestDate = lastDate;
		latestExamId = examId;
	}
}
};

const registry = window.ExamApp.getRegistry(window.ExamApp.STORAGE_KEYS.progress);
if (registry.length > 0) {
registry.forEach((examId) => {
	try {
		updateLatest(examId, JSON.parse(localStorage.getItem(`${examId}_progress`)));
	} catch (_) {}
});
return latestExamId;
}

for (let i = 0; i < localStorage.length; i++) {
const key = localStorage.key(i);
if (key && key.endsWith('_progress')) {
	try {
		const examId = key.replace('_progress', '');
		updateLatest(examId, JSON.parse(localStorage.getItem(key)));
		window.ExamApp.addToRegistry(window.ExamApp.STORAGE_KEYS.progress, examId);
	} catch (error) {
		// ignore invalid entries
	}
}
}

return latestExamId;
}

formatRelativeDate(dateString) {
if (!dateString) return '';
const date = new Date(dateString);
if (Number.isNaN(date.getTime())) return '';
const diffMs = Date.now() - date.getTime();
const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
if (diffDays <= 0) return 'today';
if (diffDays === 1) return 'yesterday';
if (diffDays < 7) return `${diffDays} days ago`;
return date.toLocaleDateString();
}

formatDuration(minutes) {
if (!minutes || Number.isNaN(minutes)) return '—';
return `${Math.round(minutes)} min`;
}

showNoExamsSection() {
this.examSelection.style.display = 'none';
this.noExamsSection.style.display = 'block';
}

hideNoExamsSection() {
this.examSelection.style.display = '';
this.noExamsSection.style.display = 'none';
}

showCompactImportButton() {
// Check if button already exists
if (document.getElementById('compact-import-btn')) return;

// Create compact import button/card
const importCard = document.createElement('div');
importCard.id = 'compact-import-btn';
importCard.className = 'exam-card custom';
importCard.style.cssText = 'cursor:pointer;';

importCard.innerHTML = `
<div class="exam-badge">Import</div>
<i aria-hidden="true" class="fas fa-cloud-upload-alt exam-icon"></i>
<div class="exam-title">Import Exam</div>
<div class="exam-subtitle">Add new exam packs</div>
<div class="exam-stats">
	<div class="exam-stat">
		<span class="exam-stat-label">Drag & Drop</span>
	</div>
	<div class="exam-stat">
		<span class="exam-stat-label">or Browse</span>
	</div>
</div>
`;

// Add click handler
importCard.addEventListener('click', () => {
this.triggerFileImport();
});

// Add drag & drop to this card too
importCard.addEventListener('dragover', (e) => {
e.preventDefault();
e.stopPropagation();
importCard.classList.add('drag-over');
});

importCard.addEventListener('dragleave', (e) => {
e.stopPropagation();
importCard.classList.remove('drag-over');
});

importCard.addEventListener('drop', (e) => {
e.preventDefault();
e.stopPropagation();
importCard.classList.remove('drag-over');
document.body.classList.remove('dragging-file');
this.handleFiles(e.dataTransfer.files);
});					// Insert as first card
this.examSelection.insertBefore(importCard, this.examSelection.firstChild);
}

triggerFileImport() {
if (!this.fileInput) {
this.fileInput = document.createElement('input');
this.fileInput.type = 'file';
this.fileInput.accept = '.json,.zip';
this.fileInput.multiple = true;
this.fileInput.style.display = 'none';
document.body.appendChild(this.fileInput);
}

this.fileInput.onchange = (e) => {
this.handleFiles(e.target.files);
};

this.fileInput.click();
}

setupEventListeners() {
// Drag & Drop on drop zone
this.dropZone.addEventListener('dragover', (e) => {
e.preventDefault();
this.dropZone.classList.add('drag-over');
});

this.dropZone.addEventListener('dragleave', () => {
this.dropZone.classList.remove('drag-over');
});

this.dropZone.addEventListener('drop', (e) => {
e.preventDefault();
this.dropZone.classList.remove('drag-over');
this.handleFiles(e.dataTransfer.files);
});

// Global drag & drop (anywhere on page)
document.body.addEventListener('dragenter', (e) => {
// Only add class if dragging files
if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
	document.body.classList.add('dragging-file');
}
});

document.body.addEventListener('dragover', (e) => {
e.preventDefault();
e.dataTransfer.dropEffect = 'copy';
});

document.body.addEventListener('dragleave', (e) => {
// Only remove if leaving the entire page
if (e.target === document.body || !e.relatedTarget) {
	document.body.classList.remove('dragging-file');
}
});

document.body.addEventListener('drop', (e) => {
document.body.classList.remove('dragging-file');
// Only handle if dropping on body or exam-selection area
if (e.target === document.body || e.target.closest('#exam-selection') || e.target.closest('.hero')) {
	e.preventDefault();
	this.handleFiles(e.dataTransfer.files);
}
});

// Browse files
this.browseButton.addEventListener('click', () => {
if (!this.fileInput) {
	this.fileInput = document.createElement('input');
	this.fileInput.type = 'file';
	this.fileInput.accept = '.json,.zip';
	this.fileInput.multiple = true;
	this.fileInput.style.display = 'none';
	document.body.appendChild(this.fileInput);
}

this.fileInput.onchange = (e) => {
	this.handleFiles(e.target.files);
};

this.fileInput.click();
});

// Drop zone click
this.dropZone.addEventListener('click', (e) => {
if (e.target === this.dropZone || e.target.closest('.drop-zone') && !e.target.closest('button')) {
	this.browseButton.click();
}
});

// Hero action buttons
this.heroImportBtn?.addEventListener('click', () => this.triggerFileImport());
this.addExamBtn?.addEventListener('click', () => this.triggerFileImport());

// Add Exam button drag & drop
if (this.addExamBtn) {
this.addExamBtn.addEventListener('dragover', (e) => {
	e.preventDefault();
	e.stopPropagation();
	this.addExamBtn.classList.add('drag-over');
});

this.addExamBtn.addEventListener('dragleave', (e) => {
	e.stopPropagation();
	this.addExamBtn.classList.remove('drag-over');
});

this.addExamBtn.addEventListener('drop', (e) => {
	e.preventDefault();
	e.stopPropagation();
	this.addExamBtn.classList.remove('drag-over');
	document.body.classList.remove('dragging-file');
	this.handleFiles(e.dataTransfer.files);
});
}

// Preview action
this.previewActionBtn?.addEventListener('click', () => this.handlePreviewAction());

// View progress
this.heroViewProgressBtn?.addEventListener('click', () => {
if (typeof window.showProgressStatistics === 'function') {
	window.showProgressStatistics();
}
});

// Manage exams
document.getElementById('hero-manage-exams')?.addEventListener('click', () => this.openConfigModal());
}

async handleFiles(files) {
for (const file of files) {
window.ExamApp?.analytics?.trackImportStarted(file);
try {
	await this.importFile(file);
	window.ExamApp?.analytics?.trackImportCompleted(file);
} catch (error) {
	this.hideImportProgress();
	console.error(`Failed to import ${file.name}:`, error);
	window.ExamApp?.analytics?.trackImportFailed(file, error.name || 'import_error');
	window.showCustomAlert('Import Failed', `Failed to import ${file.name}: ${error.message}`, 'error');
}
}

// Refresh the exam list
await this.loadAvailableExams();
}

async importFile(file) {
const fileName = file.name.toLowerCase();
const limits = window.ExamApp.EXAM_LIMITS;

if (fileName.endsWith('.json')) {
if (file.size > limits.maxJsonBytes) {
throw new Error(`JSON file is too large. Maximum size is ${Math.round(limits.maxJsonBytes / 1024 / 1024)} MB.`);
}
await this.importJsonFile(file);
} else if (fileName.endsWith('.zip')) {
if (file.size > limits.maxZipBytes) {
throw new Error(`ZIP file is too large. Maximum size is ${Math.round(limits.maxZipBytes / 1024 / 1024)} MB.`);
}
await this.importZipFile(file);
} else {
throw new Error('Unsupported file type. Please use .json or .zip files.');
}
}

async importJsonFile(file) {
const text = await file.text();
const data = JSON.parse(text);

// Determine exam ID from filename or data
let examId = file.name.replace(/\.(json|zip)$/i, '');
if (data.id) {
examId = data.id;
}
examId = window.ExamApp.normalizeExamId(examId);
if (!examId) {
throw new Error('Invalid exam id. Use letters, numbers, hyphens or underscores.');
}

// Import the exam
await window.examManager.importExam(examId, data);

window.ExamApp.log(`Successfully imported exam: ${examId}`);
this.showNotification(`✅ Exam "${examId}" imported successfully!`);
}

async importZipFile(file) {
if (!window.JSZip) {
throw new Error('ZIP support is unavailable (JSZip not loaded).');
}

this.showImportProgress();
const zip = await JSZip.loadAsync(file);
const dumpEntry = this.findZipEntry(zip, /(^|\/)dump\.json$/i);
if (!dumpEntry) {
throw new Error('ZIP file missing dump.json.');
}

const dumpText = await dumpEntry.async('string');
const parsedDump = JSON.parse(dumpText);
let questions = Array.isArray(parsedDump) ? parsedDump : parsedDump.questions;
if (!Array.isArray(questions)) {
throw new Error('dump.json must contain an array of questions.');
}

let metadata = null;
const metadataEntry = this.findZipEntry(zip, /(^|\/)metadata\.json$/i);
if (metadataEntry) {
const metadataText = await metadataEntry.async('string');
metadata = JSON.parse(metadataText);
}

let examId = (metadata && metadata.id) || this.deriveExamIdFromZip(zip, file.name);
if (!examId) {
examId = file.name.replace(/\.zip$/i, '');
}
examId = window.ExamApp.normalizeExamId(examId);
if (!examId) {
throw new Error('Invalid exam id. Use letters, numbers, hyphens or underscores.');
}

await window.examManager.importExam(examId, { questions, metadata });

// Extract images from ZIP to local directory
window.ExamApp.log(`🔍 Scanning ZIP for images in exam: ${examId}`);
const imageFiles = [];
let totalImageBytes = 0;
const limits = window.ExamApp.EXAM_LIMITS;

zip.forEach((relativePath, entry) => {
if (entry.dir) return;
const normalized = relativePath.toLowerCase();
if (normalized.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
// Handle both forward slash and backslash (Windows ZIP paths)
const fileName = relativePath.replace(/\\/g, '/').split('/').pop();
if (!window.ExamApp.isSafeImageFileName(fileName)) return;
const imageBytes = entry._data?.uncompressedSize || 0;
if (imageBytes > limits.maxImageBytes) {
throw new Error(`Image ${fileName} is too large. Maximum size is ${Math.round(limits.maxImageBytes / 1024 / 1024)} MB.`);
}
totalImageBytes += imageBytes;
imageFiles.push({ fileName, entry });
}
});

if (imageFiles.length > limits.maxImages) {
throw new Error(`ZIP contains too many images. Maximum is ${limits.maxImages}.`);
}
if (totalImageBytes > limits.maxTotalImageBytes) {
throw new Error(`ZIP images are too large in total. Maximum is ${Math.round(limits.maxTotalImageBytes / 1024 / 1024)} MB.`);
}

window.ExamApp.log(`📊 Found ${imageFiles.length} images in ZIP`);

if (imageFiles.length > 0 && window.imageStorage) {
window.ExamApp.log(`⏳ Storing ${imageFiles.length} images in IndexedDB...`);
this.updateImportProgress(0, imageFiles.length, 0);

let storedCount = 0;
for (const { fileName, entry } of imageFiles) {
try {
	const extension = fileName.split('.').pop().toLowerCase();
	const mimeType = window.ExamApp.getImageMimeType(fileName);
	if (!mimeType) throw new Error(`Unsupported image type: ${extension}`);
	const blob = await entry.async('blob');

	await window.imageStorage.storeImageBlob(examId, fileName, blob, mimeType);
	storedCount++;
	const percentage = (storedCount / imageFiles.length) * 100;
	this.updateImportProgress(storedCount, imageFiles.length, percentage);
	window.ExamApp.log(`Stored ${fileName} (${(blob.size / 1024).toFixed(1)} KB)`);
} catch (err) {
	console.error(`❌ Failed to store ${fileName}:`, err);
}
}

window.ExamApp.log(`Successfully stored ${storedCount}/${imageFiles.length} images in IndexedDB for ${examId}`);

// Keep progress modal visible for a moment to show completion
await new Promise(resolve => setTimeout(resolve, 800));
this.hideImportProgress();

this.showNotification(
`✅ Exam "${examId}" imported with ${storedCount} image(s) stored!`,
3000
);
} else if (imageFiles.length > 0) {
window.ExamApp.warn('⚠️ ImageStorage not available, images will not be stored');
this.hideImportProgress();
this.showNotification(`✅ Exam "${examId}" imported (images not stored)`);
} else {
this.hideImportProgress();
this.showNotification(`✅ Exam "${examId}" imported successfully!`);
}
}				findZipEntry(zip, pattern) {
let match = null;
zip.forEach((relativePath, entry) => {
// Normalize backslashes to forward slashes (Windows ZIP compatibility)
const normalized = relativePath.replace(/\\/g, '/');
if (!entry.dir && pattern.test(normalized)) {
	if (!match || normalized.length < (match._normalizedPath || match.name).length) {
		match = entry;
		match._normalizedPath = normalized;
	}
}
});
return match;
}

deriveExamIdFromZip(zip, fallbackName) {
const rootFolders = new Set();
zip.forEach((relativePath) => {
const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
const [root] = normalized.split('/');
if (root) {
	rootFolders.add(root);
}
});
if (rootFolders.size === 1) {
return Array.from(rootFolders)[0];
}
return fallbackName ? fallbackName.replace(/\.zip$/i, '') : null;
}

async deleteExam(examId) {
if (!window.ExamApp.isSafeExamId(examId)) {
this.showNotification('Invalid exam id.', 2000);
return;
}
// Confirm deletion
if (!confirm(`⚠️ Are you sure you want to completely remove exam "${examId}"?\n\nThis will delete:\n- All questions\n- All images\n- All progress\n\nThis action cannot be undone!`)) {
return;
}

// Remove questions, metadata, and progress from browser storage
if (window.ExamApp.examStorage) {
await window.ExamApp.examStorage.deleteExam(examId);
} else {
localStorage.removeItem(`custom_${examId}_questions`);
localStorage.removeItem(`exam_metadata_${examId}`);
localStorage.removeItem(`${examId}_progress`);
window.ExamApp.removeFromRegistry(window.ExamApp.STORAGE_KEYS.exams, examId);
window.ExamApp.removeFromRegistry(window.ExamApp.STORAGE_KEYS.progress, examId);
}
localStorage.removeItem(`exam_images_list_${examId}`);

// Remove from memory
if (window.userExams) {
delete window.userExams[examId];
}

// Delete images from IndexedDB
if (window.imageStorage) {
try {
	const count = await window.imageStorage.deleteExamImages(examId);
	window.ExamApp.log(`🗑️ Deleted ${count} images from IndexedDB`);
} catch (e) {
	window.ExamApp.warn(`⚠️ Failed to delete images:`, e.message);
}
}

// Remove from exam manager
if (window.examManager && window.examManager.exams) {
delete window.examManager.exams[examId];
}

await this.loadAvailableExams();

// Show notification
this.showNotification(`✅ Exam "${examId}" completely removed!`, 3000);

// Refresh modal if it's open
const modal = document.getElementById('exam-config-modal');
if (modal.style.display === 'flex') {
this.openConfigModal();
}
}

async deactivateExam(examId) {
if (!window.ExamApp.isSafeExamId(examId)) return;
window.examManager.deactivateExam(examId);
await this.loadAvailableExams();
this.showNotification(`Exam "${examId}" hidden from homepage.`, 2000);
}

showNotification(message, duration = 3000) {
// Simple notification (you can enhance this later)
const notif = document.createElement('div');
notif.style.cssText = 'position:fixed;top:20px;right:20px;background:#28a745;color:white;padding:15px 20px;border-radius:8px;z-index:9999;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:400px;';
notif.textContent = message;
document.body.appendChild(notif);
setTimeout(() => notif.remove(), duration);
}

showImportProgress() {
const modal = document.getElementById('import-progress-modal');
if (modal) {
modal.classList.add('active');
this.updateImportProgress(0, 0, 0);
// Remove drag overlay when showing import progress
document.body.classList.remove('dragging-file');
document.body.classList.add('importing-exam');
}
}

hideImportProgress() {
const modal = document.getElementById('import-progress-modal');
if (modal) {
modal.classList.remove('active');
}
document.body.classList.remove('importing-exam');
}

updateImportProgress(current, total, percentage) {
const bar = document.getElementById('import-progress-bar');
const percentageText = document.getElementById('import-progress-percentage');
const countText = document.getElementById('import-progress-count');
const subtitle = document.getElementById('import-progress-subtitle');

if (bar) bar.style.width = percentage + '%';
if (percentageText) percentageText.textContent = Math.round(percentage) + '%';
if (countText) countText.textContent = `${current} / ${total} images`;

if (subtitle) {
if (current === 0 && total === 0) {
subtitle.textContent = 'Reading ZIP file...';
} else if (current < total) {
subtitle.textContent = 'Storing images in IndexedDB...';
} else {
subtitle.textContent = 'Import complete!';
}
}
}				setupConfigModal() {
const modal = document.getElementById('exam-config-modal');
const openBtn = document.getElementById('manage-exams-btn');
const closeBtn = document.getElementById('close-config-modal');

openBtn.addEventListener('click', () => this.openConfigModal());
closeBtn.addEventListener('click', () => this.closeConfigModal());

// Close on backdrop click
modal.addEventListener('click', (e) => {
if (e.target === modal) this.closeConfigModal();
});
}

openConfigModal() {
const modal = document.getElementById('exam-config-modal');
const list = document.getElementById('exam-config-list');

// Get ALL exams (active and inactive)
const allExamIds = window.examManager.getAllExamIds();

list.innerHTML = '';

if (allExamIds.length === 0) {
list.innerHTML = '';
const empty = this.appendTextElement(list, 'p', 'muted', 'No exams found in user-content/exams/');
empty.classList.add('config-empty-state');
} else {
const configFragment = document.createDocumentFragment();
allExamIds.forEach(examId => {
	const isActive = window.examManager.isExamActive(examId);
	const examData = window.userExams[examId];
	const metadata = (examData && examData.metadata) ? examData.metadata : { name: examId, fullName: 'Unknown' };
	const hasImages = window.examImageFiles && window.examImageFiles[examId];
	const imageCount = hasImages ? Object.keys(window.examImageFiles[examId]).length : 0;

	const item = document.createElement('div');
	item.className = 'config-exam-item' + (isActive ? ' active' : '');

	const info = document.createElement('div');
	info.className = 'config-exam-info';
	this.appendTextElement(info, 'div', 'config-exam-name', metadata.name || examId);
	this.appendTextElement(info, 'div', 'config-exam-desc', metadata.fullName || 'Custom Exam');
	if (imageCount > 0) {
	const imageInfo = document.createElement('div');
	imageInfo.className = 'config-exam-images';
	imageInfo.appendChild(this.createIcon('fas fa-images'));
	imageInfo.appendChild(document.createTextNode(` ${imageCount} images loaded`));
	info.appendChild(imageInfo);
	}
	item.appendChild(info);

	const actions = document.createElement('div');
	actions.className = 'config-exam-actions';

	const toggleWrapper = document.createElement('div');
	toggleWrapper.className = 'config-toggle-wrapper';

	const label = document.createElement('label');
	label.className = 'config-switch';

	const checkbox = document.createElement('input');
	checkbox.type = 'checkbox';
	checkbox.checked = isActive;

	const slider = document.createElement('span');
	slider.className = 'config-slider';

	label.appendChild(checkbox);
	label.appendChild(slider);

	const statusText = document.createElement('span');
	statusText.className = 'config-toggle-status';
	statusText.textContent = isActive ? 'Active' : 'Hidden';

	toggleWrapper.appendChild(label);
	toggleWrapper.appendChild(statusText);
	actions.appendChild(toggleWrapper);

	const delBtn = document.createElement('button');
	delBtn.type = 'button';
	delBtn.className = 'config-delete-btn';
	delBtn.title = 'Remove exam completely';
	delBtn.appendChild(this.createIcon('fas fa-trash'));
	delBtn.appendChild(document.createTextNode(' Remove'));
	actions.appendChild(delBtn);
	item.appendChild(actions);

	// Bind event listeners instead of inline onclick/onchange
	if (checkbox) {
		checkbox.addEventListener('change', function() {
			homepage.toggleExamActivation(examId, this.checked);
		});
	}
	if (delBtn) {
		delBtn.addEventListener('click', () => homepage.deleteExam(examId));
	}

	configFragment.appendChild(item);
});
list.appendChild(configFragment);
}

modal.style.display = 'flex';
}

closeConfigModal() {
document.getElementById('exam-config-modal').style.display = 'none';
}

async toggleExamActivation(examId, active) {
if (active) {
window.examManager.activateExam(examId);
} else {
window.examManager.deactivateExam(examId);
}

// Reload exam cards
await this.loadAvailableExams();

// Update the modal
this.openConfigModal();
}
}

// Initialize when page loads
let homepage;
document.addEventListener('DOMContentLoaded', async () => {
// Initialize exam images storage
if (!window.examImages) {
window.examImages = {};
}

// Wait for exam scripts to load first
if (window.examsLoadedPromise) {
await window.examsLoadedPromise;
}
homepage = new HomePage();
window.homepage = homepage;

// Bind progress buttons via addEventListener instead of inline onclick
document.getElementById('view-progress')?.addEventListener('click', () => {
if (typeof showProgressStatistics === 'function') showProgressStatistics();
});
document.getElementById('export-progress')?.addEventListener('click', () => {
if (typeof exportProgress === 'function') exportProgress();
});
});
