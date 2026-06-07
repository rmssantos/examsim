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
this.librarySearchInput = document.getElementById('library-search');
this.librarySearchControl = document.getElementById('library-search-control');
this.libraryVendorFilter = document.getElementById('library-filter-vendor');
this.libraryDomainFilter = document.getElementById('library-filter-domain');
this.libraryLevelFilter = document.getElementById('library-filter-level');
this.libraryStatusFilter = document.getElementById('library-filter-status');
this.librarySort = document.getElementById('library-sort');
this.libraryClearFilters = document.getElementById('library-clear-filters');
this.libraryFilterToggle = document.getElementById('library-filter-toggle');
this.libraryFilterToggleLabel = document.getElementById('library-filter-toggle-label');
this.libraryAdvancedFilters = document.getElementById('library-advanced-filters');
this.libraryFilterCount = document.getElementById('library-filter-count');
this.libraryResultCount = document.getElementById('library-result-count');
this.libraryEmptyState = document.getElementById('library-empty-state');
this.selectedExamId = null;
this.availableExams = new Map();
this.libraryState = this.loadLibraryState();
this.progressRefreshTimer = null;

this.init();
}

async init() {
this.updateLocalOnlyLinks();
await this.hydrateProgressFromIndexedDB();
await this.loadAvailableExams();
this.placeDetailsPanel();
this.setupEventListeners();
this.setupConfigModal();
this.setupProgressRefreshListeners();
this.refreshProgressUI();
}

async hydrateProgressFromIndexedDB() {
try {
const storage = window.ExamApp && window.ExamApp.examStorage;
if (storage && typeof storage.hydrateProgressMirror === 'function') {
	const result = await storage.hydrateProgressMirror();
	if (result && result.restored) {
		window.ExamApp.log(`Hydrated ${result.restored} progress record(s) from IndexedDB`);
	}
}
} catch (error) {
window.ExamApp.warn('Progress hydration failed:', error);
}
}

updateLocalOnlyLinks() {
const isPublicPages = window.ExamApp.isPublicSiteHost();
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
this.renderLibraryFilterOptions(exams);
this.syncLibraryControls();
this.readLibraryControls();
this.renderExamCards(this.getFilteredSortedExams());
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
if (this.availableExams.size > 0) {
	this.hideNoExamsSection();
	this.examSelection.innerHTML = '';
	this.examSelection.style.display = 'none';
	document.getElementById('exam-details-placeholder')?.classList.remove('visible');
	this.updateLibraryResultCount(0, this.availableExams.size);
	window.ExamApp.setElementHidden(this.libraryEmptyState, false);
	return;
}
this.showNoExamsSection();
return;
}

// Hide "No Exams" section and show exam cards
this.hideNoExamsSection();
this.examSelection.style.display = '';
window.ExamApp.setElementHidden(this.libraryEmptyState, true);
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
this.updateLibraryResultCount(exams.size, this.availableExams.size);
if (this.selectedExamId && !exams.has(this.selectedExamId)) {
	detailsPanel?.classList.remove('visible');
}
this.placeDetailsPanel();

this.refreshStudySummaries();
}

defaultLibraryState() {
return {
	query: '',
	vendor: '',
	domain: '',
	level: '',
	status: '',
	sort: 'recommended',
	filtersCollapsed: true
};
}

loadLibraryState() {
try {
	const parsed = JSON.parse(localStorage.getItem('exam_library_filters') || '{}');
	return { ...this.defaultLibraryState(), ...parsed };
} catch (_) {
	return this.defaultLibraryState();
}
}

saveLibraryState() {
try {
	localStorage.setItem('exam_library_filters', JSON.stringify(this.libraryState));
} catch (_) {
	// Filtering still works when storage is unavailable.
}
}

syncLibraryControls() {
if (this.librarySearchInput) this.librarySearchInput.value = this.libraryState.query || '';
if (this.libraryVendorFilter) this.libraryVendorFilter.value = this.libraryState.vendor || '';
if (this.libraryDomainFilter) this.libraryDomainFilter.value = this.libraryState.domain || '';
if (this.libraryLevelFilter) this.libraryLevelFilter.value = this.libraryState.level || '';
if (this.libraryStatusFilter) this.libraryStatusFilter.value = this.libraryState.status || '';
if (this.librarySort) this.librarySort.value = this.libraryState.sort || 'recommended';
this.updateLibraryFilterPanel();
}

