(function initializeEditorPage() {
  'use strict';

  async function initializeEditorExamList() {
    await (window.examsLoadedPromise || Promise.resolve());
    const examSelect = document.getElementById('examSelect');

    try {
      const exams = await window.examManager.detectAvailableExams();
      examSelect.replaceChildren();

      if (exams.size === 0) {
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = 'No exams available';
        examSelect.appendChild(emptyOption);
        return;
      }

      let selectedExamId = null;
      exams.forEach((examData, examId) => {
        const option = document.createElement('option');
        const metadata = examData.metadata || {};
        const count = metadata.totalQuestions || metadata.questionCount || examData.questions?.length || 0;
        option.value = examId;
        option.textContent = `${metadata.name || examId.toUpperCase()} (${count} questions)`;
        examSelect.appendChild(option);
        if (!selectedExamId) selectedExamId = examId;
      });

      const customOption = document.createElement('option');
      customOption.value = 'custom';
      customOption.textContent = 'Custom (loaded)';
      examSelect.appendChild(customOption);

      if (selectedExamId) {
        examSelect.value = selectedExamId;
        await window.ExamApp.ensureExamLoaded(selectedExamId);
      }

      document.dispatchEvent(new CustomEvent('editorExamListReady', {
        detail: { defaultExamId: selectedExamId }
      }));
    } catch (error) {
      console.error('Failed to load exams in editor:', error);
      const errorOption = document.createElement('option');
      errorOption.value = '';
      errorOption.textContent = 'Error loading exams';
      examSelect.replaceChildren(errorOption);
    }
  }

  function initEditorTheme() {
    const toggle = document.getElementById('editorThemeToggle');
    const icon = document.getElementById('editorThemeIcon');
    const saved = localStorage.getItem('theme');

    if (saved === 'dark' || (!saved && window.matchMedia?.('(prefers-color-scheme: dark)').matches)) {
      document.body.classList.add('dark-mode');
      if (icon) icon.className = 'fas fa-sun';
    }

    toggle?.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      const isDark = document.body.classList.contains('dark-mode');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initEditorTheme();
    void initializeEditorExamList();
  });
})();
