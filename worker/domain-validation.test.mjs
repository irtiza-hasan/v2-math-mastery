import assert from 'node:assert/strict';
import { createLearningState, transition } from './src/controller.js';

const cases = [
  {
    name: 'Real Analysis', problem: 'Prove that every convergent sequence in a metric space is Cauchy.',
    modules: [
      { id: 'convergence', title: 'Metric-space convergence', purpose: 'Use the epsilon definition.', dependsOn: [] },
      { id: 'triangle', title: 'Triangle inequality', purpose: 'Bound d(x_m,x_n) through the limit.', dependsOn: ['convergence'] }
    ],
    question: { moduleId: 'convergence', skill: 'epsilon definition', prompt: 'For which N condition is convergence enough?', options: ['m,n≥N','m=N only','n=N only','m,n≤N','no N'], correctAnswer: 'A', assessmentType: 'definition' },
    steps: [{ id: 'choose', prompt: 'Choose N for epsilon/2.', concept: 'convergence' }, { id: 'bound', prompt: 'Apply the triangle inequality.', concept: 'triangle' }]
  },
  {
    name: 'Information Theory', problem: 'Derive H(X,Y)=H(X)+H(Y|X).',
    modules: [
      { id: 'joint', title: 'Joint entropy', purpose: 'Expand the joint sum.', dependsOn: [] },
      { id: 'factor', title: 'Probability factorization', purpose: 'Use p(x,y)=p(x)p(y|x).', dependsOn: ['joint'] }
    ],
    question: { moduleId: 'factor', skill: 'chain rule', prompt: 'Which factorization is valid?', options: ['p(x,y)=p(x)p(y|x)','p(x,y)=p(x)+p(y|x)','p(x,y)=p(x)/p(y|x)','p(x,y)=p(y|x)','none'], correctAnswer: 'A', assessmentType: 'manipulation' },
    steps: [{ id: 'expand', prompt: 'Expand joint entropy.', concept: 'joint' }, { id: 'split', prompt: 'Substitute the factorization and split the logarithm.', concept: 'factor' }]
  },
  {
    name: 'Numerical optimization', problem: 'Minimize f(x)=x²-4x+5 over the real numbers.',
    modules: [
      { id: 'stationary', title: 'Stationary point', purpose: 'Solve f′(x)=0.', dependsOn: [] },
      { id: 'convexity', title: 'Second derivative test', purpose: 'Verify the global minimum.', dependsOn: ['stationary'] }
    ],
    question: { moduleId: 'stationary', skill: 'differentiate', prompt: 'Where does f′ vanish?', options: ['x=2','x=-2','x=0','x=4','nowhere'], correctAnswer: 'A', assessmentType: 'application' },
    steps: [{ id: 'differentiate', prompt: 'Compute and solve f′(x)=0.', concept: 'stationary' }, { id: 'verify', prompt: 'Verify minimality and compute the value.', concept: 'convexity' }]
  }
];

for (const fixture of cases) {
  assert.ok(fixture.modules.every((module, index) => module.dependsOn.every(id => fixture.modules.slice(0, index).some(parent => parent.id === id))), `${fixture.name}: prerequisite dependencies must be acyclic and ordered`);
  let state = createLearningState({ courseId: fixture.name, sessionId: 'validation', problem: fixture.problem, prerequisites: fixture.modules, initialQuestion: fixture.question, questionId: 'q0' });
  for (let i=0;i<10;i++) state=transition(state,{type:'diagnostic-answer',questionId:state.active.id,choice:'A',correct:true,reasoningSound:true,objective:fixture.question.assessmentType,nextQuestion:{id:`q${i+1}`,question:fixture.question}});
  state=transition(state,{type:'integration-plan',steps:fixture.steps});
  assert.throws(()=>transition(state,{type:'integration-step',stepId:fixture.steps[1].id,verified:true}),/validated order/);
  for (const step of fixture.steps) state=transition(state,{type:'integration-step',stepId:step.id,verified:true});
  state=transition(state,{type:'complete-integration',solutionSteps:[{math:fixture.problem,explanation:'Fixture solution independently reviewed in the test specification.'}]});
  state=transition(state,{type:'transfer-generated',distance:'near',prompt:`A related ${fixture.name} exercise.`});
  state=transition(state,{type:'transfer-evaluated',distance:'near',correct:true,feedback:'The essential reasoning is present.'});
  state=transition(state,{type:'retrieval-started',question:{id:'r1',question:fixture.question}});
  state=transition(state,{type:'retrieval-observation',questionId:'r1',skillId:fixture.question.moduleId,correct:true,reasoningSound:true});
  assert.deepEqual(state.phaseHistory,[0,1,2,3,4,5,6],`${fixture.name}: all phases must be recorded in order`);
}

// Numerical checks for the representative mathematical claims.
assert.ok(2 * 0.25 < 1, 'epsilon/2 triangle bound is strictly below epsilon');
const joint=[[0.25,0.25],[0.125,0.375]];
const entropy=values=>-values.filter(Boolean).reduce((sum,p)=>sum+p*Math.log2(p),0);
const hx=entropy(joint.map(row=>row.reduce((a,b)=>a+b,0)));
const hxy=entropy(joint.flat());
const hyGivenX=joint.reduce((sum,row)=>{const px=row.reduce((a,b)=>a+b,0);return sum+px*entropy(row.map(p=>p/px));},0);
assert.ok(Math.abs(hxy-(hx+hyGivenX))<1e-12,'entropy chain rule holds on a non-uniform joint distribution');
assert.equal((2**2)-4*2+5,1); assert.ok([0,1,3,4].every(x=>x*x-4*x+5>=1),'quadratic has global minimum at x=2');
console.log('PASS: mocked Phase 0–6 controller workflows for Real Analysis, Information Theory, and numerical optimization');