readLibraryControls() {
const filtersCollapsed = Boolean(this.libraryState.filtersCollapsed);
this.libraryState = {
	query: this.librarySearchInput?.value || '',
	vendor: this.libraryVendorFilter?.value || '',
	domain: this.libraryDomainFilter?.value || '',
	level: this.libraryLevelFilter?.value || '',
	status: this.libraryStatusFilter?.value || '',
	sort: this.librarySort?.value || 'recommended',
	filtersCollapsed
};
}

getActiveLibraryFilterCount() {
return ['query', 'vendor', 'domain', 'level', 'status'].reduce((count, key) => count + (this.libraryState[key] ? 1 : 0), 0);
}

updateLibraryFilterPanel() {
const collapsed = Boolean(this.libraryState.filtersCollapsed);
const controls = document.getElementById('library-controls');
controls?.classList.toggle('filters-collapsed', collapsed);
if (this.libraryAdvancedFilters) {
	this.libraryAdvancedFilters.hidden = false;
	this.libraryAdvancedFilters.inert = collapsed;
	this.libraryAdvancedFilters.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
}
if (this.librarySearchControl) {
	this.librarySearchControl.inert = collapsed;
	this.librarySearchControl.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
}
if (this.libraryFilterToggle) {
	this.libraryFilterToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
	this.libraryFilterToggle.setAttribute('aria-label', collapsed ? 'Show search and filters' : 'Minimize search and filters');
	this.libraryFilterToggle.title = collapsed ? 'Show search and filters' : 'Minimize search and filters';
}
if (this.libraryFilterToggleLabel) {
	this.libraryFilterToggleLabel.textContent = collapsed ? 'Search & filters' : 'Minimize';
}
const activeCount = this.getActiveLibraryFilterCount();
if (this.libraryFilterCount) {
	this.libraryFilterCount.textContent = String(activeCount);
	window.ExamApp.setElementHidden(this.libraryFilterCount, activeCount === 0);
}
}

setSelectOptions(select, label, values) {
if (!select) return;
const current = select.value;
select.innerHTML = '';
const allOption = document.createElement('option');
allOption.value = '';
allOption.textContent = `All ${label}`;
select.appendChild(allOption);
values.forEach(value => {
	const option = document.createElement('option');
	option.value = value;
	option.textContent = this.formatLibraryFilterLabel(value);
	select.appendChild(option);
});
select.value = values.includes(current) ? current : '';
}

formatLibraryFilterLabel(value) {
const labels = {
	free: 'Free',
	preview: 'Preview',
	pro: 'Pro',
	'pro-preview': 'Pro preview',
	'practice-exam': 'Practice exam'
};
return labels[value] || value;
}

renderLibraryFilterOptions(exams) {
const vendors = new Set();
const domains = new Set();
const levels = new Set();
const statuses = new Set();
exams.forEach((examData, examId) => {
	const taxonomy = this.getExamTaxonomy(examId, examData);
	if (taxonomy.vendor) vendors.add(taxonomy.vendor);
	taxonomy.domains.forEach(domain => domains.add(domain));
	if (taxonomy.level) levels.add(taxonomy.level);
	if (taxonomy.status) statuses.add(taxonomy.status);
});
const sortValues = values => Array.from(values).sort((left, right) => left.localeCompare(right));
this.setSelectOptions(this.libraryVendorFilter, 'vendors', sortValues(vendors));
this.setSelectOptions(this.libraryDomainFilter, 'domains', sortValues(domains));
this.setSelectOptions(this.libraryLevelFilter, 'levels', sortValues(levels));
this.setSelectOptions(this.libraryStatusFilter, 'status', sortValues(statuses));
}

