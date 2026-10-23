import assert from 'node:assert/strict';
import { assertCourseIsolation, createLearningState, createOrientationState, currentStage, migrateLearningState, transition } from './src/controller.js';
import { openState, sealState } from './src/state-token.js';

const modules=[
  {id:'definition',title:'Definition',purpose:'State the condition.',dependsOn:[]},
  {id:'application',title:'Application',purpose:'Use the condition.',dependsOn:['definition']},
];
const q=(moduleId='definition')=>({moduleId,skill:moduleId,prompt:`Question about ${moduleId}`,options:['A','B','C','D','E'],correctAnswer:'A',assessmentType:'reasoning',difficulty:'standard',diagram:{type:'none',caption:'',labels:[]}});
const following=(id,moduleId='definition')=>({id,question:q(moduleId)});

let orientation=createOrientationState({courseId:'analysis',sessionId:'phase-trace',problem:'Prove a result.'});
assert.equal(orientation.phase,0);
orientation=transition(orientation,{type:'orientation-complete'});
assert.equal(orientation.phase,1);
orientation=transition(orientation,{type:'prerequisites-mapped',prerequisites:modules,initialQuestion:q(),questionId:'mapped-q'});
assert.deepEqual(orientation.phaseHistory,[0,1,2]);

let state=createLearningState({courseId:'analysis',sessionId:'s1',problem:'Prove a result.',prerequisites:modules,initialQuestion:q(),questionId:'q0'});
assert.equal(currentStage(state),'diagnostic');
for(let i=0;i<10;i++){
  const wrong=i===1;
  state=transition(state,{type:'diagnostic-answer',questionId:state.active.id,choice:wrong?'B':'A',correct:!wrong,reasoningSound:true,objective:`angle-${i}`,nextQuestion:following(`q${i+1}`)});
  if(wrong){
    assert.equal(state.stage,'mistake-check');
    state=transition(state,{type:'mistake-decision',accidental:true});
    assert.equal(state.stage,'verification');
    state=transition(state,{type:'verification-answer',questionId:state.active.id,choice:'B',correct:false,reasoningSound:false,nextQuestion:following(`verify-next-${i}`)});
    assert.equal(state.verifications.at(-1).result,'conceptual-gap');
  }
}
assert.equal(state.diagnostics.length,10);
assert.equal(state.phase,2,'ten responses do not silently advance the learner');
assert.equal(state.stage,'diagnostic-choice');
state=transition(state,{type:'finish-diagnosis'});
assert.equal(state.phase,3);
assert.equal(state.remediation.definition.status,'identified-gap');
assert.equal(currentStage(state),'training');
assert.throws(()=>assertCourseIsolation(state,'probability','s1'),/does not belong/);

let uncertain=createLearningState({courseId:'analysis',sessionId:'uncertain',problem:'P',prerequisites:modules,initialQuestion:q(),questionId:'u0'});
uncertain=transition(uncertain,{type:'diagnostic-answer',questionId:'u0',choice:'F',correct:null,reasoningSound:false,nextQuestion:following('u1')});
assert.equal(uncertain.diagnostics[0].classification,'uncertain');
for(let i=1;i<10;i++)uncertain=transition(uncertain,{type:'diagnostic-answer',questionId:uncertain.active.id,choice:'A',correct:true,reasoningSound:true,objective:`sound-${i}`,nextQuestion:following(`u${i+1}`)});
uncertain=transition(uncertain,{type:'finish-diagnosis'});
assert.equal(uncertain.remediation.definition.status,'uncertain','F must not be classified as a conceptual error');
assert.equal(uncertain.remediation.definition.unresolvedMisses,0);
assert.equal(uncertain.remediation.definition.needed,true,'uncertainty routes into scaffolding without earning mastery');
assert.throws(()=>transition(createLearningState({courseId:'a',sessionId:'f-invalid',problem:'P',prerequisites:modules,initialQuestion:q(),questionId:'f0'}),{type:'diagnostic-answer',questionId:'f0',choice:'F',correct:true}),/F is uncertainty/);

let rejected=createLearningState({courseId:'analysis',sessionId:'s2',problem:'P',prerequisites:modules,initialQuestion:q(),questionId:'q'});
assert.throws(()=>transition(rejected,{type:'diagnostic-answer',questionId:'tampered',choice:'A',correct:true}),/No matching/);
assert.throws(()=>transition(rejected,{type:'unknown'}),/Unsupported/);

