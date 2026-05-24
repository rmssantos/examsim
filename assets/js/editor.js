(function(){
  // Utilities
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const deepClone = (o) => JSON.parse(JSON.stringify(o));

  function debounce(fn, ms) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // escapeHtml is provided globally by utils.js; keep a local alias for safety
  const escapeHtml = window.escapeHtml || function(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // Load master data from window.userExams or examManager
  function loadMaster(exam){
    // Try loading from window.userExams first (populated by exam-loader from server and browser storage)
    if (window.userExams && window.userExams[exam]) {
      const examData = window.userExams[exam];
      if (examData.questions && Array.isArray(examData.questions)) {
        return deepClone(examData.questions);
      }
    }

    return [];
  }

  function loadWorkingSet(exam){
    // Prefer override if present, else load from master
    const key = `custom_${exam}_questions`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch(e){ window.ExamApp.warn('Failed to parse override', e); }
    return loadMaster(exam);
  }

  function setActiveExam(newExamId, options = {}) {
    if (!newExamId) return false;

    const { skipUnsavedCheck = false, force = false } = options;
    if (!force && state.exam === newExamId) {
      if ($('#examSelect') && $('#examSelect').value !== newExamId) {
        $('#examSelect').value = newExamId;
      }
      return true;
    }

    if (!skipUnsavedCheck && state.hasUnsavedChanges) {
      const ok = confirm('You have unsaved changes. Switch exam anyway? (Changes will be lost)');
      if (!ok) {
        if ($('#examSelect')) {
          $('#examSelect').value = state.exam;
        }
        return false;
      }
    }

    state.exam = newExamId;
    state.customCode = null;
    if ($('#examSelect')) {
      $('#examSelect').value = newExamId;
    }

    state.items = loadWorkingSet(newExamId);
    state.savedItemsHash = hashItems(state.items);
    state.hasUnsavedChanges = false;
    updateCategoryFilter();
    applyFilter();
    state.currentIndex = 0;
    renderList();
    renderForm();
    updateUnsavedIndicator();
    updatePersistenceHint();

    return true;
  }

  let state = {
    exam: '',
    customCode: null, // when exam === 'custom', holds code for exam-dumps/<code>.json and localStorage keys
    items: [],
    filtered: [],
    currentIndex: -1,
    hasUnsavedChanges: false, // Track unsaved changes
    savedItemsHash: null // Hash of last saved state
  };

  function idSort(a,b){
    const ai = typeof a.id === 'number' ? a.id : Number.MAX_SAFE_INTEGER;
    const bi = typeof b.id === 'number' ? b.id : Number.MAX_SAFE_INTEGER;
    return ai - bi;
  }

  function renderList(){
    const list = $('#questionList');
    list.innerHTML = '';
    state.filtered.sort(idSort).forEach((q, i) => {
      const div = document.createElement('div');
      div.className = 'list-item' + (i === state.currentIndex ? ' active' : '');
      div.setAttribute('data-index', i);
      const title = (q.question || '').replace(/\n/g,' ').slice(0,120);
      // Determine type: special types via question_type; else MULTI if correct is an array, otherwise STANDARD
      const type = q.question_type || (Array.isArray(q.correct) ? 'MULTI' : 'STANDARD');

      const meta = document.createElement('div');
      meta.className = 'small';
      meta.textContent = `#${q.id ?? 'new'} • ${type} • ${q.module || '-'}`;

      const titleDiv = document.createElement('div');
      titleDiv.textContent = title;

      div.appendChild(meta);
      div.appendChild(titleDiv);
      list.appendChild(div);
    });
  }

  // Delegated click listener for question list
  document.addEventListener('DOMContentLoaded', () => {
    const list = document.getElementById('questionList');
    if (list) {
      list.addEventListener('click', (e) => {
        const item = e.target.closest('.list-item');
        if (!item) return;
        const index = parseInt(item.getAttribute('data-index'), 10);
        if (isNaN(index)) return;
        state.currentIndex = index;
        renderForm();
        renderList();
      });
    }
  });

  function ensureFields(q){
    q.options = Array.isArray(q.options) ? q.options : [];
    if (q.question_images && q.question_images.length && !q._meta) q._meta = {};
    return q;
  }

  function renderForm(){
    const q = state.filtered[state.currentIndex];
    if (!q) return;
    ensureFields(q);
    $('#qId').value = q.id ?? '';
    $('#qModule').value = q.module || '';

    // Initialize saved hash if not set
    if (state.savedItemsHash === null) {
      state.savedItemsHash = hashItems(state.items);
    }

  // For STANDARD vs MULTI, treat any array-shaped correct as MULTI, regardless of length
  const type = q.question_type || (Array.isArray(q.correct) ? 'MULTI' : 'STANDARD');
    $('#qType').value = type;

    $('#qText').value = q.question || '';
    $('#qExplanation').value = q.explanation || '';

    // Images
    const qi = Array.isArray(q.question_images) ? q.question_images.map(i=>i.filename).join('\n') : '';
    const ei = Array.isArray(q.explanation_images) ? q.explanation_images.map(i=>i.filename).join('\n') : '';
    $('#qImages').value = qi;
    $('#eImages').value = ei;

    // Options
    const optWrap = $('#options');
    optWrap.innerHTML = '';
    const isSequence = (type === 'SEQUENCE');
    const isYesNoMatrix = (type === 'YES_NO_MATRIX');

    if (isYesNoMatrix) {
      // For YES_NO_MATRIX: show statements with Yes/No radio buttons
      const statements = Array.isArray(q.statements) ? q.statements : [];
      statements.forEach((stmt, idx) => {
        const row = document.createElement('div');
        row.className = 'option-row yn-matrix-row';
        row.innerHTML = `
          <input type="text" data-idx="${idx}" class="stmt-text" value="${escapeHtml(stmt)}" placeholder="Statement ${idx + 1}">
          <div class="yn-radio-group">
            <label class="yn-radio"><input type="radio" name="yn-${idx}" data-idx="${idx}" value="0" class="yn-correct"> Yes</label>
            <label class="yn-radio"><input type="radio" name="yn-${idx}" data-idx="${idx}" value="1" class="yn-correct"> No</label>
          </div>
          <button type="button" class="btn danger opt-del" data-idx="${idx}"><i class="fas fa-trash"></i></button>
        `;
        optWrap.appendChild(row);
      });

      // Mark correct Yes/No values
      if (Array.isArray(q.correct)) {
        q.correct.forEach((val, idx) => {
          const radio = optWrap.querySelector(`.yn-correct[data-idx="${idx}"][value="${val}"]`);
          if (radio) radio.checked = true;
        });
      }
    } else {
      // Regular options rendering
      q.options.forEach((opt, idx) => {
        const row = document.createElement('div');
        row.className = isSequence ? 'option-row sequence-row' : 'option-row';

        if (isSequence) {
          // For SEQUENCE: show order number + text (no checkbox)
          row.innerHTML = `
            <span class="sequence-order-num">${idx + 1}.</span>
            <input type="text" data-idx="${idx}" class="opt-text" value="${escapeHtml(opt)}">
            <button type="button" class="btn danger opt-del" data-idx="${idx}"><i class="fas fa-trash"></i></button>
          `;
        } else {
          // For other types: show checkbox + text
          row.innerHTML = `
            <input type="text" data-idx="${idx}" class="opt-text" value="${escapeHtml(opt)}">
            <label class="small"><input type="checkbox" class="opt-correct" data-idx="${idx}"> Correct</label>
            <button type="button" class="btn danger opt-del" data-idx="${idx}"><i class="fas fa-trash"></i></button>
          `;
        }

        optWrap.appendChild(row);
      });
    }
    // mark corrects
    if (Array.isArray(q.correct)) {
      q.correct.forEach(ci => {
        const cb = optWrap.querySelector(`.opt-correct[data-idx="${ci}"]`);
        if (cb) cb.checked = true;
      });
      $('#qCorrect').value = q.question_type==='SEQUENCE' ? q.correct.join(',') : q.correct.join(',');
    } else if (typeof q.correct === 'number') {
      const cb = optWrap.querySelector(`.opt-correct[data-idx="${q.correct}"]`);
      if (cb) cb.checked = true;
      $('#qCorrect').value = String(q.correct);
    } else {
      $('#qCorrect').value = '';
    }

    // Special sections
    const ddSelectRow = $('#ddSelectRow');
    ddSelectRow.classList.toggle('is-hidden', type !== 'DRAG_DROP_SELECT');
    ddSelectRow.style.display = type === 'DRAG_DROP_SELECT' ? '' : 'none';
    // Hide ynMatrixRow since we now edit statements inline
    const ynMatrixRow = $('#ynMatrixRow');
    ynMatrixRow.classList.add('is-hidden');
    ynMatrixRow.style.display = 'none';
    $('#qDragSelectN').value = q.drag_select_required || '';

    // Update UI hints for current type
    updateUIHints(type);

    // Event delegation on options container (attached once, not per render)
    if (optWrap && !optWrap._delegated) {
      optWrap._delegated = true;

      optWrap.addEventListener('input', (e) => {
        const curQ = state.filtered[state.currentIndex];
        if (!curQ) return;
        const idx = Number(e.target.getAttribute('data-idx'));
        if (isNaN(idx)) return;

        if (e.target.classList.contains('opt-text')) {
          curQ.options[idx] = e.target.value;
          syncFromForm();
          renderPreview(curQ);
          markUnsaved();
        } else if (e.target.classList.contains('stmt-text')) {
          if (!Array.isArray(curQ.statements)) curQ.statements = [];
          curQ.statements[idx] = e.target.value;
          syncFromForm();
          renderPreview(curQ);
          markUnsaved();
        }
      });

      optWrap.addEventListener('change', (e) => {
        const curQ = state.filtered[state.currentIndex];
        if (!curQ) return;
        const idx = Number(e.target.getAttribute('data-idx'));
        if (isNaN(idx)) return;

        if (e.target.classList.contains('yn-correct')) {
          const val = Number(e.target.value); // 0=Yes, 1=No
          if (!Array.isArray(curQ.correct)) curQ.correct = [];
          curQ.correct[idx] = val;
          $('#qCorrect').value = curQ.correct.join(',');
          syncFromForm();
          renderPreview(curQ);
          markUnsaved();
        } else if (e.target.classList.contains('opt-correct')) {
          if ($('#qType').value === 'STANDARD') {
            // single choice: only one correct
            curQ.correct = idx;
            // uncheck others
            $$('.opt-correct').forEach(other => { if (other !== e.target) other.checked = false; });
          } else {
            // multi-like types: correct as array
            const arr = Array.isArray(curQ.correct) ? curQ.correct.slice() : [];
            if (e.target.checked && !arr.includes(idx)) arr.push(idx);
            if (!e.target.checked) {
              const pos = arr.indexOf(idx);
              if (pos >= 0) arr.splice(pos, 1);
            }
            curQ.correct = arr;
          }
          $('#qCorrect').value = Array.isArray(curQ.correct) ? curQ.correct.join(',') : String(curQ.correct ?? '');
          syncFromForm();
          renderPreview(curQ);
          markUnsaved();
        }
      });

      optWrap.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.opt-del');
        if (!delBtn) return;
        const curQ = state.filtered[state.currentIndex];
        if (!curQ) return;
        const idx = Number(delBtn.getAttribute('data-idx'));
        if (isNaN(idx)) return;
        const curType = curQ.question_type || (Array.isArray(curQ.correct) ? 'MULTI' : 'STANDARD');

        if (curType === 'YES_NO_MATRIX') {
          if (Array.isArray(curQ.statements)) curQ.statements.splice(idx, 1);
          if (Array.isArray(curQ.correct)) curQ.correct.splice(idx, 1);
        } else {
          curQ.options.splice(idx, 1);
          // reindex correct
          if (Array.isArray(curQ.correct)) {
            curQ.correct = curQ.correct.filter(i => i !== idx).map(i => i > idx ? i - 1 : i);
          } else if (typeof curQ.correct === 'number') {
            if (curQ.correct === idx) curQ.correct = undefined; else if (curQ.correct > idx) curQ.correct -= 1;
          }
        }
        renderForm();
      });
    }

    renderPreview(q);
    updateValidationPanel(q);
  }

  function syncFromForm(){
    const q = state.filtered[state.currentIndex];
    if (!q) return;
    q.id = Number($('#qId').value) || q.id;
    q.module = $('#qModule').value;
    const type = $('#qType').value;
    q.question_type = (type==='STANDARD' || type==='MULTI') ? undefined : type; // standardize
    q.question = $('#qText').value;
    q.explanation = $('#qExplanation').value;

    // images
    const qi = $('#qImages').value.split(/\n+/).map(s=>s.trim()).filter(Boolean).map(fn=>({filename:fn}));
    const ei = $('#eImages').value.split(/\n+/).map(s=>s.trim()).filter(Boolean).map(fn=>({filename:fn}));
    q.question_images = qi.length? qi : undefined;
    q.explanation_images = ei.length? ei : undefined;

    // correct
    const corrText = $('#qCorrect').value.trim();
    if (type==='STANDARD') {
      q.correct = corrText ? Number(corrText) : undefined;
    } else if (type==='SEQUENCE') {
      q.correct = corrText ? corrText.split(',').map(s=>Number(s.trim())).filter(n=>!isNaN(n)) : [];
    } else {
      // MULTI or DRAG_DROP_SELECT or YES_NO_MATRIX
      q.correct = corrText ? corrText.split(',').map(s=>Number(s.trim())).filter(n=>!isNaN(n)) : Array.isArray(q.correct)? q.correct: [];
    }

    if (type==='DRAG_DROP_SELECT') {
      const n = Number($('#qDragSelectN').value);
      if (!isNaN(n) && n>0) q.drag_select_required = n; else delete q.drag_select_required;
    } else {
      delete q.drag_select_required;
    }

    if (type==='YES_NO_MATRIX') {
      // For YES_NO_MATRIX, statements and correct are edited inline via event listeners
      // Just ensure they exist and options are set correctly
      q.options = ['Yes','No'];
      if (!Array.isArray(q.statements)) q.statements = [];
      if (!Array.isArray(q.correct)) q.correct = [];
      // Ensure correct array matches statements length
      while (q.correct.length < q.statements.length) q.correct.push(1); // default No
      if (q.correct.length > q.statements.length) q.correct = q.correct.slice(0, q.statements.length);
    } else {
      delete q.statements;
    }

    updateValidationPanel(q);
  }

  function addOption(){
    const q = state.filtered[state.currentIndex];
    if (!q) return;
    const type = $('#qType').value;
    if (type === 'YES_NO_MATRIX') {
      // Add new statement
      if (!Array.isArray(q.statements)) q.statements = [];
      q.statements.push('New statement');
      if (!Array.isArray(q.correct)) q.correct = [];
      q.correct.push(1); // default to No
    } else {
      q.options.push('New option');
    }
    renderForm();
  }

  function addNew(){
    const maxId = state.items.reduce((m,q)=> typeof q.id==='number' ? Math.max(m,q.id) : m, 0);
    const q = { id: maxId+1, question: '', options: ['Option A','Option B','Option C','Option D'], correct: 0, module: '' };
    state.items.push(q);
    markUnsaved(); // Mark as unsaved when adding new question
    applyFilter();
    state.currentIndex = state.filtered.findIndex(it=>it===q);
    renderForm();
    renderList();
  }

  function applyFilter(){
    const term = ($('#searchInput').value || '').toLowerCase();
    const filterType = $('#filterType')?.value || '';
    const filterCategory = $('#filterCategory')?.value || '';

    state.filtered = state.items.filter(q => {
      // Text search filter
      const idHit = String(q.id||'').includes(term);
      const textHit = (q.question||'').toLowerCase().includes(term);
      const searchMatch = !term || idHit || textHit;

      // Type filter
      const qType = q.question_type || (Array.isArray(q.correct) ? 'MULTI' : 'STANDARD');
      const typeMatch = !filterType || qType === filterType;

      // Category filter
      const categoryMatch = !filterCategory || (q.module || '').toLowerCase() === filterCategory.toLowerCase();

      return searchMatch && typeMatch && categoryMatch;
    });
    if (state.currentIndex >= state.filtered.length) state.currentIndex = state.filtered.length-1;
  }

  function updateCategoryFilter(){
    // Populate category filter with unique categories from current exam
    const categories = new Set();
    state.items.forEach(q => {
      if (q.module && q.module.trim()) {
        categories.add(q.module.trim());
      }
    });

    const filterCategory = $('#filterCategory');
    if (filterCategory) {
      // Keep selected value
      const selectedValue = filterCategory.value;

      // Clear and rebuild options
      filterCategory.innerHTML = '<option value="">All Categories</option>';
      Array.from(categories).sort().forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        filterCategory.appendChild(option);
      });

      // Restore selection if still valid
      if (selectedValue && categories.has(selectedValue)) {
        filterCategory.value = selectedValue;
      }
    }
  }

  async function saveAll(options = {}){
    const notifySuccess = options.notifySuccess !== false;
    syncFromForm();
    const examId = state.exam === 'custom' && state.customCode ? state.customCode : state.exam;
    if (!examId) { notify('Select or load an exam first'); return false; }
    if (!window.ExamApp.isSafeExamId(examId)) { notify('Invalid exam id'); return false; }
    const validation = window.ExamApp.validateExamData(state.items);
    if (!validation.valid) {
      notify(`Cannot save: ${validation.errors[0]}`);
      return false;
    }
    window.ExamApp.log('Saving exam to browser storage:', examId);
    window.ExamApp.log('Exam ID:', examId);
    window.ExamApp.log('Number of questions:', state.items.length);
    window.ExamApp.log('Current question:', state.filtered[state.currentIndex]);

    const existingMetadata = window.userExams?.[examId]?.metadata;
    const finalMetadata = existingMetadata || (window.examManager
      ? window.examManager.generateMetadata(examId, state.items)
      : null);

    let savedToIndexedDB = false;
    if (window.ExamApp.examStorage) {
      try {
        savedToIndexedDB = await window.ExamApp.examStorage.putExam(examId, state.items, finalMetadata, { source: 'editor' });
      } catch (error) {
        window.ExamApp.warn(`IndexedDB save failed for ${examId}, trying legacy storage:`, error);
      }
    }

    try {
      if (window.ExamApp.examStorage) {
        window.ExamApp.examStorage.putLegacyExam(examId, state.items, finalMetadata);
      } else {
        localStorage.setItem(`custom_${examId}_questions`, JSON.stringify(state.items));
        if (finalMetadata) localStorage.setItem(`exam_metadata_${examId}`, JSON.stringify(finalMetadata));
      }
    } catch (error) {
      if (!savedToIndexedDB) {
        notify(error?.name === 'QuotaExceededError' ? 'Browser storage is full. Export your edits before adding more content.' : 'Could not save this exam in browser storage.');
        return false;
      }
      window.ExamApp.warn(`Legacy localStorage mirror skipped for ${examId}:`, error);
    }
    window.ExamApp.addToRegistry(window.ExamApp.STORAGE_KEYS.exams, examId);

    // Also update window.userExams so changes are immediately available
    if (!window.userExams) window.userExams = {};
    if (!window.userExams[examId]) window.userExams[examId] = {};
    window.userExams[examId].questions = state.items;
    window.userExams[examId].storage = savedToIndexedDB ? 'indexedDB' : 'localStorage';

    // Preserve or generate metadata
    if (finalMetadata) {
      window.userExams[examId].metadata = finalMetadata;
    }

    window.ExamApp.log('✅ Saved successfully to browser storage and window.userExams');

    // Mark as saved and update hash
    state.hasUnsavedChanges = false;
    state.savedItemsHash = hashItems(state.items);
    updateUnsavedIndicator();
    updatePersistenceHint();

    // Gentle toast-ish feedback without blocking
    if (notifySuccess) {
      notify('Saved locally in this browser. Open a PR to publish changes, or an issue to request a correction.');
    }
    return true;
  }

  // Show hint about persisting changes to dump.json
  function updatePersistenceHint(){
    let hint = document.getElementById('persistence-hint');
    if (!hint) {
      const exportButton = document.getElementById('exportJson');
      if (!exportButton) return;

      hint = document.createElement('div');
      hint.id = 'persistence-hint';
      hint.style.cssText = 'background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;margin-top:12px;font-size:13px;color:#856404;';
      hint.innerHTML = '';

      // Insert after export button's parent
      exportButton.parentElement.parentElement.appendChild(hint);
    }

    const examId = state.exam === 'custom' && state.customCode ? state.customCode : state.exam || 'custom-exam';
    const safeExamId = escapeHtml(examId);
    hint.innerHTML = `
      <strong><i class="fas fa-info-circle"></i> Local edits only</strong>
      <p style="margin:8px 0 0 0;line-height:1.5;">Saving here changes only this browser. Other users keep seeing the published exam until a repository update is accepted.</p>
      <ol style="margin:8px 0 0 20px;padding:0;line-height:1.6;">
        <li>Click <em>Export Questions</em> to download <code>${safeExamId}_dump_YYYY-MM-DD.json</code>.</li>
        <li>For a direct contribution, open a pull request replacing <code>user-content/exams/${safeExamId}/dump.json</code>.</li>
        <li>If you only want to suggest a correction, open a GitHub issue with exam ID <code>${safeExamId}</code>, question ID, current text, and proposed correction.</li>
      </ol>
      <small style="opacity:0.8;">Until then, edits live in this browser's local storage.</small>
    `;

    // Only show hint if there are actual changes saved
    const hasLocalStorageChanges = localStorage.getItem(`custom_${examId}_questions`) !== null
      || window.userExams?.[examId]?.storage === 'indexedDB';
    hint.style.display = hasLocalStorageChanges ? 'block' : 'none';
  }

  async function clearOverride(){
    const examId = state.exam === 'custom' && state.customCode ? state.customCode : state.exam;
    const key = `custom_${examId}_questions`;
    const metaKey = `exam_metadata_${examId}`;

    if (!confirm('This will discard all browser-saved changes and reload from the original dump.json. Continue?')) {
      return;
    }

    localStorage.removeItem(key);
    localStorage.removeItem(metaKey);
    if (window.ExamApp.examStorage) {
      await window.ExamApp.examStorage.deleteExamContent(examId);
    }

    // Reload from master (original data)
    state.items = loadMaster(examId);
    state.savedItemsHash = hashItems(state.items);
    state.hasUnsavedChanges = false;
    applyFilter();
    state.currentIndex = 0;
    renderList();
    renderForm();
    updateUnsavedIndicator();
    updatePersistenceHint();

    notify('✓ Reset complete! Loaded original from dump.json');
  }

  function exportJson(){
    syncFromForm();
    const examId = state.exam === 'custom' && state.customCode ? state.customCode : state.exam;

    // Create filename with timestamp for clarity
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `${examId}_dump_${timestamp}.json`;

    const blob = new Blob([JSON.stringify(state.items, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    // Show success message with instructions
    showExportInstructions(examId, filename);
    window.ExamApp?.analytics?.trackEvent('editor_export_questions');
  }

  function showExportInstructions(examId, filename){
    const safeExamId = escapeHtml(examId);
    const safeFilename = escapeHtml(filename);
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s;';

    const content = document.createElement('div');
    content.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:500px;box-shadow:0 10px 40px rgba(0,0,0,0.3);';

    content.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <i class="fas fa-check-circle" style="font-size:32px;color:#28a745;"></i>
        <div>
          <h3 style="margin:0;color:#333;font-size:18px;">Export Complete!</h3>
          <p style="margin:4px 0 0 0;color:#666;font-size:14px;">Downloaded: <code>${safeFilename}</code></p>
        </div>
      </div>

      <div style="background:#e7f1ff;border:1px solid #2b7cff;border-radius:8px;padding:14px;margin-bottom:16px;">
        <strong style="color:#0b60a9;"><i class="fas fa-arrow-right"></i> Next Steps:</strong>
        <ol style="margin:8px 0 0 20px;padding:0;line-height:1.8;color:#333;">
          <li>Locate the downloaded file: <code>${safeFilename}</code>.</li>
          <li>Replace <code>user-content/exams/${safeExamId}/dump.json</code> (or create that folder for a brand-new exam).</li>
          <li>Optional: update <code>metadata.json</code> and copy any referenced images into <code>user-content/exams/${safeExamId}/images/</code>.</li>
          <li>Refresh the app (F5) or zip the folder and drag it into the home page importer to reuse elsewhere.</li>
        </ol>
      </div>

      <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;">
        <strong style="color:#856404;"><i class="fas fa-info-circle"></i> Note:</strong>
        <span style="color:#856404;">
          Backup the original dump.json before replacing. You can always use "Reset to Original" to restore.
        </span>
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="closeExportModal" class="btn primary" style="padding:10px 20px;">
          <i class="fas fa-check"></i> Got it
        </button>
      </div>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    document.getElementById('closeExportModal').addEventListener('click', () => {
      modal.style.animation = 'fadeOut 0.2s';
      setTimeout(() => modal.remove(), 200);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.animation = 'fadeOut 0.2s';
        setTimeout(() => modal.remove(), 200);
      }
    });
  }

  function importJson(){
    const fileInput = $('#fileInput');
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > window.ExamApp.EXAM_LIMITS.maxJsonBytes) {
        alert(`Invalid JSON: file is too large. Maximum size is ${Math.round(window.ExamApp.EXAM_LIMITS.maxJsonBytes / 1024 / 1024)} MB.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          const questions = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.questions) ? parsed.questions : null);
          if (!questions) throw new Error('JSON must be an array of questions or an object with a questions array');
          const validation = window.ExamApp.validateExamData(questions);
          if (!validation.valid) {
            throw new Error(validation.errors.slice(0, 3).join('; '));
          }
          state.items = questions;
          applyFilter();
          state.currentIndex = 0;
          renderList();
          renderForm();
          window.ExamApp?.analytics?.trackEvent('editor_import_questions');
        } catch(err){
          alert('Invalid JSON: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
    fileInput.click();
  }

  function deleteCurrent(){
    const q = state.filtered[state.currentIndex];
    if (!q) return;

    // Check if user has disabled delete confirmation
    const skipConfirmation = localStorage.getItem('editor_skip_delete_confirmation') === 'true';

    if (!skipConfirmation) {
      // Show custom confirmation modal with "Don't ask again" checkbox
      showDeleteConfirmation((confirmed, dontAskAgain) => {
        if (confirmed) {
          if (dontAskAgain) {
            localStorage.setItem('editor_skip_delete_confirmation', 'true');
          }
          performDelete(q);
        }
      });
    } else {
      // Skip confirmation, delete directly
      performDelete(q);
    }
  }

  async function performDelete(q){
    const idx = state.items.indexOf(q);
    if (idx >= 0) {
      state.items.splice(idx, 1);

      // Auto-save after delete (persist to browser storage and window.userExams)
      const saved = await saveAll({ notifySuccess: false });
      if (!saved) {
        state.items.splice(idx, 0, q);
        applyFilter();
        state.currentIndex = Math.max(0, Math.min(idx, state.filtered.length - 1));
        renderList();
        renderForm();
        notify('Question was not deleted because saving failed.');
        return;
      }

      applyFilter();
      state.currentIndex = Math.max(0, Math.min(state.currentIndex, state.filtered.length - 1));
      renderList();
      renderForm();

      // Show success notification
      notify('✓ Question deleted and saved!');
    }
  }

  function showDeleteConfirmation(callback){
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s;';

    // Create modal
    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:400px;box-shadow:0 10px 40px rgba(0,0,0,0.3);animation:slideIn 0.3s;';

    modal.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <i class="fas fa-exclamation-triangle" style="font-size:32px;color:#dc3545;"></i>
        <div>
          <h3 style="margin:0;color:#333;font-size:18px;">Delete Question?</h3>
          <p style="margin:4px 0 0 0;color:#666;font-size:14px;">This action will permanently delete the question from the exam file.</p>
        </div>
      </div>

      <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;margin-bottom:16px;">
        <p style="margin:0;font-size:13px;color:#856404;">
          <strong><i class="fas fa-info-circle"></i> Note:</strong> The question will be removed immediately and saved automatically. This cannot be undone unless you use "Reset to Original" to restore all original questions.
        </p>
      </div>

      <label style="display:flex;align-items:center;gap:8px;margin-bottom:16px;cursor:pointer;user-select:none;">
        <input type="checkbox" id="dontAskAgain" style="width:18px;height:18px;cursor:pointer;">
        <span style="font-size:14px;color:#555;">Don't ask me again for this session</span>
      </label>

      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="cancelDelete" class="btn" style="padding:10px 20px;">
          <i class="fas fa-times"></i> Cancel
        </button>
        <button id="confirmDelete" class="btn danger" style="padding:10px 20px;">
          <i class="fas fa-trash"></i> Delete
        </button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Add animations (only once)
    if (!document.getElementById('delete-modal-styles')) {
      const style = document.createElement('style');
      style.id = 'delete-modal-styles';
      style.textContent = `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
      `;
      document.head.appendChild(style);
    }

    // Event handlers
    const closeModal = () => {
      overlay.style.animation = 'fadeOut 0.2s';
      setTimeout(() => overlay.remove(), 200);
    };

    document.getElementById('cancelDelete').addEventListener('click', () => {
      closeModal();
      callback(false, false);
    });

    document.getElementById('confirmDelete').addEventListener('click', () => {
      const dontAskAgain = document.getElementById('dontAskAgain').checked;
      closeModal();
      callback(true, dontAskAgain);
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal();
        callback(false, false);
      }
    });

    // Close on Escape key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        callback(false, false);
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

  }

  // ------- Preview -------
  function appendTextWithLineBreaks(parent, value) {
    const lines = String(value || '').split(/\\n|\n/);
    lines.forEach((line, index) => {
      if (index > 0) parent.appendChild(document.createElement('br'));
      parent.appendChild(document.createTextNode(line));
    });
  }

  function createTextSpan(className, value) {
    const span = document.createElement('span');
    if (className) span.className = className;
    span.textContent = value;
    return span;
  }

  function appendTitle(parent, className, value) {
    const title = document.createElement('div');
    title.className = className;
    title.textContent = value;
    parent.appendChild(title);
  }

  function renderPreview(q){
    // Helper to map option index => letter
    const letter = (i) => String.fromCharCode(65 + i);
    const pvType = $('#pvType');
    const pvQuestion = $('#pvQuestion');
    const pvQImages = $('#pvQImages');
    const pvOptions = $('#pvOptions');
    const pvExplanation = $('#pvExplanation');
    const pvEImages = $('#pvEImages');

  const type = q.question_type || (Array.isArray(q.correct) ? 'MULTI' : 'STANDARD');
    pvType.textContent = type;

    // Render question text with simple markdown image stripping (images shown separately)
    const stripMdImages = (t) => String(t || '').replace(/!\[[^\]]*\]\([^\)]+\)/g, '');
    pvQuestion.replaceChildren();
    appendTextWithLineBreaks(pvQuestion, stripMdImages(q.question || ''));

    // Question images
    pvQImages.innerHTML = '';
    if (Array.isArray(q.question_images) && q.question_images.length){
      q.question_images.forEach(im => {
        if (!window.ExamApp.isSafeImageFileName(im.filename)) {
          pvQImages.appendChild(warn(`Invalid image filename: ${im.filename}`));
          return;
        }
        const img = document.createElement('img');
        img.src = `./images/${im.filename}`;
        img.alt = 'Question image';
        img.onerror = () => { img.replaceWith(warn(`Image not found: ${im.filename}`)); };
        pvQImages.appendChild(img);
      });
    }

    // Options area by type
    pvOptions.innerHTML = '';
    if (type === 'YES_NO_MATRIX') {
      const stmts = Array.isArray(q.statements) ? q.statements : [];
      (stmts).forEach((s, i) => {
        const row = document.createElement('div');
        row.className = 'pv-yn-row';
        const lbl = document.createElement('div'); lbl.textContent = s;
        const ans = document.createElement('div'); ans.className = 'pv-yn-ans pv-clickable';
        const val = Array.isArray(q.correct) ? q.correct[i] : undefined; // 0 Yes, 1 No
        const setVal = (v)=>{ if (!Array.isArray(q.correct)) q.correct=[]; q.correct[i]=v; renderPreview(q); };
        ans.textContent = val === 0 ? 'Yes' : val === 1 ? 'No' : '-';
        ans.title = 'Click to toggle Yes/No';
        ans.addEventListener('click', ()=> setVal(val === 0 ? 1 : 0));
        row.appendChild(lbl); row.appendChild(ans);
        pvOptions.appendChild(row);
      });
    } else if (type === 'SEQUENCE') {
      // Single-column reorder UI: show all options in current order with Up/Down controls
      const n = (q.options || []).length;
      // Build a full order: start from q.correct if valid, append any missing indices, and drop out-of-range
      const seen = new Set();
      const base = Array.isArray(q.correct) ? q.correct.filter(i => Number.isInteger(i) && i >= 0 && i < n && !seen.has(i) && seen.add(i)) : [];
      for (let i = 0; i < n; i++) if (!seen.has(i)) base.push(i);
      const order = base;
      const col = document.createElement('div');
      col.className = 'pv-col';
      appendTitle(col, 'pv-col-title', 'Order from top to bottom');
      order.forEach((idx, pos) => {
        const row = document.createElement('div');
        row.className = 'pv-chip';
        row.appendChild(createTextSpan('', `${pos + 1}.`));
        row.appendChild(createTextSpan('', (q.options || [])[idx] || ''));
        const up = document.createElement('button'); up.textContent = '↑'; up.className = 'x'; up.disabled = pos === 0;
        const down = document.createElement('button'); down.textContent = '↓'; down.className = 'x'; down.disabled = pos === order.length - 1;
        up.addEventListener('click', () => {
          const a = order.slice();
          [a[pos - 1], a[pos]] = [a[pos], a[pos - 1]];
          q.correct = a;
          renderPreview(q);
        });
        down.addEventListener('click', () => {
          const a = order.slice();
          [a[pos + 1], a[pos]] = [a[pos], a[pos + 1]];
          q.correct = a;
          renderPreview(q);
        });
        row.appendChild(up);
        row.appendChild(down);
        col.appendChild(row);
      });
      pvOptions.appendChild(col);
    } else {
      // STANDARD / MULTI / DRAG_DROP_SELECT
      if (type === 'DRAG_DROP_SELECT') {
        const required = q.drag_select_required || (Array.isArray(q.correct) ? q.correct.length : 0) || 2;
        const wrap = document.createElement('div'); wrap.className = 'pv-dd-wrap';
        const src = document.createElement('div'); src.className = 'pv-dd-source'; appendTitle(src, 'pv-dd-title', 'Options');
        const tgt = document.createElement('div'); tgt.className = 'pv-dd-target'; appendTitle(tgt, 'pv-dd-title', `Your selections (max ${required})`);
        const sel = Array.isArray(q.correct) ? q.correct.slice() : [];
        // Source buttons for non-selected
        (q.options||[]).forEach((opt, idx) => {
          if (!sel.includes(idx)){
            const btn = document.createElement('button'); btn.type='button'; btn.className='pv-dd-btn';
            btn.appendChild(createTextSpan('pv-letters', letter(idx)));
            btn.appendChild(document.createTextNode(` ${opt}`));
            // Click to add
            btn.addEventListener('click', ()=>{ if (sel.length < required){ sel.push(idx); q.correct=sel; renderPreview(q); }});
            // Drag support
            btn.setAttribute('draggable', 'true');
            btn.addEventListener('dragstart', (ev) => {
              ev.dataTransfer.setData('text/plain', String(idx));
              ev.dataTransfer.effectAllowed = 'copy';
            });
            src.appendChild(btn);
          }
        });
        // Target chips
        sel.forEach((idx) => {
          const chip = document.createElement('div'); chip.className='pv-dd-chip';
          chip.appendChild(createTextSpan('pv-letters', letter(idx)));
          chip.appendChild(document.createTextNode(' '));
          chip.appendChild(createTextSpan('', (q.options || [])[idx] || ''));
          const rm = document.createElement('button'); rm.className='rm'; rm.textContent='×';
          rm.addEventListener('click', ()=>{ const pos=sel.indexOf(idx); if (pos>=0){ sel.splice(pos,1); q.correct=sel; renderPreview(q); }});
          chip.appendChild(rm);
          tgt.appendChild(chip);
        });
        // Enable drop on target
        tgt.addEventListener('dragover', (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; });
        tgt.addEventListener('dragenter', () => { tgt.style.borderColor = '#2b7cff'; tgt.style.background = '#f0f6ff'; });
        tgt.addEventListener('dragleave', () => { tgt.style.borderColor = '#e1e1e1'; tgt.style.background = ''; });
        tgt.addEventListener('drop', (ev) => {
          ev.preventDefault();
          const data = ev.dataTransfer.getData('text/plain');
          const idx = Number(data);
          if (Number.isInteger(idx) && idx >= 0 && idx < (q.options||[]).length) {
            if (!sel.includes(idx) && sel.length < required) {
              sel.push(idx); q.correct = sel; renderPreview(q);
            }
          }
          tgt.style.borderColor = '#e1e1e1'; tgt.style.background = '';
        });
        wrap.appendChild(src); wrap.appendChild(tgt);
        pvOptions.appendChild(wrap);
      } else {
        const isMulti = type === 'MULTI';
        const corr = Array.isArray(q.correct) ? q.correct : (typeof q.correct === 'number' ? [q.correct] : []);
        (q.options||[]).forEach((opt, idx) => {
          const div = document.createElement('div');
          div.className = 'pv-option pv-clickable';
          if (corr.includes(idx)) div.classList.add('selected');
          div.appendChild(createTextSpan('pv-letters', letter(idx)));
          const optionText = document.createElement('div');
          optionText.textContent = opt;
          div.appendChild(optionText);
          div.addEventListener('click', ()=>{
            if (isMulti) {
              const a = Array.isArray(q.correct) ? q.correct.slice() : [];
              const p = a.indexOf(idx); if (p>=0) a.splice(p,1); else a.push(idx);
              q.correct = a; renderPreview(q);
            } else {
              q.correct = idx; renderPreview(q);
            }
          });
          pvOptions.appendChild(div);
        });
      }
    }

    // Explanation
    pvExplanation.replaceChildren();
    if (q.explanation) {
      const label = document.createElement('strong');
      label.textContent = 'Explanation:';
      pvExplanation.appendChild(label);
      pvExplanation.appendChild(document.createElement('br'));
      appendTextWithLineBreaks(pvExplanation, stripMdImages(q.explanation));
    }
    pvEImages.innerHTML = '';
    if (Array.isArray(q.explanation_images) && q.explanation_images.length){
      q.explanation_images.forEach(im => {
        if (!window.ExamApp.isSafeImageFileName(im.filename)) {
          pvEImages.appendChild(warn(`Invalid image filename: ${im.filename}`));
          return;
        }
        const img = document.createElement('img');
        img.src = `./images/${im.filename}`;
        img.alt = 'Explanation image';
        img.onerror = () => { img.replaceWith(warn(`Image not found: ${im.filename}`)); };
        pvEImages.appendChild(img);
      });
    }
  }

  function warn(text){
    const div = document.createElement('div');
    div.className = 'small danger';
    div.textContent = text;
    return div;
  }

  function notify(text){
    let toast = document.getElementById('editor-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'editor-toast';
      toast.style.position = 'fixed';
      toast.style.bottom = '20px';
      toast.style.right = '20px';
      toast.style.background = '#2b7cff';
      toast.style.color = '#fff';
      toast.style.padding = '10px 14px';
      toast.style.borderRadius = '8px';
      toast.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)';
      toast.style.zIndex = '9999';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.opacity = '1';
    clearTimeout(notify._t);
    notify._t = setTimeout(()=>{ toast.style.opacity = '0'; }, 1400);
  }

  // Hash function for change detection
  function hashItems(items){
    return JSON.stringify(items.map(q => ({
      id: q.id,
      question: q.question,
      options: q.options,
      correct: q.correct,
      module: q.module
    })));
  }

  // Mark changes as unsaved
  function markUnsaved(){
    const currentHash = hashItems(state.items);
    if (currentHash !== state.savedItemsHash) {
      state.hasUnsavedChanges = true;
      updateUnsavedIndicator();
    }
  }

  // Update unsaved changes indicator
  function updateUnsavedIndicator(){
    const headerStatus = document.getElementById('editorSaveState');
    const footerStatus = document.getElementById('saveStatus');
    const icon = state.hasUnsavedChanges ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
    const label = state.hasUnsavedChanges ? 'Unsaved edits' : 'No unsaved edits';
    const title = state.hasUnsavedChanges
      ? 'This question has edits that are not saved in browser storage'
      : 'Current question has no unsaved edits';

    [headerStatus, footerStatus].forEach(status => {
      if (!status) return;
      status.classList.toggle('is-dirty', state.hasUnsavedChanges);
      status.innerHTML = `<i aria-hidden="true" class="${icon}"></i><span>${label}</span>`;
      status.title = title;
      status.setAttribute('aria-label', label);
    });

    const indicator = document.getElementById('unsaved-indicator');
    if (state.hasUnsavedChanges) {
      if (indicator) indicator.style.display = 'inline-block';
    } else {
      if (indicator) indicator.style.display = 'none';
    }
  }

  // Warn before leaving with unsaved changes
  function setupBeforeUnloadWarning(){
    window.addEventListener('beforeunload', (e) => {
      if (state.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    });
  }

  // Helper function to show/hide UI hints based on question type
  function updateValidationPanel(question) {
    const panel = $('#editorValidation');
    const text = $('#editorValidationText');
    if (!panel || !text || !question) return;

    const result = window.ExamApp.validateExamData([question]);
    panel.classList.remove('editor-validation-ok', 'editor-validation-warning', 'editor-validation-error');
    if (!result.valid) {
      panel.classList.add('editor-validation-error');
      text.textContent = result.errors[0] || 'Question needs attention';
    } else if (result.warnings.length > 0) {
      panel.classList.add('editor-validation-warning');
      text.textContent = result.warnings[0];
    } else {
      panel.classList.add('editor-validation-ok');
      text.textContent = 'Question is valid';
    }
  }

  function updateUIHints(type) {
    const sequenceHint = $('#sequenceHint');
    const optionsHelp = $('#optionsHelp');
    const addOptionBtn = $('#addOption');

    if (type === 'SEQUENCE') {
      if (sequenceHint) sequenceHint.style.display = 'block';
      if (optionsHelp) optionsHelp.textContent = 'Use Preview panel below to set correct order';
      if (addOptionBtn) addOptionBtn.innerHTML = '<i class="fas fa-plus"></i> Add Option';
    } else if (type === 'YES_NO_MATRIX') {
      if (sequenceHint) sequenceHint.style.display = 'none';
      if (optionsHelp) optionsHelp.textContent = 'Select Yes or No for each statement';
      if (addOptionBtn) addOptionBtn.innerHTML = '<i class="fas fa-plus"></i> Add Statement';
    } else {
      if (sequenceHint) sequenceHint.style.display = 'none';
      if (optionsHelp) optionsHelp.textContent = 'Check the boxes next to correct answers';
      if (addOptionBtn) addOptionBtn.innerHTML = '<i class="fas fa-plus"></i> Add Option';
    }
  }

  // Bind events
  function bind(){
    $('#examSelect').addEventListener('change', ()=>{
      setActiveExam($('#examSelect').value);
    });
    $('#searchInput').addEventListener('input', ()=>{ applyFilter(); renderList(); });

    // Filter event listeners
    if ($('#filterType')) {
      $('#filterType').addEventListener('change', ()=>{ applyFilter(); renderList(); });
    }
    if ($('#filterCategory')) {
      $('#filterCategory').addEventListener('change', ()=>{ applyFilter(); renderList(); });
    }
    $('#addNew').addEventListener('click', addNew);
    $('#addOption').addEventListener('click', addOption);
  // Single Save button
  $('#save').addEventListener('click', () => saveAll());
    $('#clearOverride').addEventListener('click', clearOverride);
    $('#exportJson').addEventListener('click', exportJson);
    $('#importJson').addEventListener('click', importJson);
    $('#deleteCurrent').addEventListener('click', deleteCurrent);
    $('#qType').addEventListener('change', ()=>{
      const q = state.filtered[state.currentIndex];
      if (!q) return;
      const newType = $('#qType').value;
      // Apply type-specific mutations immediately
      if (newType === 'STANDARD') {
        q.question_type = undefined;
        if (Array.isArray(q.correct)) q.correct = q.correct.length ? q.correct[0] : undefined;
        delete q.drag_select_required;
        delete q.statements;
        if (!Array.isArray(q.options) || q.options.length === 0) q.options = ['Option A','Option B'];
      } else if (newType === 'MULTI') {
        q.question_type = undefined;
        if (!Array.isArray(q.options) || q.options.length < 2) q.options = ['Option A','Option B','Option C'];
        if (!Array.isArray(q.correct)) q.correct = typeof q.correct === 'number' ? [q.correct] : [];
        delete q.drag_select_required;
        delete q.statements;
      } else if (newType === 'SEQUENCE') {
        q.question_type = 'SEQUENCE';
        if (!Array.isArray(q.options) || q.options.length < 2) q.options = ['Step 1','Step 2','Step 3'];
        if (!Array.isArray(q.correct) || q.correct.length === 0) q.correct = q.options.map((_,i)=>i);
        delete q.drag_select_required;
        delete q.statements;
      } else if (newType === 'DRAG_DROP_SELECT') {
        q.question_type = 'DRAG_DROP_SELECT';
        if (!Array.isArray(q.options) || q.options.length < 3) q.options = ['Item A','Item B','Item C','Item D'];
        if (!Array.isArray(q.correct)) q.correct = [];
        q.drag_select_required = Array.isArray(q.correct) ? Math.max(1, Math.min(3, q.correct.length || 2)) : 2;
        delete q.statements;
      } else if (newType === 'YES_NO_MATRIX') {
        q.question_type = 'YES_NO_MATRIX';
        q.options = ['Yes','No'];
        if (!Array.isArray(q.statements) || q.statements.length === 0) {
          q.statements = ['Statement 1','Statement 2','Statement 3'];
        }
        q.correct = new Array(q.statements.length).fill(1); // default No
        delete q.drag_select_required;
      }
      // Update UI hints for SEQUENCE type
      updateUIHints(newType);
      renderForm();
    });

    // Live preview updates for inputs. Mark dirty after form values are synced into state.
    const debouncedSyncAndPreview = debounce(() => {
      syncFromForm();
      markUnsaved();
      renderPreview(state.filtered[state.currentIndex]);
      updateValidationPanel(state.filtered[state.currentIndex]);
    }, 150);

    ['#qText', '#qExplanation', '#qImages', '#eImages', '#qCorrect', '#qDragSelectN', '#qStatements'].forEach(sel => {
      const el = $(sel);
      if (el) el.addEventListener('input', () => { debouncedSyncAndPreview(); });
    });

    // Image upload handlers (dev local server)
    async function uploadFiles(inputEl, targetTextarea){
      const files = Array.from(inputEl.files||[]);
      if (!files.length) return;
      const exam = state.exam;
      if (!window.ExamApp.isSafeExamId(exam)) { notify('Invalid exam id'); return; }
      const results = [];
      for (const f of files){
        try {
          if (!window.ExamApp.isSafeImageFileName(f.name)) {
            throw new Error('Unsupported image filename or type');
          }
          if (f.size > window.ExamApp.EXAM_LIMITS.maxImageBytes) {
            throw new Error(`Image exceeds ${Math.round(window.ExamApp.EXAM_LIMITS.maxImageBytes / 1024 / 1024)} MB`);
          }
          const url = `/__upload_images?exam=${encodeURIComponent(exam)}&name=${encodeURIComponent(f.name)}`;
          const res = await fetch(url, { method: 'PUT', body: f });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (data && data.filename) results.push(data.filename);
        } catch (e) {
          notify(`Upload failed: ${f.name}`);
        }
      }
      if (results.length){
        const existing = targetTextarea.value.trim();
        targetTextarea.value = existing ? (existing + '\n' + results.join('\n')) : results.join('\n');
        targetTextarea.dispatchEvent(new Event('input'));
        notify(`Uploaded ${results.length} file(s)`);
      }
      inputEl.value = '';
    }
    $('#qImgUpload').addEventListener('click', ()=> uploadFiles($('#qImgFiles'), $('#qImages')));
    $('#eImgUpload').addEventListener('click', ()=> uploadFiles($('#eImgFiles'), $('#eImages')));

    // Load custom exam from exam-dumps/<code>.json
    $('#loadCustomExam')?.addEventListener('click', async()=>{
      const code = ($('#customExamCode').value||'').trim();
      if (!code) { notify('Enter an exam code'); return; }
      if (!window.ExamApp.isSafeExamId(code)) { notify('Invalid exam code'); return; }
      try {
        const resp = await fetch(`./exam-dumps/${encodeURIComponent(code)}.json`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        state.exam = 'custom';
        state.customCode = code;
        $('#examSelect').value = 'custom';
        state.items = Array.isArray(json) ? json : [];
        applyFilter();
        state.currentIndex = 0;
        renderList();
        renderForm();
        notify(`Loaded custom exam: ${code}`);
      } catch (e) {
        notify(`Failed to load exam-dumps/${code}.json`);
      }
    });

    $('#newExamBtn')?.addEventListener('click', ()=>{
      const code = ($('#customExamCode').value||'').trim();
      if (!code) { notify('Enter a code in the field first'); return; }
      if (!window.ExamApp.isSafeExamId(code)) { notify('Invalid exam code'); return; }
      state.exam = 'custom';
      state.customCode = code;
      $('#examSelect').value = 'custom';
      state.items = [];
      applyFilter();
      state.currentIndex = -1;
      renderList();
      notify(`New custom exam initialized: ${code}`);
    });
  }

  document.addEventListener('editorExamListReady', (event) => {
    const preferredExam = event?.detail?.defaultExamId || ($('#examSelect')?.value) || state.exam;
    if (preferredExam) {
      setActiveExam(preferredExam, { skipUnsavedCheck: true });
    }
  });

  // Initialize
  document.addEventListener('DOMContentLoaded', ()=>{
    bind();
    // Default exam
    state.items = loadWorkingSet(state.exam);
    state.savedItemsHash = hashItems(state.items); // Initialize saved hash
    updateCategoryFilter();
    applyFilter();
    state.currentIndex = 0;
    renderList();
    renderForm();
    updateUnsavedIndicator();
    updatePersistenceHint();
    setupBeforeUnloadWarning();

  });
})();