getExamTaxonomy(examId, examData) {
const metadata = examData?.metadata || {};
const domains = Array.isArray(metadata.domains) ? metadata.domains : [];
const status = metadata.commercialStatus || (metadata.preview && metadata.pro ? 'pro-preview' : metadata.preview ? 'preview' : metadata.pro ? 'pro' : 'free');
return {
	vendor: String(metadata.vendor || 'Custom').trim(),
	certificationCode: String(metadata.certificationCode || metadata.name || examId).trim(),
	domains: domains.map(domain => String(domain || '').trim()).filter(Boolean),
	level: String(metadata.level || metadata.badge || 'Custom').trim(),
	productFamily: String(metadata.productFamily || '').trim(),
	contentType: String(metadata.contentType || (metadata.preview ? 'preview' : 'practice-exam')).trim(),
	status: String(status || 'free').trim()
};
}

getExamSearchText(examId, examData) {
const metadata = examData?.metadata || {};
const taxonomy = this.getExamTaxonomy(examId, examData);
const modules = this.getModuleNames(metadata.modules).join(' ');
const resources = (Array.isArray(metadata.resources) ? metadata.resources : [])
	.map(resource => `${resource?.name || ''} ${resource?.url || ''}`)
	.join(' ');
return [
	examId,
	metadata.name,
	metadata.fullName,
	metadata.description,
	metadata.badge,
	taxonomy.vendor,
	taxonomy.certificationCode,
	taxonomy.productFamily,
	taxonomy.contentType,
	taxonomy.status,
	taxonomy.level,
	taxonomy.domains.join(' '),
	modules,
	resources
].join(' ').toLowerCase();
}

getFilteredSortedExams() {
const entries = Array.from(this.availableExams.entries()).filter(([examId, examData]) => {
	const taxonomy = this.getExamTaxonomy(examId, examData);
	const query = String(this.libraryState.query || '').trim().toLowerCase();
	if (query && !this.getExamSearchText(examId, examData).includes(query)) return false;
	if (this.libraryState.vendor && taxonomy.vendor !== this.libraryState.vendor) return false;
	if (this.libraryState.domain && !taxonomy.domains.includes(this.libraryState.domain)) return false;
	if (this.libraryState.level && taxonomy.level !== this.libraryState.level) return false;
	if (this.libraryState.status && taxonomy.status !== this.libraryState.status) return false;
	return true;
});

entries.sort((left, right) => this.compareLibraryEntries(left, right));
return new Map(entries);
}

compareLibraryEntries(left, right) {
const sort = this.libraryState.sort || 'recommended';
const leftMetadata = left[1]?.metadata || {};
const rightMetadata = right[1]?.metadata || {};
const leftName = String(leftMetadata.name || left[0]).toLowerCase();
const rightName = String(rightMetadata.name || right[0]).toLowerCase();
if (sort === 'az') return leftName.localeCompare(rightName);
if (sort === 'questions-desc') return this.getTotalQuestionCount(right[1]) - this.getTotalQuestionCount(left[1]) || leftName.localeCompare(rightName);
if (sort === 'duration-asc') return Number(leftMetadata.duration || 0) - Number(rightMetadata.duration || 0) || leftName.localeCompare(rightName);
if (sort === 'duration-desc') return Number(rightMetadata.duration || 0) - Number(leftMetadata.duration || 0) || leftName.localeCompare(rightName);
return 0;
}

getTotalQuestionCount(examData) {
const metadata = examData?.metadata || {};
return Number(metadata.totalQuestions || metadata.questionCount || examData?.questions?.length || 0);
}

updateLibraryResultCount(visibleCount, totalCount) {
if (!this.libraryResultCount) return;
const total = Number(totalCount || 0);
const visible = Number(visibleCount || 0);
if (total === 0) {
	this.libraryResultCount.textContent = '';
	return;
}
this.libraryResultCount.textContent = visible === total
	? `${total} exam${total === 1 ? '' : 's'} available`
	: `Showing ${visible} of ${total} exams`;
}

