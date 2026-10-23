/** Deterministic, versioned server-side V2 progression policy. */
export const CONTROLLER_VERSION = 2;
export const DIAGNOSTIC_MINIMUM = 10;

const copy = value => structuredClone(value);
const finish = state => ({ ...state, updatedAt: Date.now() });
const addPhase = (state, phase) => state.phaseHistory.includes(phase) ? state.phaseHistory : [...state.phaseHistory, phase];

export function createOrientationState({ courseId, sessionId, problem }) {
  if (!courseId || !sessionId || !problem) throw new Error('Incomplete learning-session initialization.');
  return {
    version: CONTROLLER_VERSION, courseId, sessionId, problem, prerequisites: [], phase: 0,
    phaseHistory: [0], stage: 'orientation', diagnostics: [], verifications: [], remediation: {}, readiness: {},
    integration: { plan: null, accepted: [], rejected: [] }, solution: { unlocked: false, steps: [] },
    transfer: { generated: {}, evaluated: [] }, retrieval: { active: false, openingTarget: 10, openingComplete: false, attempts: [], stoppedAt: null },
    active: null, pendingQuestion: null, diagnosticChoiceRequired: false, updatedAt: Date.now()
  };
}

/** Compatibility initializer that records Phases 0 and 1 before Phase 2. */
export function createLearningState({ courseId, sessionId, problem, prerequisites, initialQuestion, questionId }) {
  if (!Array.isArray(prerequisites) || !prerequisites.length || !initialQuestion || !questionId) throw new Error('Incomplete learning-session initialization.');
  let state = createOrientationState({ courseId, sessionId, problem });
  state = transition(state, { type: 'orientation-complete' });
  return transition(state, { type: 'prerequisites-mapped', prerequisites, initialQuestion, questionId });
}

export function currentStage(state) { return state?.stage || 'orientation'; }

export function migrateLearningState(state) {
  if (!state || typeof state !== 'object') throw new Error('Invalid learning state.');
  if (state.version === CONTROLLER_VERSION) return state;
  if (state.version !== 1) throw new Error('Unsupported learning-state version.');
  return {
    ...state, version: CONTROLLER_VERSION,
    phaseHistory: Array.isArray(state.phaseHistory) ? state.phaseHistory : Array.from({length:Math.max(0,Math.min(6,state.phase))+1},(_,index)=>index),
    pendingQuestion: null, diagnosticChoiceRequired: state.stage === 'diagnostic-choice',
    retrieval: { openingTarget:10, openingComplete:(state.retrieval?.attempts?.length||0)>=10, stoppedAt:null, ...state.retrieval }
  };
}

function ladderFor(state, skillId) {
  const observations = state.diagnostics.filter(item => item.skillId === skillId);
  const wrong = observations.filter(item => item.correct === false || item.reasoningSound === false).length;
  const uncertain = observations.filter(item => item.correct === null).length;
  if (!wrong && !uncertain && observations.length >= 2) return { level: 'secure', target: 2 };
  if (wrong <= 1 && uncertain <= 1) return { level: 'mild', target: 4 };
  return { level: 'weak', target: 10 };
}

function diagnosticSummary(state) {
  return Object.fromEntries(state.prerequisites.map(module => {
    const observations = state.diagnostics.filter(item => item.skillId === module.id);
    const gap = observations.some(item => item.correct !== true || !item.reasoningSound);
    const ladder = ladderFor(state, module.id);
    return [module.id, { needed: gap, status: gap ? 'identified-gap' : observations.length ? 'observed-no-gap' : 'uncertain', level: ladder.level, target: gap ? ladder.target : 0, observations: observations.length, unresolvedMisses: gap ? 1 : 0 }];
  }));
}

