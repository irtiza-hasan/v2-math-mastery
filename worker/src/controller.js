/** Deterministic, versioned server-side progression policy. */
export const CONTROLLER_VERSION = 1;
export const DIAGNOSTIC_MINIMUM = 10;
export const PROVISIONAL_READINESS_POLICY = Object.freeze({ soundObservations: 5, assessmentTypes: 3 });

export function createOrientationState({ courseId, sessionId, problem }) {
  if (!courseId || !sessionId || !problem) throw new Error('Incomplete learning-session initialization.');
  return {
    version: CONTROLLER_VERSION, courseId, sessionId, problem, prerequisites: [], phase: 0,
    phaseHistory: [0], stage: 'orientation', diagnostics: [], verifications: [], remediation: {},
    readiness: {}, integration: { plan: null, accepted: [], rejected: [] }, solution: { unlocked: false, steps: [] },
    transfer: { generated: {}, evaluated: [] }, retrieval: { active: false, attempts: [] }, active: null, updatedAt: Date.now()
  };
}

export function createLearningState({ courseId, sessionId, problem, prerequisites, initialQuestion, questionId }) {
  if (!courseId || !sessionId || !problem || !Array.isArray(prerequisites) || !prerequisites.length || !initialQuestion || !questionId) throw new Error('Incomplete learning-session initialization.');
  let state = createOrientationState({ courseId, sessionId, problem });
  state = transition(state, { type: 'orientation-complete' });
  return transition(state, { type: 'prerequisites-mapped', prerequisites, initialQuestion, questionId });
}

export function currentStage(state) {
  if (!state) return 'orientation';
  if (state.stage === 'verification') return 'verification';
  if (state.phase === 2) return 'diagnostic';
  if (state.phase === 3) return 'training';
  if (state.phase === 4) return 'integration';
  if (state.phase === 5) return state.solution.unlocked ? 'solution' : 'locked';
  if (state.phase === 6) return 'transfer';
  return 'orientation';
}