refreshLibrary() {
this.readLibraryControls();
this.saveLibraryState();
this.updateLibraryFilterPanel();
this.renderExamCards(this.getFilteredSortedExams());
this.highlightSelectedCard(this.selectedExamId);
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

formatTaxonomyLabel(value) {
const text = String(value || '').trim();
if (!text) return '';
return text
	.replace(/[-_]+/g, ' ')
	.replace(/\s+/g, ' ')
	.replace(/\b\w/g, letter => letter.toUpperCase());
}

formatCommercialStatus(status) {
const normalized = String(status || '').trim().toLowerCase();
return {
	free: 'Free',
	preview: 'Preview',
	pro: 'Pro',
	'pro-preview': 'Pro preview',
	retired: 'Retired'
}[normalized] || this.formatTaxonomyLabel(status || 'Free');
}

createExamTaxonomyChip(kind, label, iconClass, title) {
const chip = document.createElement('span');
chip.className = `exam-taxonomy-chip exam-taxonomy-chip--${kind}`;
chip.title = title;
chip.appendChild(this.createIcon(iconClass));
this.appendTextElement(chip, 'span', '', label);
return chip;
}

createExamTaxonomy(examId, examData, options = {}) {
const taxonomy = this.getExamTaxonomy(examId, examData);
const wrapper = document.createElement('div');
const variant = options.variant || 'card';
wrapper.className = `exam-taxonomy exam-taxonomy--${variant}`;
wrapper.setAttribute('aria-label', 'Exam taxonomy');

const chips = [
	['code', taxonomy.certificationCode, 'fas fa-certificate', 'Certification code'],
	['vendor', taxonomy.vendor, 'fas fa-building', 'Vendor'],
	['level', taxonomy.level, 'fas fa-layer-group', 'Level'],
	['status', this.formatCommercialStatus(taxonomy.status), 'fas fa-tag', 'Commercial status']
];

if (variant === 'details') {
	chips.push(['content', this.formatTaxonomyLabel(taxonomy.contentType), 'fas fa-file-lines', 'Content type']);
	if (taxonomy.productFamily) chips.push(['family', taxonomy.productFamily, 'fas fa-sitemap', 'Product family']);
}

const visibleDomainCount = variant === 'details' ? 3 : 1;
taxonomy.domains.slice(0, visibleDomainCount).forEach(domain => {
	chips.push(['domain', domain, 'fas fa-compass', 'Domain']);
});
if (taxonomy.domains.length > visibleDomainCount) {
	chips.push(['domain-more', `+${taxonomy.domains.length - visibleDomainCount}`, 'fas fa-ellipsis', taxonomy.domains.slice(visibleDomainCount).join(', ')]);
}

chips.forEach(([kind, label, iconClass, title]) => {
	if (!label) return;
	wrapper.appendChild(this.createExamTaxonomyChip(kind, label, iconClass, title));
});

return wrapper;
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
if (metadata.preview) {
card.classList.add('exam-card--preview');
const previewFlag = document.createElement('div');
previewFlag.className = 'exam-preview-flag';
previewFlag.appendChild(this.createIcon('fas fa-lock'));
previewFlag.appendChild(document.createTextNode(' Preview'));
card.appendChild(previewFlag);
}
card.appendChild(this.createIcon(metadata.icon || 'fas fa-book', 'exam-icon'));
this.appendTextElement(card, 'div', 'exam-title', metadata.name || examId.toUpperCase());
this.appendTextElement(card, 'div', 'exam-subtitle', metadata.fullName || 'Custom Exam');
card.appendChild(this.createExamTaxonomy(examId, examData));

const stats = document.createElement('div');
stats.className = 'exam-stats';
stats.appendChild(this.createExamStat(String(questionCount), 'Questions'));
stats.appendChild(this.createExamStat(String(metadata.duration || 45), 'Minutes'));
stats.appendChild(this.createExamStat(`${metadata.passScore || 75}%`, 'Pass Score'));
card.appendChild(stats);

if (hasDeclaredTotalQuestions) {
const totalLabel = totalQuestions > questionCount
	? `From ${totalQuestions} total questions`
	: `${totalQuestions} total questions in this pack`;
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
startButton.addEventListener('click', async (e) => {
	e.stopPropagation();
	const selectionPromise = this.selectExam(examId);
	await this.startSelectedExam('exam', selectionPromise);
});
actions.appendChild(startButton);

const studyButton = document.createElement('button');
studyButton.type = 'button';
studyButton.className = 'exam-card-study';
studyButton.appendChild(this.createIcon('fas fa-brain'));
studyButton.appendChild(document.createTextNode(' Study'));
studyButton.addEventListener('click', async (e) => {
	e.stopPropagation();
	const selectionPromise = this.selectExam(examId);
	await this.startSelectedExam('study', selectionPromise);
});

if (metadata.pro) {
const unlockButton = document.createElement('button');
unlockButton.type = 'button';
unlockButton.className = 'exam-card-unlock';
unlockButton.appendChild(this.createIcon('fas fa-unlock'));
unlockButton.appendChild(document.createTextNode(' Unlock'));
unlockButton.addEventListener('click', (e) => {
e.stopPropagation();
window.ExamApp?.analytics?.trackProUnlockClicked?.(examId);
this.showProModal(examId, metadata);
});
actions.appendChild(unlockButton);
} else {
actions.appendChild(studyButton);
}
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
	void this.selectExam(examId);
}
});

