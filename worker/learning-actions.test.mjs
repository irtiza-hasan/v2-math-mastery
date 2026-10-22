import assert from 'node:assert/strict';
import handler from './src/index.js';
import { createLearningState, transition } from './src/controller.js';
import { sealState, openState } from './src/state-token.js';

const env={ALLOWED_ORIGIN:'http://localhost:5173',GEMINI_API_KEY:'fake',CONTROLLER_SECRET:'test-controller-secret-is-long-enough',GEMINI_MODEL:'gemini-3.5-flash-lite'};
const modules=[{id:'definition',title:'Definition',purpose:'Use the definition.',dependsOn:[]}];
const question={moduleId:'definition',skill:'Definition',prompt:'A diagnostic question?',options:['A','B','C','D','E'],correctAnswer:'A',assessmentType:'definition',difficulty:'standard',diagram:{type:'none',caption:'',labels:[]}};
let state=createLearningState({courseId:'analysis',sessionId:'s1',problem:'Prove $x=x$.',prerequisites:modules,initialQuestion:question,questionId:'q0'});
for(let i=0;i<10;i++)state=transition(state,{type:'diagnostic-answer',questionId:state.active.id,choice:'A',correct:true,reasoningSound:true,objective:'reasoning',nextQuestion:{id:`q${i+1}`,question}});
state=transition(state,{type:'integration-plan',steps:[{id:'s1',prompt:'State the identity.',concept:'Identity'}]});
const token=await sealState(state,env.CONTROLLER_SECRET);
const originalFetch=globalThis.fetch;let generated=0;
globalThis.fetch=async(_url,options)=>{
 generated++;
 const request=JSON.parse(options.body),system=request.systemInstruction.parts[0].text;
 let value;
 if(system.startsWith('Independently verify'))value={valid:true,rationale:'Checked.'};
 else if(system.startsWith('Give a complete'))value={steps:[{math:'$x=x$',explanation:'By reflexivity.'}],commonMistakes:[],interpretations:[]};
 else if(system.startsWith('Generate one mathematically correct'))value={prompt:'Show that $a=a$.',expectedConcept:'Identity'};
 else if(system.startsWith('Evaluate the student solution'))value={correct:true,feedback:'The reasoning is sound.',missingJustification:''};
 else if(system.startsWith('Evaluate the student work'))value={correct:true,feedback:'The reasoning is sound.',missingJustification:''};
 else if(system.startsWith('Plan a concise'))value={steps:[{id:'s1',prompt:'State the identity.',concept:'Identity'}]};
 else throw Error(`Unexpected mock prompt: ${system}`);
 return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]}));
};
let ip=0;const request=(action,override={})=>new Request('https://example.workers.dev/learning',{method:'POST',headers:{Origin:'http://localhost:5173','Content-Type':'application/json','CF-Connecting-IP':`action-test-${++ip}`},body:JSON.stringify({action,courseId:'analysis',sessionId:'s1',controllerToken:token,...override})});
try{
 let response=await handler.fetch(request('unlock-solution'),env);assert.equal(response.status,409,'solution cannot unlock until all steps are accepted');
 response=await handler.fetch(request('integration-step',{stepId:'s1',work:'x=x'}),env);if(response.status!==200)console.error('integration mock:',await response.clone().text());assert.equal(response.status,200);let output=await response.json();assert.deepEqual(output.integrationAccepted,['s1']);
 const acceptedToken=output.controllerToken;
 response=await handler.fetch(request('unlock-solution',{controllerToken:acceptedToken}),env);assert.equal(response.status,200);output=await response.json();assert.equal(output.solutionUnlocked,true);assert.equal(output.solution.steps.length,1);
 response=await handler.fetch(request('generate-transfer',{controllerToken:output.controllerToken,distance:'near'}),env);assert.equal(response.status,200);output=await response.json();assert.equal(output.transfer.prompt,'Show that $a=a$.');assert.equal(output.phase,6);
 const unlocked=await openState(output.controllerToken,env.CONTROLLER_SECRET);assert.equal(unlocked.solution.unlocked,true);assert.ok(unlocked.transfer.generated.near);
 const prior=globalThis.fetch;
 response=await handler.fetch(request('generate-transfer',{controllerToken:output.controllerToken,distance:'mid'}),env);assert.equal(response.status,200);output=await response.json();const failureState=output.controllerToken;globalThis.fetch=async()=>new Response(JSON.stringify({error:{message:'quota'}}),{status:429});response=await handler.fetch(request('generate-transfer',{controllerToken:failureState,distance:'wider'}),env);assert.equal(response.status,429);assert.equal((await openState(failureState,env.CONTROLLER_SECRET)).transfer.generated.wider,undefined);globalThis.fetch=prior;
 console.log('PASS: mocked Worker integration evaluation, verified solution unlock, audited transfer generation, and provider failure preserves state');
}finally{globalThis.fetch=originalFetch;}
