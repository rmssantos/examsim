/**
 * Shared utility functions for the Exam Simulator
 */

// Global namespace for ExamApp
window.ExamApp = window.ExamApp || {};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}
