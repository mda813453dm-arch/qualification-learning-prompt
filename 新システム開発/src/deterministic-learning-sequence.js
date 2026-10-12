/**
 * Deterministic same-unit practice progression.
 * Official practice problems count toward the three-question run; AI confirmation
 * problems never count. Two consecutive official-practice misses force an AI
 * confirmation before another official practice question can be accepted.
 */
export const LEARNING_PHASES = Object.freeze([
  'PRACTICE_READY',
  'CONFIRMATION_REQUIRED',
  'PERFECT_RUN_CHOICE',
  'NEXT_UNIT_REQUIRED'
]);

function freezeCopy(value) {
  const copy = JSON.parse(JSON.stringify(value));
  const visit = x => {
    if (x && typeof x === 'object') {
      Object.values(x).forEach(visit);
      Object.freeze(x);
    }
    return x;
  };
  return visit(copy);
}

export function createDeterministicLearningSequence(initial = {}) {
  const qualificationId = initial.qualificationId || null;
  let itemId = initial.itemId || null;
  let phase = itemId ? 'PRACTICE_READY' : 'NEXT_UNIT_REQUIRED';
  let consecutivePracticeMisses = Number(initial.consecutivePracticeMisses || 0);
  let correctRun = Number(initial.correctRun || 0);
  let officialPracticeCount = Number(initial.officialPracticeCount || 0);
  let confirmationMisses = Number(initial.confirmationMisses || 0);
  let pendingQuestion = null;
  let pendingOutcome = null;
  const seenQuestionIds = new Set(initial.seenQuestionIds || []);

  const snapshot = () => Object.freeze({
    qualificationId, itemId, phase, consecutivePracticeMisses,
    correctRun, officialPracticeCount, confirmationMisses,
    pendingQuestion: pendingQuestion ? freezeCopy(pendingQuestion) : null,
    pendingOutcome: pendingOutcome ? freezeCopy(pendingOutcome) : null,
    seenQuestionIds: Object.freeze([...seenQuestionIds])
  });
  const reject = reason => Object.freeze({ ok: false, reason, state: snapshot() });

  function validateQuestion(meta) {
    if (!meta || typeof meta !== 'object') return reject('QUESTION_CONTEXT_REQUIRED');
    if (!meta.questionId || !meta.itemId || !meta.qualificationId) return reject('QUESTION_BINDING_REQUIRED');
    if (qualificationId && meta.qualificationId !== qualificationId) return reject('QUALIFICATION_MISMATCH');
    if (!itemId || meta.itemId !== itemId) return reject('STUDY_UNIT_MISMATCH');
    if (pendingQuestion) return reject('QUESTION_ALREADY_PENDING');
    if (phase === 'PERFECT_RUN_CHOICE' || phase === 'NEXT_UNIT_REQUIRED') return reject('UNIT_CHOICE_REQUIRED');
    if (phase === 'CONFIRMATION_REQUIRED') {
      if (meta.kind !== 'ai_confirmation' || meta.origin !== 'ai') return reject('AI_CONFIRMATION_REQUIRED');
    } else if (meta.kind !== 'official_practice' || meta.origin !== 'official') {
      return reject('OFFICIAL_SAME_UNIT_PRACTICE_REQUIRED');
    }
    if (seenQuestionIds.has(meta.questionId)) return reject('QUESTION_ALREADY_USED');
    pendingQuestion = freezeCopy(meta);
    seenQuestionIds.add(meta.questionId);
    return Object.freeze({ ok: true, state: snapshot() });
  }

  function recordAnswer(questionId, correct) {
    if (!pendingQuestion || pendingQuestion.questionId !== questionId) return reject('PENDING_QUESTION_MISMATCH');
    if (typeof correct !== 'boolean') return reject('ANSWER_RESULT_REQUIRED');
    const q = pendingQuestion;
    pendingQuestion = null;
    if (q.kind === 'official_practice') {
      officialPracticeCount += 1;
      correctRun = correct ? correctRun + 1 : 0;
      consecutivePracticeMisses = correct ? 0 : consecutivePracticeMisses + 1;
      if (consecutivePracticeMisses >= 2) phase = 'CONFIRMATION_REQUIRED';
      else if (correctRun >= 3) phase = 'PERFECT_RUN_CHOICE';
      else phase = 'PRACTICE_READY';
      pendingOutcome = Object.freeze({
        questionId, itemId, kind: q.kind, correct,
        officialPracticeCount, correctRun, consecutivePracticeMisses,
        directive: phase
      });
      return Object.freeze({ ok: true, state: snapshot(), outcome: pendingOutcome });
    }

    if (q.kind !== 'ai_confirmation' || q.origin !== 'ai') return reject('QUESTION_KIND_INVALID');
    confirmationMisses = correct ? 0 : confirmationMisses + 1;
    if (correct) {
      consecutivePracticeMisses = 0;
      phase = 'PRACTICE_READY';
    } else {
      phase = 'CONFIRMATION_REQUIRED';
    }
    pendingOutcome = Object.freeze({
      questionId, itemId, kind: q.kind, correct,
      confirmationMisses, directive: phase
    });
    return Object.freeze({ ok: true, state: snapshot(), outcome: pendingOutcome });
  }

  function chooseAfterPerfectRun(choice, nextItemId) {
    if (phase !== 'PERFECT_RUN_CHOICE') return reject('PERFECT_RUN_CHOICE_NOT_PENDING');
    if (choice === 'continue_same_unit') {
      correctRun = 0;
      phase = 'PRACTICE_READY';
      pendingOutcome = null;
      return Object.freeze({ ok: true, state: snapshot() });
    }
    if (choice === 'next_unit') {
      if (!nextItemId || nextItemId === itemId) return reject('NEXT_STUDY_UNIT_REQUIRED');
      itemId = nextItemId;
      consecutivePracticeMisses = 0;
      correctRun = 0;
      officialPracticeCount = 0;
      confirmationMisses = 0;
      phase = 'PRACTICE_READY';
      pendingOutcome = null;
      pendingQuestion = null;
      return Object.freeze({ ok: true, state: snapshot() });
    }
    return reject('UNIT_CHOICE_INVALID');
  }

  function settleConfirmation(correct) {
    if (phase !== 'CONFIRMATION_REQUIRED' || !pendingOutcome) return reject('CONFIRMATION_RESULT_NOT_PENDING');
    if (typeof correct !== 'boolean') return reject('ANSWER_RESULT_REQUIRED');
    // Confirmation results are recorded by recordAnswer and do not alter the
    // three official-practice count. This method is intentionally not a bypass.
    return reject('USE_AI_CONFIRMATION_QUESTION');
  }

  if (!qualificationId && initial.itemId) return reject('QUALIFICATION_REQUIRED');
  if (phase === 'CONFIRMATION_REQUIRED' && consecutivePracticeMisses < 2) return reject('INVALID_INITIAL_MISS_COUNT');

  return Object.freeze({
    state: snapshot,
    validateQuestion,
    recordAnswer,
    chooseAfterPerfectRun,
    settleConfirmation
  });
}
