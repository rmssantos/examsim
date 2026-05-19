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
      window.location.href = 'index.html';
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
  const examId = params.get('exam') || '';

  console.log(`📚 Loading exam: ${examId}`);

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
        console.log(`✅ ${imageCount} images available in IndexedDB for ${examId}`);
      } else {
        console.warn(`⚠️ No images found for exam "${examId}". Please re-import the ZIP file.`);
        const warningBanner = document.createElement('div');
        warningBanner.className = 'image-warning-banner';
        warningBanner.textContent = '⚠️ Images not loaded! Please go back to homepage and re-import the exam ZIP file.';
        document.body.appendChild(warningBanner);
      }
    } catch (e) {
      console.warn('Could not check image count:', e);
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

      // Load exam into simulator
      window.examSimulator.examData[examId] = {
        name: metadata.name,
        fullName: metadata.fullName,
        duration: metadata.duration,
        questionCount: metadata.questionCount,
        passScore: metadata.passScore,
        questions: examData.questions,
        modules: metadata.modules || []
      };

      console.log(`✅ Loaded ${examData.questions.length} questions for ${examId}`);
      window.examSimulator.startExam();
    }
  } else {
    console.error(`❌ Failed to load exam: ${examId}`);
    alert(`Exam ${examId} not found. Please import it first or check if it's activated.`);
  }
});