return card;
}

showProModal(examId, metadata) {
const pro = (metadata && metadata.pro) || {};
const returnFocus = (document.activeElement instanceof HTMLElement) ? document.activeElement : null;
this.closeProModal();
window.ExamApp?.analytics?.trackProModalOpened?.(examId);

const overlay = document.createElement('div');
overlay.className = 'pro-modal-overlay';
overlay.id = 'pro-modal-overlay';

const dialog = document.createElement('div');
dialog.className = 'pro-modal';
dialog.setAttribute('role', 'dialog');
dialog.setAttribute('aria-modal', 'true');
dialog.setAttribute('aria-label', 'Unlock the full pack');

const closeBtn = document.createElement('button');
closeBtn.type = 'button';
closeBtn.className = 'pro-modal-close';
closeBtn.setAttribute('aria-label', 'Close');
closeBtn.appendChild(this.createIcon('fas fa-times'));
closeBtn.addEventListener('click', () => this.closeProModal());
dialog.appendChild(closeBtn);

const title = document.createElement('h2');
title.className = 'pro-modal-title';
title.textContent = pro.title || `${metadata.name || examId.toUpperCase()} Complete`;
dialog.appendChild(title);

const sub = document.createElement('p');
sub.className = 'pro-modal-sub';
sub.textContent = `You are practicing the free preview. Unlock the complete ${metadata.name || 'exam'} pack.`;
dialog.appendChild(sub);

if (Array.isArray(pro.highlights) && pro.highlights.length) {
const list = document.createElement('ul');
list.className = 'pro-modal-list';
pro.highlights.forEach((item) => {
const li = document.createElement('li');
li.appendChild(this.createIcon('fas fa-check'));
li.appendChild(document.createTextNode(' ' + String(item)));
list.appendChild(li);
});
dialog.appendChild(list);
}

const buy = document.createElement('a');
buy.className = 'pro-modal-buy';
buy.href = this.safeExternalUrl(pro.url);
buy.target = '_blank';
buy.rel = 'noopener noreferrer';
buy.appendChild(this.createIcon('fas fa-store'));
buy.appendChild(document.createTextNode(' Get the full pack' + (pro.price ? ' (' + pro.price + ')' : '')));
buy.addEventListener('click', () => {
window.ExamApp?.analytics?.trackProPurchaseClicked?.(examId);
});
dialog.appendChild(buy);

const divider = document.createElement('div');
divider.className = 'pro-modal-divider';
dialog.appendChild(divider);

const activateText = document.createElement('p');
activateText.className = 'pro-modal-activate-text';
activateText.textContent = 'Already purchased? Import your pack file and enter your license key to activate it on this device.';
dialog.appendChild(activateText);

const importBtn = document.createElement('button');
importBtn.type = 'button';
importBtn.className = 'pro-modal-import';
importBtn.appendChild(this.createIcon('fas fa-file-import'));
importBtn.appendChild(document.createTextNode(' Import & activate'));
importBtn.addEventListener('click', () => {
window.ExamApp?.analytics?.trackProImportClicked?.(examId);
this.closeProModal();
this.triggerFileImport();
});
dialog.appendChild(importBtn);

overlay.appendChild(dialog);
overlay.addEventListener('click', (e) => {
if (e.target === overlay) this.closeProModal();
});
this._proModalKeyHandler = (e) => {
if (e.key === 'Escape') {
this.closeProModal();
return;
}

if (e.key !== 'Tab') return;

const focusable = Array.from(dialog.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
.filter((element) => !element.hidden && element.offsetParent !== null);
if (focusable.length === 0) return;

const first = focusable[0];
const last = focusable[focusable.length - 1];
if (e.shiftKey && document.activeElement === first) {
e.preventDefault();
last.focus();
} else if (!e.shiftKey && document.activeElement === last) {
e.preventDefault();
first.focus();
}
};
document.addEventListener('keydown', this._proModalKeyHandler);
document.body.appendChild(overlay);
this._proModalReturnFocus = returnFocus;
closeBtn.focus();
}

closeProModal() {
const overlay = document.getElementById('pro-modal-overlay');
if (overlay) overlay.remove();
if (this._proModalKeyHandler) {
document.removeEventListener('keydown', this._proModalKeyHandler);
this._proModalKeyHandler = null;
}
const returnFocus = this._proModalReturnFocus;
this._proModalReturnFocus = null;
if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
}

getCardClass(examId) {
const cardClasses = {
	sc900: 'exam-sc900',
	ab730: 'exam-ab730',
	ab731: 'exam-ab731'
};
return cardClasses[String(examId || '').toLowerCase()] || 'custom';
}

async selectExam(examId) {
const initialExamData = window.userExams[examId];
if (!initialExamData) return false;
this.selectedExamId = examId;
this.highlightSelectedCard(examId);
this.showExamDetailsPlaceholder(examId);
this.refreshHeroPreview();

try {
	const examData = await window.ExamApp.ensureExamLoaded(examId);
	if (window.examSimulator) {
		const metadata = examData.metadata || {};
		window.examSimulator.currentExam = examId;
		window.examSimulator.examData[examId] = {
			name: metadata.name || examId.toUpperCase(),
			fullName: metadata.fullName || `Custom Exam: ${examId}`,
			duration: metadata.duration || 60,
			questionCount: metadata.questionCount || Math.min(examData.questions.length, 45),
			passScore: metadata.passScore || 70,
			questions: examData.questions,
			modules: metadata.modules || [],
			resources: metadata.resources || []
		};
	}
	if (this.selectedExamId === examId) {
		this.showExamDetailsPlaceholder(examId);
		await this.updateDetailsStudySummary(examId);
	}
	return true;
} catch (error) {
	window.ExamApp.warn(`Failed to load ${examId}:`, error);
	window.showCustomAlert('Exam unavailable', `Could not load ${examId}: ${error.message}`, 'error');
	return false;
}
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
if (questionsEl) {
const total = Array.isArray(examData.questions) ? examData.questions.length : metadata.totalQuestions;
questionsEl.textContent = `${metadata.questionCount || total || 0} questions`;
}
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
const detailsTaxonomy = document.getElementById('details-exam-taxonomy');
if (detailsTaxonomy) {
	detailsTaxonomy.replaceChildren(this.createExamTaxonomy(examId, examData, { variant: 'details' }));
}
document.getElementById('details-exam-duration').textContent = `${metadata.duration || 45} min`;
const questions = Array.isArray(examData.questions) ? examData.questions : [];
document.getElementById('details-exam-questions').textContent = `${metadata.questionCount || metadata.totalQuestions || questions.length}`;
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
questions.forEach(question => {
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
	badgeSpan.textContent = questions.length ? `${qCount} Qs` : 'Load to count';

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

async startSelectedExam(mode = 'exam', selectionPromise = null) {
	if (!this.selectedExamId) {
		window.showCustomAlert('Select an Exam', 'Please select an exam card from the library before proceeding.', 'warning');
		return false;
	}

	const examId = this.selectedExamId;
	const examWindow = window.open('', '_blank');
	if (!examWindow) {
		window.showCustomAlert('Popup blocked', 'Allow popups for Examplar, then try again.', 'warning');
		return false;
	}

	let examData;
	try {
		if (selectionPromise && !await selectionPromise) {
			examWindow.close();
			return false;
		}
		examData = await window.ExamApp.ensureExamLoaded(examId);
	} catch (error) {
		examWindow.close();
		window.showCustomAlert('Exam unavailable', `Could not load ${examId}: ${error.message}`, 'error');
		return false;
	}
	const metadata = examData?.metadata || {};
	const moduleNames = this.getModuleNames(metadata.modules);
	const routeParams = { exam: examId };
	if (mode === 'study') {
		routeParams.mode = 'study';
	}

	if (moduleNames.length > 0) {
		const modulesList = document.getElementById('details-modules-list');
		const panelMatchesExam = modulesList?.dataset.exam === examId;
		const selectedModules = panelMatchesExam
			? Array.from(modulesList.querySelectorAll('li.checked')).map(li => li.dataset.module).filter(Boolean)
			: moduleNames;

		if (selectedModules.length === 0) {
			examWindow.close();
			window.showCustomAlert('No Modules Selected', 'Please select at least one module to start practicing.', 'warning');
			return false;
		}

		routeParams.modules = JSON.stringify(selectedModules);
	}

	const simulator = window.ExamApp?.examSimulator || window.examSimulator;
	if (simulator?.currentExam !== examId) {
		if (!await this.selectExam(examId)) {
			examWindow.close();
			return false;
		}
	}

	const routeName = mode === 'study' ? 'study' : 'exam';
	const url = window.ExamApp.router?.buildUrl(routeName, routeParams)
		|| `exam.html?${new URLSearchParams(routeParams).toString()}`;
	examWindow.location.href = url;
	return true;
}

updateSelectedQuestionsCount(examId) {
	const examData = window.userExams[examId];
	if (!examData) return;

	const metadata = examData.metadata || {};
	const questions = Array.isArray(examData.questions) ? examData.questions : [];
	const modulesList = document.getElementById('details-modules-list');
		if (!modulesList) return;
	const checkedItems = modulesList.querySelectorAll('li.checked');

	if (!metadata.modules || metadata.modules.length === 0) {
		const total = questions.length || metadata.totalQuestions || metadata.questionCount || 0;
		document.getElementById('details-exam-questions').textContent = `${metadata.questionCount || total}`;
		return;
	}
	if (!questions.length) return;

	const selectedModuleNames = Array.from(checkedItems)
		.map(li => this.normalizeModuleName(li.dataset.module).toLowerCase())
		.filter(Boolean);

	const selectedPoolCount = questions.filter(q => {
		return q.module && selectedModuleNames.includes(q.module.trim().toLowerCase());
	}).length;

	const totalPoolCount = questions.length;

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
const examData = window.userExams[examId] || this.availableExams.get(examId);
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
	this.appendTextElement(item, 'div', 'attempt-review-question missing', 'Question no longer exists in the current pack.');
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
const refreshLibraryFromControls = () => this.refreshLibrary();
this.librarySearchInput?.addEventListener('input', refreshLibraryFromControls);
this.libraryVendorFilter?.addEventListener('change', refreshLibraryFromControls);
this.libraryDomainFilter?.addEventListener('change', refreshLibraryFromControls);
this.libraryLevelFilter?.addEventListener('change', refreshLibraryFromControls);
this.libraryStatusFilter?.addEventListener('change', refreshLibraryFromControls);
this.librarySort?.addEventListener('change', refreshLibraryFromControls);
this.libraryFilterToggle?.addEventListener('click', () => {
	this.libraryState.filtersCollapsed = !this.libraryState.filtersCollapsed;
	this.saveLibraryState();
	this.updateLibraryFilterPanel();
});
this.libraryClearFilters?.addEventListener('click', () => {
	const filtersCollapsed = Boolean(this.libraryState.filtersCollapsed);
	this.libraryState = this.defaultLibraryState();
	this.libraryState.filtersCollapsed = filtersCollapsed;
	this.syncLibraryControls();
	this.refreshLibrary();
});

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
const hasDroppedFiles = e.dataTransfer?.files?.length > 0;
if (hasDroppedFiles) {
	e.preventDefault();
}
// Only handle if dropping on body, hero, or the library area
if (hasDroppedFiles && (e.target === document.body || e.target.closest('#exam-selection') || e.target.closest('.exam-library-section') || e.target.closest('.hero'))) {
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

async ensureJsZipLoaded() {
if (window.JSZip) return window.JSZip;
if (this.jsZipLoadPromise) return this.jsZipLoadPromise;

this.jsZipLoadPromise = new Promise((resolve, reject) => {
	const script = document.createElement('script');
	script.src = 'assets/vendor/jszip/jszip.min.js';
	script.async = true;
	script.onload = () => {
		if (window.JSZip) {
			resolve(window.JSZip);
		} else {
			reject(new Error('ZIP support failed to initialize.'));
		}
	};
	script.onerror = () => reject(new Error('ZIP support could not be loaded.'));
	document.head.appendChild(script);
}).catch((error) => {
	this.jsZipLoadPromise = null;
	throw error;
});

return this.jsZipLoadPromise;
}

async importJsonFile(file) {
const text = await file.text();
let data = JSON.parse(text);

// Transparently handle passphrase-protected (AES-GCM) exports.
const secureTransfer = window.ExamApp && window.ExamApp.secureTransfer;
if (secureTransfer && secureTransfer.isEncryptedEnvelope(data)) {
const passphrase = await secureTransfer.promptPassphrase({
	title: 'Enter import passphrase',
	message: 'This file is encrypted. Enter the passphrase used when it was exported.',
	confirmLabel: 'Decrypt & import'
});
if (passphrase === null) {
	return; // user cancelled
}
data = await secureTransfer.decrypt(data, passphrase);
}

// A progress backup carries an `exams` map alongside export metadata.
if (data && typeof data === 'object' && data.exams && typeof data.exams === 'object' && !Array.isArray(data.exams)) {
await this.restoreProgressBackup(data);
return;
}

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

async restoreProgressBackup(backup) {
const storage = window.ExamApp && window.ExamApp.examStorage;
let restored = 0;
let skipped = 0;
const entries = Object.entries(backup.exams);
if (entries.length > window.ExamApp.EXAM_LIMITS.maxProgressExams) {
throw new Error(`Progress backup contains too many exams. Maximum is ${window.ExamApp.EXAM_LIMITS.maxProgressExams}.`);
}
for (const [rawId, progress] of entries) {
const examId = window.ExamApp.normalizeExamId(rawId);
if (!examId || !window.ExamApp.isSafeExamId(examId)) {
	skipped++;
	continue;
}
const normalizedProgress = window.ExamApp.normalizeProgressRecord(progress);
if (!normalizedProgress) {
	skipped++;
	continue;
}
try {
	if (storage && typeof storage.putLegacyProgress === 'function') {
		storage.putLegacyProgress(examId, normalizedProgress);
	} else {
		localStorage.setItem(`${examId}_progress`, JSON.stringify(normalizedProgress));
	}
	window.ExamApp.addToRegistry(window.ExamApp.STORAGE_KEYS.progress, examId);
	if (storage && typeof storage.putProgress === 'function') {
		await storage.putProgress(examId, normalizedProgress).catch(() => {});
	}
	restored++;
} catch (error) {
	window.ExamApp.warn(`Failed to restore progress for ${examId}:`, error);
	skipped++;
}
}
this.refreshProgressUI();
const suffix = skipped ? ` (${skipped} skipped)` : '';
this.showNotification(`✅ Restored progress for ${restored} exam(s)${suffix}.`);
}

async importZipFile(file) {
await this.ensureJsZipLoaded();
if (!window.JSZip) {
throw new Error('ZIP support is unavailable (JSZip not loaded).');
}

this.showImportProgress();
const zip = await JSZip.loadAsync(file);
const inspected = window.ExamApp.inspectZipEntries(zip);
const { dumpEntry, metadataEntry, imageFiles } = inspected;
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
if (typeof exportProgress === 'function') {
	Promise.resolve(exportProgress()).catch((error) => {
		window.ExamApp.warn('Export progress failed:', error);
	});
}
});
});
