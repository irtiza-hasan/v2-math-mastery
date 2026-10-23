import assert from 'node:assert/strict';
import handler from './src/index.js';
import { createLearningState, transition } from './src/controller.js';
import { sealState, openState } from './src/state-token.js';

const env={ALLOWED_ORIGIN:'http://localhost:5173',GEMINI_API_KEY:'fake',CONTROLLER_SECRET:'test-controller-secret-is-long-enough',GEMINI_MODEL:'gemini-3.5-flash-lite'};
const modules=[{id:'definition',title:'Definition',purpose:'Use the definition.',dependsOn:[]}];
const question={moduleId:'definition',skill:'Definition',prompt:'Which equality is reflexive?',options:['$x=x$','$x\\ne x$','$x<x$','$x>x$','None'],correctAnswer:'A',assessmentType:'definition',difficulty:'standard',diagram:{type:'none',caption:'',labels:[]}};
let state=createLearningState({courseId:'analysis',sessionId:'s1',problem:'Prove $x=x$.',prerequisites:modules,initialQuestion:question,questionId:'q0'});
for(let i=0;i<10;i++) state=transition(state,{type:'diagnostic-answer',questionId:state.active.id,choice:'A',correct:true,reasoningSound:true,objective:'reasoning',nextQuestion:{id:`q${i+1}`,question}});
state=transition(state,{type:'finish-diagnosis'});
const steps=['setup','justify','conclude'].map((id,index)=>({id,concept:`Concept ${index+1}`,question:{...question,prompt:`Integration question ${index+1}?`,questionId:id}}));
state=transition(state,{type:'integration-plan',steps});
let token=await sealState(state,env.CONTROLLER_SECRET);

const originalFetch=globalThis.fetch;
globalThis.fetch=async(_url,options)=>{
 const request=JSON.parse(options.body),system=request.systemInstruction.parts[0].text;
 let value;
 if(system.startsWith('Independently verify')) value={valid:true,rationale:'Checked.'};
 else if(system.startsWith('Give a complete')) value={steps:[{math:'$x=x$',explanation:'By reflexivity.'}],commonMistakes:[],interpretations:[]};
 else if(system.startsWith('Generate one mathematically correct')) value={prompt:'Show that $a=a$.',expectedConcept:'Identity'};
 else if(system.startsWith('Evaluate the student solution')) value={correct:true,feedback:'The reasoning is sound.',missingJustification:''};
 else if(system.startsWith('Generate one retrieval-first')||system.startsWith('Generate the next original-problem-first')||system.startsWith('Generate one interleaved')) value={...question,prompt:'Which statement is reflexive?'};
 else if(system.startsWith('Give concise retrieval-practice')||system.startsWith('Give precise feedback')) value={feedback:'Correct recall.',reasoningSound:true};
 else throw Error(`Unexpected mock prompt: ${system}`);
 return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]}));
};
let ip=0;
const request=(action,override={})=>new Request('https://example.workers.dev/learning',{method:'POST',headers:{Origin:'http://localhost:5173','Content-Type':'application/json','CF-Connecting-IP':`action-test-${++ip}`},body:JSON.stringify({action,courseId:'analysis',sessionId:'s1',controllerToken:token,...override})});
try{
 let response=await handler.fetch(request('unlock-solution'),env);assert.equal(response.status,409);
 for(const step of steps){
   response=await handler.fetch(request('integration-answer',{stepId:step.id,choice:'A',reasoning:'The identity follows by reflexivity.'}),env);
   assert.equal(response.status,200);const output=await response.json();token=output.controllerToken;
 }
 response=await handler.fetch(request('unlock-solution'),env);assert.equal(response.status,200);let output=await response.json();token=output.controllerToken;assert.equal(output.solutionUnlocked,true);
 response=await handler.fetch(request('generate-transfer',{distance:'near'}),env);assert.equal(response.status,200);output=await response.json();token=output.controllerToken;assert.equal(output.transfer.prompt,'Show that $a=a$.');assert.equal(output.phase,6);
 const unlocked=await openState(token,env.CONTROLLER_SECRET);assert.equal(unlocked.solution.unlocked,true);assert.ok(unlocked.transfer.generated.near);

 const stableToken=token,prior=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({error:{message:'quota'}}),{status:429});
 response=await handler.fetch(request('generate-transfer',{controllerToken:stableToken,distance:'wider'}),env);assert.equal(response.status,429);
 assert.equal((await openState(stableToken,env.CONTROLLER_SECRET)).transfer.generated.wider,undefined);
 globalThis.fetch=prior;

 response=await handler.fetch(request('start-retrieval'),env);assert.equal(response.status,200);output=await response.json();token=output.controllerToken;
 response=await handler.fetch(request('answer-retrieval',{questionId:output.nextQuestion.questionId,choice:'A',reasoning:'Equality is reflexive.'}),env);assert.equal(response.status,200);output=await response.json();token=output.controllerToken;assert.equal(output.feedback,'Correct recall.');
 const retrieved=await openState(token,env.CONTROLLER_SECRET);assert.equal(retrieved.retrieval.attempts.at(-1).reasoningSound,true);assert.equal(retrieved.retrieval.active,true);
 response=await handler.fetch(request('stop-retrieval'),env);assert.equal(response.status,200);output=await response.json();assert.equal(output.retrievalStopped,true);
 console.log('PASS: mocked integration MCQs, backend unlock, audited transfer, post-solution REPITITION, retrieval feedback, explicit stop, and provider-failure state safety');
}finally{globalThis.fetch=originalFetch;}
