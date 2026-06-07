// Close exam tab or navigate to homepage
window.ExamApp = window.ExamApp || {};
window.ExamApp.externalExamBootstrap = true;
document.body.dataset.examInitManaged = 'true';

function closeExamTab() {
  // Try to close the tab (works if opened via window.open)
  window.close();

  // If close() didn't work (tab still open), redirect after small delay
  setTimeout(() => {
    if (!window.closed) {
      window.location.href = window.ExamApp.router?.buildUrl('home') || 'index.html';
    }
  }, 100);
}

// Bind close buttons via addEventListener instead of inline onclick
document.getElementById('switch-exam')?.addEventListener('click', closeExamTab);
document.getElementById('back-to-home')?.addEventListener('click', closeExamTab);

// Dynamic exam loading from user-content
document.addEventListener('DOMContentLoaded', async function() {
  // Wait for exams to load via exam-loader.js
  if (window.examsLoadedPromise) {
    await window.examsLoadedPromise;
  }

  const params = new URLSearchParams(window.location.search);
  const route = window.ExamApp.router?.getRoute?.() || { page: 'exam' };
  const examId = params.get('exam') || '';
  const pageMode = route.page === 'study' || params.get('mode') === 'study' ? 'study' : 'exam';

  if (!window.ExamApp.isSafeExamId(examId)) {
    console.error('❌ Invalid exam id:', examId);
    alert('Invalid exam id. Please select an exam from the homepage.');
    closeExamTab();
    return;
  }

  try {
    await window.ExamApp.ensureExamLoaded(examId);
  } catch (error) {
    console.error('❌ Failed to load exam:', examId, error);
    alert(`Exam ${examId} could not be loaded. Please return to the homepage and try again.`);
    closeExamTab();
    return;
  }

  window.ExamApp.log(`📚 Loading exam: ${examId}`);

  // Set image loader to current exam
  if (window.imageLoader) {
    window.imageLoader.setCurrentExam(examId);
  }

  // Check if images are available — only warn if the exam actually uses images
  const examInfo = window.userExams && window.userExams[examId];
  const examHasImages = examInfo && (
    (examInfo.metadata && examInfo.metadata.hasImages) ||
    (examInfo.questions && examInfo.questions.some(q =>
      (q.question_images && q.question_images.length > 0) ||
      (q.explanation_images && q.explanation_images.length > 0)
    ))
  );

  if (examHasImages && window.imageStorage) {
    try {
      const imageCount = await window.imageStorage.getExamImageCount(examId);
      if (imageCount > 0) {
        window.ExamApp.log(`✅ ${imageCount} images available in IndexedDB for ${examId}`);
      } else {
        window.ExamApp.warn(`⚠️ No images found for exam "${examId}". Please re-import the ZIP file.`);
        const warningBanner = document.createElement('div');
        warningBanner.className = 'image-warning-banner';
        warningBanner.textContent = '⚠️ Images not loaded! Please go back to homepage and re-import the exam ZIP file.';
        document.body.appendChild(warningBanner);
      }
    } catch (e) {
      window.ExamApp.warn('Could not check image count:', e);
    }
  }

  // Check if exam exists in window.userExams (loaded by exam-loader.js)
  if (window.userExams && window.userExams[examId]) {
    const examData = window.userExams[examId];

    if (window.examSimulator) {
      window.examSimulator.currentExam = examId;

      // Generate metadata if not present
      let metadata = examData.metadata;
      if (!metadata || !metadata.name) {
        metadata = {
          name: examId.toUpperCase(),
          fullName: `Custom Exam: ${examId}`,
          duration: 60,
          questionCount: Math.min(examData.questions.length, 45),
          passScore: 70,
          modules: []
        };
      }

      // Check for modules URL parameter
      const modulesParam = params.get('modules');
      let questions = examData.questions;
      let isCustomModulePractice = false;
      let selectedModules = [];
      let fullName = metadata.fullName || `Custom Exam: ${examId}`;

      const originalQuestionCount = Math.max(1, metadata.questionCount || Math.min(examData.questions.length, 45));
      const originalDuration = metadata.duration || 60;
      const normalizeRequestedModule = value => String(value ?? '').trim().slice(0, 120);

      let questionCount = originalQuestionCount;
      let duration = originalDuration;

      if (modulesParam) {
        let parsed = null;
        if (modulesParam.trim().startsWith('[')) {
          try {
            parsed = JSON.parse(modulesParam);
          } catch (e) {
            window.ExamApp.warn('Failed to parse modules parameter as JSON:', e);
          }
        }
        if (Array.isArray(parsed)) {
          selectedModules = parsed.map(normalizeRequestedModule).filter(Boolean);
        } else {
          selectedModules = modulesParam.split(',').map(normalizeRequestedModule).filter(Boolean);
        }
        selectedModules = Array.from(new Set(selectedModules)).slice(0, 50);
        if (selectedModules.length > 0) {
          const selectedModulesLower = selectedModules.map(m => m.toLowerCase());
          questions = examData.questions.filter(q => {
            return q.module && selectedModulesLower.includes(q.module.trim().toLowerCase());
          });

          if (questions.length > 0) {
            isCustomModulePractice = true;
            // Append Module Practice suffix
            fullName = `${metadata.fullName || 'Practice Exam'} - Module Practice`;

            // Scale target question count
            questionCount = Math.min(questions.length, originalQuestionCount);

            // Scale timer duration proportionally (minimum 5 minutes)
            duration = Math.max(5, Math.round(questionCount * (originalDuration / originalQuestionCount)));
          } else {
            // Fallback to all questions if selection somehow mapped to 0
            questions = examData.questions;
          }
        }
      }

      // Load exam into simulator
      window.examSimulator.examData[examId] = {
        name: metadata.name || examId.toUpperCase(),
        fullName: fullName,
        duration: duration,
        questionCount: questionCount,
        passScore: metadata.passScore || 70,
        questions: questions,
        modules: metadata.modules || [],
        selectedModules: isCustomModulePractice ? selectedModules : null
      };

      window.ExamApp.log(`✅ Loaded ${questions.length} questions for ${examId} (Session Target: ${questionCount}, Duration: ${duration} mins)`);
      if (isCustomModulePractice) {
        window.ExamApp.log(`🎯 Module Practice Mode. Selected modules: ${selectedModules.join(', ')}`);
      }
      if (pageMode === 'study') {
        await window.examSimulator.startStudyMode();
      } else {
        window.examSimulator.startExam();
      }
    }
  } else {
    console.error('❌ Failed to load exam:', examId);
    alert(`Exam ${examId} not found. Please import it first or check if it's activated.`);
  }
});
