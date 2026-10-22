import assert from 'node:assert/strict';
import { assertCourseIsolation, createLearningState, createOrientationState, currentStage, transition } from './src/controller.js';
import { openState, sealState } from './src/state-token.js';

const modules=[{id:'definition',title:'Definition',purpose:'State the condition.',dependsOn:[]},{id:'application',title:'Application',purpose:'Use the condition.',dependsOn:['definition']}];
const q=(moduleId='definition')=>({moduleId,skill:moduleId,prompt:`Question about ${moduleId}`,options:['A','B','C','D','E'],correctAnswer:'A'});
let orientation=createOrientationState({courseId:'analysis',sessionId:'phase-trace',problem:'Prove a result.'});
assert.equal(orientation.phase,0);
orientation=transition(orientation,{type:'orientation-complete'});
assert.equal(orientation.phase,1);
orientation=transition(orientation,{type:'prerequisites-mapped',prerequisites:modules,initialQuestion:q(),questionId:'mapped-q'});
assert.deepEqual(orientation.phaseHistory,[0,1,2]);
let state=createLearningState({courseId:'analysis',sessionId:'s1',problem:'Prove a result.',prerequisites:modules,initialQuestion:q(),questionId:'q0'});
assert.deepEqual(state.phaseHistory,[0,1,2]);
assert.equal(currentStage(state),'diagnostic');
for(let i=0;i<10;i++){
 const wrong=i===1;
 state=transition(state,{type:'diagnostic-answer',questionId:state.active.id,choice:wrong?'B':'A',correct:!wrong,reasoningSound:true,nextQuestion:{id:`q${i+1}`,question:q()}});
 if(wrong){
  assert.equal(currentStage(state),'verification');
  state=transition(state,{type:'verification-answer',questionId:state.active.id,correct:false,reasoningSound:false,nextQuestion:{id:`verify-next-${i}`,question:q()}});
  assert.equal(state.verifications.at(-1).result,'conceptual-gap');
 }
}
assert.equal(state.diagnostics.length,10,'diagnostic count is server-state based');
assert.equal(state.phase,3,'ten responses advance to targeted topic training');
assert.equal(state.remediation.definition.status,'identified-gap');
assert.equal(currentStage(state),'training');
assert.throws(()=>assertCourseIsolation(state,'probability','s1'),/does not belong/);

let rejectedQuestion=createLearningState({courseId:'analysis',sessionId:'s2',problem:'P',prerequisites:modules,initialQuestion:q(),questionId:'q'});
assert.throws(()=>transition(rejectedQuestion,{type:'diagnostic-answer',questionId:'tampered',choice:'A',correct:true}),/No matching/);
assert.throws(()=>transition(rejectedQuestion,{type:'unknown'}),/Unsupported/);

state=transition(state,{type:'training-observation',skillId:'definition',questionId:state.active.id,correct:true,reasoningSound:true,nextQuestion:{id:'train-next',question:q()}});
assert.throws(()=>transition(state,{type:'integration-plan',steps:[{id:'s1',prompt:'Justify step one'}]}),/readiness criteria/,'one training response cannot establish topic readiness');
state=transition(state,{type:'training-observation',skillId:'definition',questionId:state.active.id,correct:false,reasoningSound:false,nextQuestion:{id:'train-verify',question:q()}});
assert.equal(state.stage,'verification','an incorrect training answer enters verification without an invalid phase-2 transition');
state=transition(state,{type:'verification-answer',questionId:state.active.id,correct:true,reasoningSound:true,nextQuestion:{id:'train-resume',question:q()}});
assert.equal(state.stage,'training','training verification returns to training');

let integration=createLearningState({courseId:'analysis',sessionId:'clean',problem:'P',prerequisites:modules,initialQuestion:q(),questionId:'start'});
for(let i=0;i<10;i++)integration=transition(integration,{type:'diagnostic-answer',questionId:integration.active.id,choice:'A',correct:true,reasoningSound:true,nextQuestion:{id:`clean-${i}`,question:q()}});
integration=transition(integration,{type:'integration-plan',steps:[{id:'s1',prompt:'Justify step one'},{id:'s2',prompt:'Conclude'}]});
assert.throws(()=>transition(integration,{type:'complete-integration',solutionSteps:[]}),/Every planned/);
assert.throws(()=>transition(integration,{type:'integration-step',stepId:'s2',verified:true}),/validated order/,'later integration steps cannot be accepted first');
integration=transition(integration,{type:'integration-step',stepId:'s1',verified:true});
integration=transition(integration,{type:'integration-step',stepId:'s2',verified:true});
integration=transition(integration,{type:'complete-integration',solutionSteps:[{math:'x=x',explanation:'By definition.'}]});
assert.equal(integration.solution.unlocked,true);
assert.equal(currentStage(integration),'solution');
integration=transition(integration,{type:'transfer-generated',distance:'near',prompt:'A related task.'});
integration=transition(integration,{type:'transfer-evaluated',distance:'near',correct:false,feedback:'Review the definition.'});
assert.equal(integration.transfer.evaluated.length,1);
integration=transition(integration,{type:'retrieval-started',question:{id:'retrieval-1',question:q()}});
integration=transition(integration,{type:'retrieval-observation',questionId:'retrieval-1',skillId:'definition',correct:true,reasoningSound:true});
assert.equal(integration.retrieval.attempts.length,1);

const secret='test-controller-secret-is-long-enough';
const token=await sealState(integration,secret);
const restored=await openState(token,secret);
assert.deepEqual(restored,integration);
const replayed=await openState(token,secret);
assert.deepEqual(replayed,integration,'authenticated stateless tokens can be replayed; durable anti-replay storage is not implemented');
await assert.rejects(()=>openState(token,'different-controller-secret-long'),/OperationError/);
const parts=token.split('.');parts[2]=`${parts[2].slice(0,-2)}AA`;
await assert.rejects(()=>openState(parts.join('.'),secret));
console.log('PASS: deterministic phases, ten diagnostics, verification, remediation, integration unlock, transfer, retrieval, course isolation, and authenticated state persistence');