/** Events are accepted only after server-side grading and question auditing. */
export function transition(state, event) {
  if (!state || state.version !== CONTROLLER_VERSION) throw new Error('Unsupported learning-state version.');
  if (!event || typeof event !== 'object') throw new Error('Invalid learning event.');
  const next = copy(state);

  if (event.type === 'orientation-complete') {
    if (state.phase !== 0 || state.stage !== 'orientation') throw new Error('Orientation is not active.');
    next.phase = 1; next.stage = 'prerequisite-mapping'; next.phaseHistory = addPhase(next, 1);
  } else if (event.type === 'prerequisites-mapped') {
    if (state.phase !== 1 || state.stage !== 'prerequisite-mapping' || !Array.isArray(event.prerequisites) || !event.prerequisites.length || !event.initialQuestion || !event.questionId) throw new Error('Prerequisite mapping is incomplete or out of sequence.');
    next.prerequisites = event.prerequisites; next.phase = 2; next.stage = 'diagnostic'; next.phaseHistory = addPhase(next, 2);
    next.active = { id: event.questionId, question: event.initialQuestion, kind: 'diagnostic' };
  } else if (event.type === 'diagnostic-answer') {
    if (state.phase !== 2 || state.stage !== 'diagnostic' || state.active?.id !== event.questionId) throw new Error('No matching diagnostic question is active.');
    if (![true,false,null].includes(event.correct) || !['A','B','C','D','E','F'].includes(event.choice)) throw new Error('Invalid diagnostic observation.');
    const record = { questionId:event.questionId, skillId:state.active.question.moduleId, kind:'diagnostic', correct:event.correct, reasoningSound:event.reasoningSound === true, objective:String(event.objective||'').slice(0,100), time:Date.now() };
    next.diagnostics.push(record); next.pendingQuestion = event.nextQuestion || null; next.active = null;
    if (event.correct === false) {
      next.stage = 'mistake-check';
      next.verifications.push({ skillId:record.skillId, sourceQuestionId:record.questionId, sourceKind:'diagnostic', result:'awaiting-claim', attempts:0 });
    } else if (next.diagnostics.length >= DIAGNOSTIC_MINIMUM) {
      next.stage = 'diagnostic-choice'; next.diagnosticChoiceRequired = true;
    } else next.active = event.nextQuestion ? { id:event.nextQuestion.id, question:event.nextQuestion.question, kind:'diagnostic' } : null;
  } else if (event.type === 'mistake-decision') {
    if (state.stage !== 'mistake-check') throw new Error('No possible accidental error is awaiting a decision.');
    const pending = [...next.verifications].reverse().find(item => item.result === 'awaiting-claim');
    if (!pending || typeof event.accidental !== 'boolean') throw new Error('Invalid accidental-error decision.');
    if (event.accidental) {
      pending.result = 'pending'; next.stage = 'verification';
      next.active = state.pendingQuestion ? { id:state.pendingQuestion.id, question:state.pendingQuestion.question, kind:'verification' } : null;
    } else {
      const ladder=ladderFor(next,pending.skillId); pending.result = 'conceptual-gap'; next.remediation[pending.skillId] = { needed:true, status:'identified-gap', ...ladder, unresolvedMisses:1 };
      const following = event.nextQuestion || state.pendingQuestion; next.pendingQuestion = null;
      if (next.diagnostics.length >= DIAGNOSTIC_MINIMUM) { next.stage='diagnostic-choice'; next.diagnosticChoiceRequired=true; }
      else { next.stage='diagnostic'; next.active=following ? {id:following.id,question:following.question,kind:'diagnostic'} : null; }
    }
  } else if (event.type === 'verification-answer') {
    if (state.stage !== 'verification' || state.active?.kind !== 'verification' || event.questionId !== state.active.id) throw new Error('No matching verification question is active.');
    const pending = [...next.verifications].reverse().find(item => item.result === 'pending');
    if (!pending) throw new Error('No response is awaiting verification.');
    pending.attempts++; pending.result = event.correct === true && event.reasoningSound === true ? 'possible-accident' : event.correct === null ? 'uncertain' : 'conceptual-gap';
    if (pending.result !== 'possible-accident') { const ladder=ladderFor(next,pending.skillId); next.remediation[pending.skillId]={needed:true,status:pending.result==='uncertain'?'uncertain':'identified-gap',...ladder,unresolvedMisses:1}; }
    next.pendingQuestion = null;
    if (pending.sourceKind === 'training') { next.phase=3; next.stage='training'; next.active=event.nextQuestion ? {id:event.nextQuestion.id,question:event.nextQuestion.question,kind:'training'} : null; }
    else if (next.diagnostics.length >= DIAGNOSTIC_MINIMUM) { next.stage='diagnostic-choice'; next.diagnosticChoiceRequired=true; next.active=null; }
    else { next.stage='diagnostic'; next.active=event.nextQuestion ? {id:event.nextQuestion.id,question:event.nextQuestion.question,kind:'diagnostic'} : null; }
  } else if (event.type === 'continue-diagnosis') {
    const following=event.nextQuestion||state.pendingQuestion;
    if (state.phase !== 2 || state.stage !== 'diagnostic-choice' || !following) throw new Error('Extended diagnosis is unavailable.');
    next.stage='diagnostic'; next.diagnosticChoiceRequired=false; next.pendingQuestion=null; next.active={id:following.id,question:following.question,kind:'diagnostic'};
  } else if (event.type === 'finish-diagnosis') {
    if (state.phase !== 2 || state.stage !== 'diagnostic-choice' || state.diagnostics.length < DIAGNOSTIC_MINIMUM) throw new Error('At least ten diagnostic responses are required.');
    next.phase=3; next.stage='training'; next.phaseHistory=addPhase(next,3); next.diagnosticChoiceRequired=false; next.remediation=diagnosticSummary(next);
    const target=next.prerequisites.find(module=>next.remediation[module.id]?.needed);
    const candidate=event.nextQuestion||state.pendingQuestion;
    const following=target&&candidate?.question?.moduleId===target.id?candidate:null; next.pendingQuestion=null;
    next.active=following ? {id:following.id,question:following.question,kind:'training'} : null;
  } else if (event.type === 'training-question') {
    if (state.phase!==3 || state.stage!=='training' || state.active || !event.question?.id || !state.remediation[event.question.question?.moduleId]?.needed) throw new Error('A targeted training question is not required.');
    next.active={id:event.question.id,question:event.question.question,kind:'training'};
  } else if (event.type === 'training-observation') {
    if (state.phase !== 3 || state.stage !== 'training' || !state.prerequisites.some(module=>module.id===event.skillId) || state.active?.id !== event.questionId) throw new Error('Training must target the active mapped prerequisite.');
    const config = next.remediation[event.skillId] || { needed:true,status:'identified-gap',...ladderFor(next,event.skillId),unresolvedMisses:0 };
    const old = next.readiness[event.skillId] || { observations:0,soundObservations:0,angles:[],status:'training' };
    const sound=event.correct===true&&event.reasoningSound===true, angles=[...new Set([...old.angles,String(event.objective||'').slice(0,40)].filter(Boolean))];
    const observations=old.observations+1,soundObservations=old.soundObservations+(sound?1:0),unresolved=sound?Math.max(0,(config.unresolvedMisses||0)-1):(config.unresolvedMisses||0)+1;
    const requiredAngles=config.target>=10?5:config.target>=4?3:2,ready=soundObservations>=config.target&&angles.length>=Math.min(requiredAngles,config.target)&&unresolved===0;
    next.readiness[event.skillId]={observations,soundObservations,angles,status:ready?'ready':'training',target:config.target,level:config.level,lastQuestionId:event.questionId};
    next.remediation[event.skillId]={...config,needed:!ready,status:ready?'ready':sound?'practice-observed':'remediation-needed',unresolvedMisses:unresolved};
    if (event.correct === false) {
      next.stage='mistake-check'; next.pendingQuestion=event.nextQuestion||null; next.active=null;
      next.verifications.push({skillId:event.skillId,sourceQuestionId:event.questionId,sourceKind:'training',result:'awaiting-claim',attempts:0});
    } else next.active=event.nextQuestion?{id:event.nextQuestion.id,question:event.nextQuestion.question,kind:'training'}:null;
  } else if (event.type === 'integration-plan') {
    if (state.phase !== 3 || state.stage !== 'training' || !Array.isArray(event.steps) || !event.steps.length) throw new Error('Integration requires a validated plan after training.');
    if (state.prerequisites.some(module => state.remediation[module.id]?.needed && state.readiness[module.id]?.status !== 'ready')) throw new Error('Targeted remediation is incomplete.');
    next.integration={plan:event.steps,accepted:[],rejected:[]}; next.phase=4; next.stage='integration'; next.phaseHistory=addPhase(next,4);
    next.active={id:event.steps[0].id,question:event.steps[0].question,kind:'integration'};
  } else if (event.type === 'integration-answer') {
    if (state.phase!==4 || state.active?.kind!=='integration' || event.stepId!==state.active.id) throw new Error('Only the active integration step can be answered.');
    if (![true,false,null].includes(event.correct)) throw new Error('Integration answer was not graded.');
    if (event.correct===true && event.reasoningSound!==false) {
      next.integration.accepted=[...new Set([...next.integration.accepted,event.stepId])]; next.integration.rejected=next.integration.rejected.filter(id=>id!==event.stepId);
      const following=next.integration.plan.find(step=>!next.integration.accepted.includes(step.id)); next.active=following?{id:following.id,question:following.question,kind:'integration'}:null;
    } else { next.integration.rejected=[...new Set([...next.integration.rejected,event.stepId])]; next.active=event.replacementQuestion?{id:event.replacementQuestion.id,question:event.replacementQuestion.question,kind:'integration'}:state.active; }
  } else if (event.type === 'complete-integration') {
    if (state.phase!==4 || !state.integration.plan?.length || state.integration.plan.some(step=>!state.integration.accepted.includes(step.id))) throw new Error('Every integration step must be accepted before solution unlock.');
    next.phase=5; next.stage='solution'; next.phaseHistory=addPhase(next,5); next.solution={unlocked:true,steps:Array.isArray(event.solutionSteps)?event.solutionSteps:[]}; next.active=null;
  } else if (event.type === 'transfer-generated') {
    if (state.phase<5 || !state.solution.unlocked || !['near','mid','wider'].includes(event.distance) || !String(event.prompt||'').trim()) throw new Error('Transfer is unavailable before solution unlock.');
    next.phase=6; next.stage='transfer'; next.phaseHistory=addPhase(next,6); next.transfer.generated[event.distance]={prompt:String(event.prompt).slice(0,4000),generatedAt:Date.now(),attempts:0};
  } else if (event.type === 'transfer-evaluated') {
    if (state.phase!==6 || !next.transfer.generated[event.distance] || typeof event.correct!=='boolean') throw new Error('Transfer response requires a generated exercise and evaluation.');
    next.transfer.generated[event.distance].attempts++; next.transfer.evaluated.push({distance:event.distance,correct:event.correct,feedback:String(event.feedback||'').slice(0,2000),time:Date.now()});
  } else if (event.type === 'retrieval-started') {
    if (state.phase<3 || !event.question) throw new Error('REPITITION requires an existing session and an audited question.');
    next.retrieval={...next.retrieval,active:true,openingComplete:false,stoppedAt:null}; next.stage='repetition'; next.active={id:event.question.id,question:event.question.question,kind:'retrieval'};
  } else if (event.type === 'retrieval-observation') {
    if (!state.retrieval.active || state.active?.kind!=='retrieval' || event.questionId!==state.active.id || ![true,false,null].includes(event.correct)) throw new Error('Invalid REPITITION observation.');
    next.retrieval.attempts.push({questionId:event.questionId,skillId:event.skillId||null,correct:event.correct,reasoningSound:event.reasoningSound===true,kind:event.kind||'original-recall',time:Date.now()});
    next.retrieval.openingComplete=next.retrieval.attempts.length>=next.retrieval.openingTarget; next.active=event.nextQuestion?{id:event.nextQuestion.id,question:event.nextQuestion.question,kind:'retrieval'}:null;
  } else if (event.type === 'retrieval-stopped') {
    if (!state.retrieval.active) throw new Error('REPITITION is not active.');
    next.retrieval.active=false; next.retrieval.stoppedAt=Date.now(); next.stage=state.phase===6?'transfer':state.phase===5?'solution':'training'; next.active=null;
  } else throw new Error('Unsupported learning event.');
  return finish(next);
}

export function assertCourseIsolation(state, courseId, sessionId) {
  if (state?.courseId !== courseId || state?.sessionId !== sessionId) throw new Error('Learning state does not belong to this course and session.');
  return true;
}