/** Event input is produced only after server-side answer grading/auditing. */
export function transition(state, event) {
  if (!state || state.version !== CONTROLLER_VERSION) throw new Error('Unsupported learning-state version.');
  if (!event || typeof event !== 'object') throw new Error('Invalid learning event.');
  const next = structuredClone(state);
  if (event.type === 'orientation-complete') {
    if (state.phase !== 0 || state.stage !== 'orientation') throw new Error('Orientation is not active.');
    next.phase = 1; next.stage = 'prerequisite-mapping'; next.phaseHistory = [...(next.phaseHistory || []), 1];
  } else if (event.type === 'prerequisites-mapped') {
    if (state.phase !== 1 || state.stage !== 'prerequisite-mapping' || !Array.isArray(event.prerequisites) || !event.prerequisites.length || !event.initialQuestion || !event.questionId) throw new Error('Prerequisite mapping is incomplete or out of sequence.');
    next.prerequisites = event.prerequisites; next.phase = 2; next.stage = 'diagnostic';
    next.phaseHistory = [...(next.phaseHistory || []), 2];
    next.active = { id: event.questionId, question: event.initialQuestion, kind: 'diagnostic' };
  } else if (event.type === 'diagnostic-answer') {
    if (state.phase !== 2 || state.stage !== 'diagnostic' || !state.active || event.questionId !== state.active.id) throw new Error('No matching diagnostic question is active.');
    if (![true, false, null].includes(event.correct) || !['A','B','C','D','E','F'].includes(event.choice)) throw new Error('Invalid diagnostic observation.');
    const record = { questionId: event.questionId, skillId: state.active.question.moduleId, kind: 'diagnostic', correct: event.correct, reasoningSound: event.reasoningSound === true, objective: String(event.objective || '').slice(0,100), time: Date.now() };
    next.diagnostics.push(record);
    if (event.correct === false) {
      next.stage = 'verification';
      next.verifications.push({ skillId: record.skillId, sourceQuestionId: record.questionId, sourceKind: 'diagnostic', result: 'pending', attempts: 0 });
      next.active = event.nextQuestion ? { id: event.nextQuestion.id, question: event.nextQuestion.question, kind: 'verification' } : null;
    } else {
      next.active = event.nextQuestion ? { id: event.nextQuestion.id, question: event.nextQuestion.question, kind: 'diagnostic' } : null;
    }
    if (next.diagnostics.length >= DIAGNOSTIC_MINIMUM && next.stage !== 'verification') {
      next.phase = 3; next.stage = 'training';
      if (!(next.phaseHistory || []).includes(3)) next.phaseHistory = [...(next.phaseHistory || []), 3];
      next.remediation = Object.fromEntries(state.prerequisites.map(module => {
        const observations = next.diagnostics.filter(item => item.skillId === module.id);
        const verified = next.remediation[module.id];
        if (verified?.status === 'verified-possible-accident' || verified?.status === 'uncertain') return [module.id, { ...verified, needed:false, observations:observations.length }];
        return [module.id, { needed: observations.some(item => item.correct !== true || !item.reasoningSound), observations: observations.length, status: observations.some(item => item.correct !== true || !item.reasoningSound) ? 'identified-gap' : observations.length ? 'observed-no-gap' : 'uncertain' }];
      }));
    }
  } else if (event.type === 'verification-answer') {
    if (state.stage !== 'verification' || !state.active || state.active.kind !== 'verification' || event.questionId !== state.active.id) throw new Error('No matching verification question is active.');
    const pending = [...next.verifications].reverse().find(item => item.result === 'pending');
    if (!pending) throw new Error('No response is awaiting verification.');
    pending.attempts++;
    pending.result = event.correct === true && event.reasoningSound === true ? 'possible-accident' : event.correct === null ? 'uncertain' : 'conceptual-gap';
    if (pending.result === 'conceptual-gap') next.remediation[pending.skillId] = { ...(next.remediation[pending.skillId] || {}), needed: true, status: 'identified-gap' };
    next.stage = pending.sourceKind === 'training' || next.diagnostics.length >= DIAGNOSTIC_MINIMUM ? 'training' : 'diagnostic';
    if (next.stage === 'training') {
      next.phase = 3;
      if (!(next.phaseHistory || []).includes(3)) next.phaseHistory = [...(next.phaseHistory || []), 3];
      if (pending.result === 'possible-accident') next.remediation[pending.skillId] = { ...(next.remediation[pending.skillId] || {}), needed:false, status:'verified-possible-accident' };
      if (pending.result === 'uncertain') next.remediation[pending.skillId] = { ...(next.remediation[pending.skillId] || {}), needed:false, status:'uncertain' };
      next.remediation = Object.fromEntries(state.prerequisites.map(module => [module.id,next.remediation[module.id]||{needed:false,status:'uncertain'}]));
    }
    next.active = event.nextQuestion ? { id: event.nextQuestion.id, question: event.nextQuestion.question, kind: next.stage } : null;
  } else if (event.type === 'training-observation') {
    if (state.phase !== 3 || !state.prerequisites.some(module => module.id === event.skillId) || !state.active || event.questionId !== state.active.id) throw new Error('Training must target the active question for a mapped prerequisite.');
    const old = next.readiness[event.skillId] || { observations: 0, soundObservations: 0, objectives: [], status: 'uncertain' };
    const observations = old.observations + 1;
    const soundObservations = old.soundObservations + (event.correct === true && event.reasoningSound === true ? 1 : 0);
    const objectives=[...new Set([...old.objectives,String(event.objective||'').slice(0,40)].filter(Boolean))];
    const ready=soundObservations>=PROVISIONAL_READINESS_POLICY.soundObservations&&objectives.length>=PROVISIONAL_READINESS_POLICY.assessmentTypes;
    next.readiness[event.skillId] = { observations, soundObservations, objectives, status: ready?'ready':'evidence-collected', lastQuestionId: event.questionId || null };
    next.remediation[event.skillId] = { ...(next.remediation[event.skillId] || {}), needed:!ready, status: ready?'ready':event.correct === true ? 'practice-observed' : 'remediation-needed' };
    if (event.correct === false) {
      next.stage = 'verification';
      next.verifications.push({ skillId: event.skillId, sourceQuestionId: event.questionId, sourceKind: 'training', result: 'pending', attempts: 0 });
      next.active = event.nextQuestion ? { id:event.nextQuestion.id, question:event.nextQuestion.question, kind:'verification' } : null;
    } else next.active = event.nextQuestion ? { id:event.nextQuestion.id, question:event.nextQuestion.question, kind:'training' } : null;
  } else if (event.type === 'integration-plan') {
    if (state.phase !== 3 || state.stage !== 'training' || !Array.isArray(event.steps) || !event.steps.length) throw new Error('Integration requires a validated step plan after diagnosis.');
    if (state.prerequisites.some(module => next.remediation[module.id]?.needed && next.readiness[module.id]?.status !== 'ready')) throw new Error('Targeted remediation readiness criteria have not been met.');
    next.integration = { plan: event.steps.map((step,index) => ({ id: String(step.id || index).slice(0,80), prompt: String(step.prompt || '').slice(0,1000), concept:String(step.concept||'').slice(0,300) })), accepted: [], rejected: [] };
    next.phase=4;next.stage='integration';next.phaseHistory=[...(next.phaseHistory||[]),4];
  } else if (event.type === 'integration-step') {
    if (state.phase !== 4 || !state.integration.plan?.some(step => step.id === event.stepId)) throw new Error('This is not a step in the active integration plan.');
    if (typeof event.verified !== 'boolean') throw new Error('Integration work must be evaluated before it is recorded.');
    const expected = state.integration.plan.find(step => !state.integration.accepted.includes(step.id));
    if (!expected || expected.id !== event.stepId) throw new Error('Integration steps must be completed in their validated order.');
    const list = event.verified ? 'accepted' : 'rejected';
    next.integration[list] = [...new Set([...next.integration[list], event.stepId])];
    next.integration[event.verified ? 'rejected' : 'accepted'] = next.integration[event.verified ? 'rejected' : 'accepted'].filter(id => id !== event.stepId);
  } else if (event.type === 'complete-integration') {
    if (state.phase !== 4 || !state.integration.plan?.length || state.integration.plan.some(step => !state.integration.accepted.includes(step.id))) throw new Error('Every planned integration step must be evaluated and accepted before solution unlock.');
    next.phase = 5; next.stage = 'solution'; next.solution.unlocked = true; next.phaseHistory=[...(next.phaseHistory||[]),5];
    next.solution.steps = Array.isArray(event.solutionSteps) ? event.solutionSteps : [];
  } else if (event.type === 'transfer-generated') {
    if (state.phase < 5 || !state.solution.unlocked || !['near','mid','wider'].includes(event.distance) || typeof event.prompt !== 'string' || !event.prompt.trim()) throw new Error('Transfer generation is unavailable before verified solution unlock.');
    next.phase = 6; if (!(next.phaseHistory || []).includes(6)) next.phaseHistory=[...(next.phaseHistory||[]),6]; next.transfer.generated[event.distance] = { prompt: event.prompt.slice(0,4000), generatedAt: Date.now(), attempts: 0 };
  } else if (event.type === 'transfer-evaluated') {
    if (state.phase !== 6 || !next.transfer.generated[event.distance] || typeof event.feedback !== 'string' || typeof event.correct !== 'boolean') throw new Error('Transfer response requires a generated exercise and tutor evaluation.');
    next.transfer.generated[event.distance].attempts++;
    next.transfer.evaluated.push({ distance: event.distance, correct: event.correct, feedback: event.feedback.slice(0,2000), time: Date.now() });
  } else if (event.type === 'retrieval-started') {
    if (state.phase < 3) throw new Error('Retrieval requires an existing learning session.');
    next.retrieval.active = true;
    next.stage='repetition';
    if(event.question)next.active={id:event.question.id,question:event.question.question,kind:'retrieval'};
  } else if (event.type === 'retrieval-observation') {
    if (!state.retrieval.active || !state.active || state.active.kind!=='retrieval' || event.questionId!==state.active.id || ![true,false,null].includes(event.correct)) throw new Error('Invalid retrieval observation.');
    next.retrieval.attempts.push({ questionId:event.questionId,skillId:event.skillId||null,correct:event.correct,reasoningSound:event.reasoningSound===true,time:Date.now() });
    if(event.nextQuestion)next.active={id:event.nextQuestion.id,question:event.nextQuestion.question,kind:'retrieval'};
  } else {
    throw new Error('Unsupported learning event.');
  }
  next.updatedAt = Date.now();
  return next;
}

export function assertCourseIsolation(state, courseId, sessionId) {
  if (state?.courseId !== courseId || state?.sessionId !== sessionId) throw new Error('Learning state does not belong to this course and session.');
  return true;
}
