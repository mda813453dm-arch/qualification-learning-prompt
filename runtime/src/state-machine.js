export const STATES = Object.freeze({
  ASK_QUALIFICATION: "ASK_QUALIFICATION",
  OVERVIEW: "OVERVIEW",
  EXEMPTION: "EXEMPTION",
  STAGE: "STAGE",
  PLAN: "PLAN",
  START_CONFIRMATION: "START_CONFIRMATION",
  ACTIVE: "ACTIVE",
  QUESTION_AWAITING_ANSWER: "QUESTION_AWAITING_ANSWER",
  ANSWER_AWAITING_EXPLANATION_CHOICE: "ANSWER_AWAITING_EXPLANATION_CHOICE",
  RECOVERY: "RECOVERY",
  FINISHED: "FINISHED"
});

export function initialState() {
  return {
    state: STATES.ASK_QUALIFICATION,
    qualification: null,
    overview: null,
    exemption: null,
    stage: null,
    plan: null,
    sessionStarted: false,
    currentQuestion: null,
    answer: null,
    retrieval: { cycleId: 0, attempts: [], exhausted: false }
  };
}

function fail(code, message) {
  return { ok: false, code, message };
}

export function transition(s, event) {
  if (!s || !event || typeof event.type !== "string") return fail("INVALID_INPUT", "State and event are required.");

  switch (event.type) {
    case "SET_QUALIFICATION":
      if (s.state !== STATES.ASK_QUALIFICATION || !event.qualification?.trim()) return fail("INVALID_QUALIFICATION_STEP", "Qualification can only be set from the initial state.");
      return { ok: true, state: { ...s, qualification: event.qualification.trim(), state: STATES.OVERVIEW } };

    case "CONFIRM_OVERVIEW":
      if (s.state !== STATES.OVERVIEW) return fail("OVERVIEW_OUT_OF_ORDER", "Overview is not the current step.");
      if (!event.overview || !event.overview.officialSourceVerified || !event.overview.requiredFieldsDisplayed) return fail("OVERVIEW_NOT_VERIFIED", "Official source verification and all required displayed fields are required.");
      return { ok: true, state: { ...s, overview: event.overview, state: event.exemptionRequired ? STATES.EXEMPTION : STATES.STAGE } };

    case "SET_EXEMPTION":
      if (s.state !== STATES.EXEMPTION || !["applies", "not_used", "unknown"].includes(event.value)) return fail("EXEMPTION_OUT_OF_ORDER", "A valid exemption response is required at the exemption step.");
      return { ok: true, state: { ...s, exemption: event.value, state: STATES.STAGE } };

    case "SET_STAGE":
      if (s.state !== STATES.STAGE || ![1, 2, 3, 4].includes(event.value)) return fail("STAGE_OUT_OF_ORDER", "A valid learning stage is required.");
      return { ok: true, state: { ...s, stage: event.value, state: STATES.PLAN } };

    case "SET_PLAN":
      if (s.state !== STATES.PLAN || !event.plan?.firstItem || !event.plan?.reason || !event.plan?.scopeVerified) return fail("PLAN_NOT_VERIFIED", "A concrete first item, reason, and verified scope are required.");
      return { ok: true, state: { ...s, plan: event.plan, state: STATES.START_CONFIRMATION } };

    case "START_SESSION":
      if (s.state !== STATES.START_CONFIRMATION || event.confirmed !== true) return fail("START_NOT_CONFIRMED", "Explicit start confirmation is required.");
      return { ok: true, state: { ...s, sessionStarted: true, state: STATES.ACTIVE } };

    case "PRESENT_OFFICIAL_QUESTION": {
      if (![STATES.ACTIVE, STATES.RECOVERY].includes(s.state)) return fail("QUESTION_OUT_OF_ORDER", "A question cannot be presented at this step.");
      const q = event.question;
      if (!q?.id || !q?.questionTextComplete || !q?.choicesComplete || !q?.officialQuestionSourceVerified || !q?.answerMappingVerified || !q?.officialAnswerSourceVerified || !q?.answerKeyVerified) {
        return fail("QUESTION_EVIDENCE_INCOMPLETE", "Question text, all choices, exact mapping, and official answer evidence must be verified before presentation.");
      }
      return { ok: true, state: { ...s, currentQuestion: q, answer: null, state: STATES.QUESTION_AWAITING_ANSWER } };
    }

    case "SUBMIT_ANSWER":
      if (s.state !== STATES.QUESTION_AWAITING_ANSWER || !s.currentQuestion || event.answer == null) return fail("ANSWER_OUT_OF_ORDER", "There is no complete question awaiting an answer.");
      return { ok: true, state: { ...s, answer: event.answer, state: STATES.ANSWER_AWAITING_EXPLANATION_CHOICE } };

    case "CHOOSE_EXPLANATION":
      if (s.state !== STATES.ANSWER_AWAITING_EXPLANATION_CHOICE || !["show", "skip"].includes(event.choice)) return fail("EXPLANATION_CHOICE_REQUIRED", "Choose whether to show or skip the explanation.");
      return { ok: true, state: { ...s, state: STATES.ACTIVE } };

    case "RECORD_RETRIEVAL_ATTEMPT": {
      if (![STATES.ACTIVE, STATES.RECOVERY].includes(s.state)) return fail("RETRIEVAL_OUT_OF_ORDER", "Retrieval cannot run at this step.");
      if (!event.attempt?.route || !event.attempt?.result) return fail("ATTEMPT_NOT_RECORDED", "A route and result are required for each retrieval attempt.");
      const attempts = [...s.retrieval.attempts, event.attempt];
      const exhausted = event.exhausted === true && event.policyLimitReached === true;
      return { ok: true, state: { ...s, retrieval: { ...s.retrieval, attempts, exhausted }, state: exhausted ? STATES.RECOVERY : s.state } };
    }

    case "FINISH":
      return { ok: true, state: { ...s, state: STATES.FINISHED } };

    default:
      return fail("UNKNOWN_EVENT", `Unknown event type: ${event.type}`);
  }
}
