import assert from 'node:assert/strict';
import handler from './src/index.js';
import { parseMath } from '../src/math.ts';
import { openState } from './src/state-token.js';

const env={ALLOWED_ORIGIN:'http://localhost:5173',GEMINI_API_KEY:'fake',CONTROLLER_SECRET:'test-controller-secret-is-long-enough',GEMINI_MODEL:'gemini-3.5-flash-lite'};
const originalFetch=globalThis.fetch;
let calls=0, lastTutorPayload, malformedOnce=false, rejectAuditOnce=false, ip=0;
const modules=[{id:'cauchy',title:'Cauchy condition',purpose:'Control distances between late terms.',dependsOn:[]},{id:'triangle',title:'Triangle inequality',purpose:'Join estimates.',dependsOn:['cauchy']}];
const question={moduleId:'cauchy',prompt:'Which estimate follows from the Cauchy condition?',options:['$d(x_n,x_m)<\\varepsilon$ for all large $n,m$','$d(x_n,x_m)>\\varepsilon$','$x_n=x_m$','$x_n$ is bounded only','$x_n$ is constant'],correctAnswer:'A',skill:'Cauchy condition',difficulty:'standard',diagram:{type:'none',caption:'',labels:[]}};
const teaching={title:'Control late terms',concept:'The Cauchy condition controls every pair beyond a common index.',workedExample:'For tolerance $0.1$, choose $N$ so $d(x_n,x_m)<0.1$ whenever both indices exceed $N$.',connection:'Use one late subsequence term near the limit.'};
globalThis.fetch=async (_url,opts)=>{
 calls++;
 if(malformedOnce){malformedOnce=false;return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{broken json'}]}}]}));}
 assert.equal(opts.headers['x-goog-api-key'],'fake');
 const request=JSON.parse(opts.body);
 if(request.systemInstruction.parts[0].text.startsWith('Independently check')){
  const valid=!rejectAuditOnce;rejectAuditOnce=false;
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({valid,correctAnswer:'A',rationale:valid?'Only A matches.':'The choices are ambiguous; generate a fresh item.'})}]}}]}));
 }
 lastTutorPayload=JSON.parse(request.contents[0].parts[0].text);
 const result={prerequisites:modules,teaching,reasoningSound:true,problem:'Faithful image transcription',feedback:'Check the quantifiers.',explanation:'Every sufficiently late pair is controlled.',isCorrect:true,learningPlan:{focus:'Cauchy condition',nextMove:'Apply the definition.'},uniqueCorrectChoice:true,correctAnswerRationale:'Only A satisfies the condition.',diagnosedSkill:'Cauchy condition',phase:'Step 2',difficulty:'standard',nextQuestion:{...question,moduleId:lastTutorPayload.selectedModule||'cauchy'}};
 return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]}),{headers:{'Content-Type':'application/json'}});
};
const req=(path,origin,body)=>new Request('https://example.workers.dev'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':`test-${++ip}`},body:JSON.stringify(body)});
const post=body=>handler.fetch(req('/tutor','http://localhost:5173',body),env);
try{
 assert.equal((await handler.fetch(req('/tutor','https://evil.example',{theorem:'Test'}),env)).status,403);
 const startBody={courseId:'analysis',sessionId:'session-1',theorem:'Let $(x_n)$ be Cauchy and $x_{n_k}\\to x$. Prove $x_n\\to x$.'};
 const startResponse=await post(startBody);assert.equal(startResponse.status,200);
 let result=await startResponse.json();
 assert.equal(result.nextQuestion.options.length,5);assert.equal('correctAnswer' in result.nextQuestion,false,'answer key must not reach browser');
 assert.equal(result.answerCorrect,null);assert.equal(result.diagnosticsCount,0);assert.ok(result.controllerToken);
 let state=await openState(result.controllerToken,env.CONTROLLER_SECRET);
 assert.equal(state.problem,startBody.theorem);assert.equal(state.phase,2);
 assert.equal(lastTutorPayload.priorPolicy,'prior-informs-start-never-skips-diagnosis');

 // A wrong response receives a fresh, same-skill verification question; the original miss remains recorded.
 const wrong=await post({...startBody,controllerToken:result.controllerToken,answer:'B',reasoning:'I assumed consecutive terms only.'});
 assert.equal(wrong.status,200);result=await wrong.json();assert.equal(result.answerCorrect,false);assert.equal(result.stage,'verification');assert.equal(result.diagnosticsCount,1);
 assert.equal('correctAnswer' in result.nextQuestion,false);
 state=await openState(result.controllerToken,env.CONTROLLER_SECRET);assert.equal(state.diagnostics[0].correct,false);assert.equal(state.verifications[0].result,'pending');

 const verified=await post({...startBody,controllerToken:result.controllerToken,answer:'A',reasoning:'The common threshold controls any two later indices.'});
 assert.equal(verified.status,200);result=await verified.json();assert.equal(result.stage,'diagnostic');
 state=await openState(result.controllerToken,env.CONTROLLER_SECRET);assert.equal(state.verifications[0].result,'possible-accident');

 // Client stage/count claims do not alter the encrypted server state.
 const wrongCourse=await post({...startBody,courseId:'probability',controllerToken:result.controllerToken,answer:'A'});
 assert.equal(wrongCourse.status,409,'course state cannot be replayed across courses');
 let count=result.diagnosticsCount;
 while(count<10){
  const response=await post({...startBody,controllerToken:result.controllerToken,answer:'A',stage:'proof',phase:6,diagnosticsCount:100});
  assert.equal(response.status,200);result=await response.json();count=result.diagnosticsCount;
 }
 assert.equal(result.diagnosticsCount,10);assert.equal(result.stage,'training');assert.equal(result.phase,3);
 assert.equal(lastTutorPayload.stage,'learning');

 const noToken=await post({...startBody,answer:'A',stage:'proof',diagnosticsCount:10});assert.equal(noToken.status,409);
 const fStart=await post({...startBody,sessionId:'session-f'});const fs=await fStart.json();
 const fResponse=await post({...startBody,sessionId:'session-f',controllerToken:fs.controllerToken,answer:'F'});const fr=await fResponse.json();
 assert.equal(fr.answerCorrect,null,'F is uncertainty, not an incorrect assessed response');
 const fState=await openState(fr.controllerToken,env.CONTROLLER_SECRET);assert.equal(fState.diagnostics[0].correct,null);assert.equal(fState.verifications.length,0);

 const image=await post({courseId:'analysis',sessionId:'image-session',theorem:'',image:{mimeType:'image/png',data:'AQID'}});
 assert.equal(image.status,200);assert.equal((await image.json()).problem,'Faithful image transcription');assert.equal(lastTutorPayload.problemText,'');
 assert.equal((await post({courseId:'analysis',sessionId:'bad-image',theorem:'',image:{mimeType:'image/svg+xml',data:'PHN2Zy8+'}})).status,400);
 assert.equal((await post({courseId:'analysis',sessionId:'oversized',theorem:'x'.repeat(5_800_001)})).status,413);

 const before=calls;malformedOnce=true;
 const recovered=await post({courseId:'analysis',sessionId:'malformed',theorem:'A theorem.'});assert.equal(recovered.status,200);assert.equal(calls-before,3,'malformed output regenerates and is audited');
 const auditBefore=calls;rejectAuditOnce=true;
 const audited=await post({courseId:'analysis',sessionId:'audit-retry',theorem:'A theorem.'});assert.equal(audited.status,200);assert.equal(calls-auditBefore,4,'failed independent audit regenerates and rechecks');
 const latex=parseMath(String.raw`Let \(x_n\) converge. Then \[d(x_n,x)<\varepsilon\]`);
 assert.equal(latex.filter(part=>part.math!==undefined).length,2);
 console.log('PASS: origin, Gemini structured generation, independent audit, image validation, request cap, authenticated server state, hidden answer keys, ten-question minimum, verification, F uncertainty, course isolation, and client-stage tampering');
 console.log('PASS: malformed responses and rejected mathematical questions are regenerated safely');
}finally{globalThis.fetch=originalFetch;}
