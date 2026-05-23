// Spaced repetition scheduling for Study Mode.
(function () {
    'use strict';

    const DAY_MS = 24 * 60 * 60 * 1000;
    const RETRY_DELAY_MS = 15 * 60 * 1000;
    const MIN_EASE = 1.3;
    const DEFAULT_EASE = 2.5;

    function toTime(value) {
        const time = new Date(value || 0).getTime();
        return Number.isFinite(time) ? time : 0;
    }

    function hashString(value) {
        let hash = 2166136261;
        const text = String(value ?? '');
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    function normalizeQuestionId(questionId) {
        const value = String(questionId ?? '').trim().replace(/\s+/g, ' ');
        if (!value) return '';
        if (value.length <= 120) return value;
        return `q_${hashString(value)}_${encodeURIComponent(value).slice(0, 80)}`;
    }

    function getQuestionId(question, fallbackIndex = 0) {
        const value = String(question?.id ?? '').trim();
        return normalizeQuestionId(value || `question-${fallbackIndex + 1}`);
    }

    function getAccuracy(record) {
        const seenCount = Number(record?.seenCount || 0);
        if (seenCount <= 0) return 0;
        return Number(record?.correctCount || 0) / seenCount;
    }

    function isWeak(record) {
        const seenCount = Number(record?.seenCount || 0);
        if (seenCount <= 0) return false;
        return record?.lastResult === 'incorrect' || getAccuracy(record) < 0.7;
    }

    function classifyQuestion(record, nowMs = Date.now()) {
        if (!record) return 'new';
        if (toTime(record.nextDue) <= nowMs) return isWeak(record) ? 'weak_due' : 'due';
        if (isWeak(record)) return 'weak';
        return 'later';
    }

    function getPriority(status) {
        const priorities = {
            weak_due: 0,
            due: 1,
            new: 2,
            weak: 3,
            later: 4
        };
        return priorities[status] ?? 5;
    }

    function buildRecord(existing, details = {}) {
        const now = details.now instanceof Date ? details.now : new Date();
        const wasCorrect = Boolean(details.isCorrect);
        const previousSeenCount = Number(existing?.seenCount || 0);
        const previousIntervalDays = Number(existing?.intervalDays || 0);
        const previousEase = Number(existing?.easeFactor || DEFAULT_EASE);
        const easeFactor = wasCorrect
            ? Math.min(previousEase + 0.08, 3.2)
            : Math.max(MIN_EASE, previousEase - 0.2);

        let intervalDays = 0;
        let nextDueDate;
        if (wasCorrect) {
            if (previousSeenCount === 0) {
                intervalDays = 1;
            } else if (previousIntervalDays < 1) {
                intervalDays = 3;
            } else {
                intervalDays = Math.max(1, Math.round(previousIntervalDays * easeFactor));
            }
            nextDueDate = new Date(now.getTime() + intervalDays * DAY_MS);
        } else {
            intervalDays = 0;
            nextDueDate = new Date(now.getTime() + RETRY_DELAY_MS);
        }

        return {
            ...existing,
            examId: details.examId || existing?.examId || '',
            questionId: details.questionId || existing?.questionId || '',
            seenCount: previousSeenCount + 1,
            correctCount: Number(existing?.correctCount || 0) + (wasCorrect ? 1 : 0),
            lastSeen: now.toISOString(),
            nextDue: nextDueDate.toISOString(),
            easeFactor,
            intervalDays,
            lastResult: wasCorrect ? 'correct' : 'incorrect',
            updatedAt: now.toISOString()
        };
    }

    function reviseRecord(existing, details = {}) {
        if (!existing) return buildRecord(existing, details);

        const now = details.now instanceof Date ? details.now : new Date();
        const wasCorrect = Boolean(details.isCorrect);
        const previousWasCorrect = existing.lastResult === 'correct';

        if (previousWasCorrect === wasCorrect) {
            return {
                ...existing,
                lastSeen: now.toISOString(),
                updatedAt: now.toISOString()
            };
        }

        const seenCount = Math.max(1, Number(existing.seenCount || 1));
        const correctedCount = Number(existing.correctCount || 0) + (wasCorrect ? 1 : -1);
        const correctCount = Math.max(0, Math.min(seenCount, correctedCount));
        const previousIntervalDays = Number(existing.intervalDays || 0);
        const previousEase = Number(existing.easeFactor || DEFAULT_EASE);
        const easeFactor = wasCorrect
            ? Math.min(previousEase + 0.08, 3.2)
            : Math.max(MIN_EASE, previousEase - 0.2);

        let intervalDays = 0;
        let nextDueDate;
        if (wasCorrect) {
            if (seenCount <= 1) {
                intervalDays = 1;
            } else if (previousIntervalDays < 1) {
                intervalDays = 3;
            } else {
                intervalDays = Math.max(1, Math.round(previousIntervalDays * easeFactor));
            }
            nextDueDate = new Date(now.getTime() + intervalDays * DAY_MS);
        } else {
            intervalDays = 0;
            nextDueDate = new Date(now.getTime() + RETRY_DELAY_MS);
        }

        return {
            ...existing,
            correctCount,
            lastSeen: now.toISOString(),
            nextDue: nextDueDate.toISOString(),
            easeFactor,
            intervalDays,
            lastResult: wasCorrect ? 'correct' : 'incorrect',
            updatedAt: now.toISOString()
        };
    }

    function buildStudyQueue(questions, records = [], options = {}) {
        const nowMs = Number(options.nowMs || Date.now());
        const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 0;
        const recordMap = new Map(records.map(record => [String(record.questionId), record]));

        const decorated = (Array.isArray(questions) ? questions : []).map((question, index) => {
            const questionId = getQuestionId(question, index);
            const record = recordMap.get(questionId);
            const status = classifyQuestion(record, nowMs);
            return {
                question,
                status,
                priority: getPriority(status),
                nextDueTime: toTime(record?.nextDue),
                accuracy: record ? getAccuracy(record) : -1,
                jitter: Math.random()
            };
        });

        decorated.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            if (a.priority <= 1 && a.nextDueTime !== b.nextDueTime) return a.nextDueTime - b.nextDueTime;
            if (a.priority === 3 && a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
            return a.jitter - b.jitter;
        });

        const selected = limit > 0 ? decorated.slice(0, limit) : decorated;
        return selected.map(item => item.question);
    }

    function summarize(questions, records = [], nowMs = Date.now()) {
        const recordMap = new Map(records.map(record => [String(record.questionId), record]));
        const summary = {
            totalQuestions: Array.isArray(questions) ? questions.length : 0,
            seenCount: 0,
            dueCount: 0,
            dueReviewCount: 0,
            newCount: 0,
            weakCount: 0,
            learnedCount: 0
        };

        (Array.isArray(questions) ? questions : []).forEach((question, index) => {
            const record = recordMap.get(getQuestionId(question, index));
            const status = classifyQuestion(record, nowMs);
            if (!record) {
                summary.newCount++;
                summary.dueCount++;
                return;
            }
            summary.seenCount++;
            if (status === 'due' || status === 'weak_due') {
                summary.dueCount++;
                summary.dueReviewCount++;
            }
            if (status === 'weak' || status === 'weak_due') summary.weakCount++;
            if (status === 'later') summary.learnedCount++;
        });

        return summary;
    }

    window.ExamApp = window.ExamApp || {};
    window.ExamApp.studyScheduler = Object.freeze({
        buildRecord,
        reviseRecord,
        buildStudyQueue,
        classifyQuestion,
        getQuestionId,
        getAccuracy,
        isWeak,
        summarize,
        normalizeQuestionId
    });
})();