let targeted=createLearningState({courseId:'analysis',sessionId:'targeted',problem:'P',prerequisites:modules,initialQuestion:q(),questionId:'t0'});
targeted=transition(targeted,{type:'diagnostic-answer',questionId:'t0',choice:'B',correct:false,reasoningSound:false,nextQuestion:following('t1','application')});
targeted=transition(targeted,{type:'mistake-decision',accidental:false});
for(let i=1;i<10;i++) targeted=transition(targeted,{type:'diagnostic-answer',questionId:targeted.active.id,choice:'A',correct:true,reasoningSound:true,nextQuestion:following(`t${i+1}`,'application')});
targeted=transition(targeted,{type:'finish-diagnosis'});
assert.equal(targeted.active,null,'an unrelated pending diagnostic cannot become topic training');
targeted=transition(targeted,{type:'training-question',question:following('target-definition')});
assert.equal(targeted.active.question.moduleId,'definition','training starts with the smallest recorded gap');

for(let i=0;i<4;i++) state=transition(state,{type:'training-observation',skillId:'definition',questionId:state.active.id,correct:true,reasoningSound:true,objective:`training-angle-${i}`,nextQuestion:following(`train-${i}`)});
assert.equal(state.readiness.definition.target,4);
assert.equal(state.readiness.definition.status,'ready');

const steps=[
  {id:'s1',concept:'Set up the definition.',question:{...q(),prompt:'Choose the correct setup.'}},
  {id:'s2',concept:'Conclude the proof.',question:{...q('application'),prompt:'Choose the valid conclusion.'}},
];
state=transition(state,{type:'integration-plan',steps});
assert.throws(()=>transition(state,{type:'integration-answer',stepId:'s2',correct:true,reasoningSound:true}),/Only the active/);
assert.throws(()=>transition(state,{type:'complete-integration',solutionSteps:[]}),/Every integration step/);
state=transition(state,{type:'integration-answer',stepId:'s1',correct:true,reasoningSound:true});
state=transition(state,{type:'integration-answer',stepId:'s2',correct:true,reasoningSound:true});
state=transition(state,{type:'complete-integration',solutionSteps:[{math:'x=x',explanation:'By definition.'}]});
assert.equal(state.solution.unlocked,true);
state=transition(state,{type:'transfer-generated',distance:'near',prompt:'A related task.'});
state=transition(state,{type:'transfer-evaluated',distance:'near',correct:false,feedback:'Review the definition.'});

state=transition(state,{type:'retrieval-started',question:following('retrieval-0')});
for(let i=0;i<10;i++) state=transition(state,{type:'retrieval-observation',questionId:state.active.id,skillId:'definition',choice:'A',correct:true,reasoningSound:true,kind:'original-recall',nextQuestion:following(`retrieval-${i+1}`)});
assert.equal(state.retrieval.openingComplete,true);
assert.equal(state.retrieval.active,true,'REPITITION continues after ten until explicitly stopped');
state=transition(state,{type:'retrieval-observation',questionId:state.active.id,skillId:'definition',choice:'A',correct:true,reasoningSound:true,kind:'interleaved',nextQuestion:following('retrieval-12')});
assert.equal(state.retrieval.attempts.length,11);
state=transition(state,{type:'retrieval-stopped'});

const migrated=migrateLearningState({...state,version:1,pendingQuestion:undefined,diagnosticChoiceRequired:undefined});
assert.equal(migrated.version,2);
const secret='test-controller-secret-is-long-enough';
const token=await sealState(state,secret);
assert.deepEqual(await openState(token,secret),state);
assert.deepEqual(await openState(token,secret),state,'stateless tokens remain replayable without durable server storage');
await assert.rejects(()=>openState(token,'different-controller-secret-long'),/OperationError/);
const parts=token.split('.');parts[2]=`${parts[2].slice(0,-2)}AA`;
await assert.rejects(()=>openState(parts.join('.'),secret));
console.log('PASS: V2 phases, diagnostic choice, verification, ladders, ordered integration, unlock, transfer, REPITITION, isolation, migration, and token security');
