import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({ configFile: 'vite.config.js', server: { middlewareMode: true }, appType: 'custom' });
try {
  const { ThreadMessage, MathText } = await server.ssrLoadModule('/src/Tutor.tsx');
  const { LearningWorkspace } = await server.ssrLoadModule('/src/components/LearningWorkspace.tsx');
  const { newSession } = await server.ssrLoadModule('/src/models.ts');
  const messages = [];
  let time = 1;
  const add = message => messages.push({ id: `m${messages.length}`, createdAt: time++, ...message });
  const question = (label, activity = 'guided', active = false) => ({
    id: `q-${label}`, role: 'tutor', kind: 'question', activity, active,
    question: { questionId: `qid-${label}`, prompt: `${label}: evaluate $\\frac{1}{2}+\\frac{1}{2}$.`, options: ['$1$', '$2$', '$3$', '$4$', '$5$'], skill: 'Mathematical reasoning' },
  });
  add({ role: 'student', kind: 'problem', text: 'Prove every convergent sequence in a metric space is Cauchy.' });
  add({ role: 'tutor', kind: 'explanation', phase: 0, blocks: [{ type: 'paragraph', text: 'We will establish the epsilon condition.' }] });
  add({ role: 'tutor', kind: 'explanation', phase: 1, blocks: [{ type: 'paragraph', text: 'Prerequisites: metric, convergence, triangle inequality.' }] });
  for (let index = 1; index <= 10; index++) {
    add(question(`Diagnostic ${index}`));
    add({ role: 'student', kind: 'answer', choice: index === 2 ? 'F' : 'A', text: index === 2 ? "I don't know yet" : '$1$' });
    add({ role: 'tutor', kind: 'explanation', verdict: index !== 2, phase: 2, blocks: [{ type: 'paragraph', text: `Diagnostic feedback ${index}.` }, { type: 'derivation', text: '$$1/2+1/2=1.$$' }] });
  }
  add(question('Verification'));
  add({ role: 'student', kind: 'answer', choice: 'B', text: '$2$' });
  add({ role: 'tutor', kind: 'explanation', verdict: false, phase: 2, blocks: [{ type: 'paragraph', text: 'The verification confirms a gap.' }] });
  add({ role: 'tutor', kind: 'explanation', phase: 3, blocks: [{ type: 'paragraph', text: 'Targeted remediation: use the triangle inequality.' }, { type: 'derivation', text: '$$d(x_n,x_m)\\le d(x_n,x)+d(x_m,x).$$' }] });
  add(question('Topic training', 'guided'));
  add({ role: 'student', kind: 'answer', choice: 'A', text: '$1$' });
  add({ role: 'tutor', kind: 'explanation', verdict: true, phase: 3, blocks: [{ type: 'paragraph', text: 'The prerequisite is ready.' }] });
  add({ role: 'system', kind: 'phase', phase: 4, text: 'Gradual integration' });
  add(question('Integration 1', 'integration'));
  add({ role: 'student', kind: 'answer', choice: 'A', text: '$1$' });
  add({ role: 'tutor', kind: 'explanation', verdict: true, phase: 4, blocks: [{ type: 'paragraph', text: 'This step is justified.' }] });
  add({ role: 'system', kind: 'phase', phase: 5, text: 'Verified solution unlocked' });
  add({ role: 'tutor', kind: 'explanation', phase: 5, blocks: [{ type: 'derivation', text: '$$d(x_n,x_m)<\\varepsilon/2+\\varepsilon/2=\\varepsilon.$$' }] });
  add({ role: 'tutor', kind: 'transfer', distance: 'near', text: 'Transfer: apply the same estimate in a normed space.', active: false });
  add({ role: 'student', kind: 'answer', text: 'Use the norm triangle inequality.' });
  add({ role: 'tutor', kind: 'explanation', phase: 6, blocks: [{ type: 'paragraph', text: 'The argument transfers.' }] });
  add({ role: 'system', kind: 'phase', phase: 6, text: 'REPITITION started' });
  for (let index = 1; index <= 10; index++) {
    add(question(`REPITITION ${index}`, 'retrieval'));
    add({ role: 'student', kind: 'answer', choice: 'A', text: '$1$' });
    add({ role: 'tutor', kind: 'explanation', phase: 6, blocks: [{ type: 'paragraph', text: `Retrieval feedback ${index}.` }] });
  }
  add(question('Interleaved retrieval', 'retrieval', true));

  const course = { id: 'analysis', name: 'Real Analysis', description: '', createdAt: 1 };
  const session = newSession(course.id);
  session.phase = 6;
  session.learner = {
    theorem: 'Prove every convergent sequence in a metric space is Cauchy.', messages,
    currentQuestion: messages.at(-1).question, controllerToken: 'mock-token', mode: 'repetition', stage: 'repetition',
    solutionUnlocked: true, retrievalCount: 10, transferExercises: { near: 'Near', mid: 'Mid', wider: 'Wider' },
  };
  const store = { version: 1, revision: 0, courses: [course], sessions: [session], skills: [], evidence: [] };
  const html = renderToStaticMarkup(React.createElement(LearningWorkspace, {
    session, store, patch: () => {}, saveLearner: () => {},
  }));
  const visible = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const position = text => visible.indexOf(text);
  assert(position('Prove every convergent sequence') < position('Diagnostic 1'));
  assert(position('Diagnostic 1') < position('Diagnostic 10'));
  assert(position('Diagnostic 10') < position('Verification'));
  assert(position('Verification') < position('Targeted remediation'));
  assert(position('Targeted remediation') < position('Integration 1'));
  assert(position('Integration 1') < position('Verified solution unlocked'));
  assert(position('Verified solution unlocked') < position('Transfer: apply'));
  assert(position('Transfer: apply') < position('REPITITION started'));
  assert(position('REPITITION 1') < position('REPITITION 10'));
  assert(position('REPITITION 10') < position('Interleaved retrieval'));
  assert.equal((html.match(/questionBubble/g) || []).length, 1, 'only the active retrieval question has answer controls');
  assert.equal((html.match(/Prove every convergent sequence in a metric space is Cauchy/g) || []).length, 1, 'the original problem is not duplicated as a separate panel');
  assert(html.includes('katex'), 'historical equations are passed through the KaTeX renderer');
  assert(html.includes('REPITITION started') && html.includes('Stop REPITITION'), 'retrieval and stop control appear in the same thread');
  const standalone = renderToStaticMarkup(React.createElement(ThreadMessage, { message: messages.find(message => message.kind === 'question' && message.active), activeContent: React.createElement('div', { className: 'questionBubble' }, React.createElement(MathText, { text: '$x_n\\to x$' })) }));
  assert(standalone.includes('katex'), 'active question mathematics uses the same renderer');
  const legacySession = newSession(course.id);
  const legacyIntegrationQuestion = { questionId: 'legacy-step-1', prompt: 'Legacy integration step?', options: ['$1$', '$2$', '$3$', '$4$', '$5$'], correctAnswer: 'A' };
  legacySession.phase = 6;
  legacySession.learner = {
    theorem: 'Legacy saved theorem.', controllerToken: 'mock-token', stage: 'repetition', mode: 'repetition', diagnosticsCount: 0,
    messages: [{ id: 'legacy-problem', role: 'student', kind: 'problem', text: 'Legacy saved theorem.', createdAt: 1 }],
    modules: [{ id: 'legacy-skill', title: 'Metric convergence', purpose: 'Use metric distance.' }],
    integrationPlan: [{ id: 'legacy-step-1', concept: 'Use the metric definition.', question: legacyIntegrationQuestion }],
    integrationAccepted: ['legacy-step-1'], integrationWork: { 'legacy-step-1': 'The metric distance is below epsilon.', 'transfer-near': 'Apply the same bound.' },
    integrationFeedback: { 'legacy-step-1': 'This step is justified.' }, solutionUnlocked: true,
    verifiedSolution: { steps: [{ math: '$$d(x_n,x)<\\varepsilon$$', explanation: 'Choose the convergence threshold.' }] },
    transferExercises: { near: 'Legacy transfer exercise.' }, transferFeedback: { near: 'The argument transfers.' },
    currentQuestion: { prompt: 'Legacy active question $x_n\\to x$?', options: ['$1$', '$2$', '$3$', '$4$', '$5$'] },
  };
  const legacyHtml = renderToStaticMarkup(React.createElement(LearningWorkspace, {
    session: legacySession, store: { ...store, sessions: [legacySession] }, patch: () => {}, saveLearner: () => {},
  }));
  assert(legacyHtml.includes('Legacy active question'), 'pre-timeline sessions migrate their active question into the conversation');
  assert.equal((legacyHtml.match(/questionBubble/g) || []).length, 1, 'legacy migration does not duplicate the active question');
  assert(legacyHtml.includes('Legacy integration step') && legacyHtml.includes('The metric distance is below epsilon.'), 'legacy integration questions and responses are restored');
  assert(legacyHtml.includes('Legacy transfer exercise.') && legacyHtml.includes('Apply the same bound.'), 'legacy transfer work and exercises are restored');
  assert(legacyHtml.includes('Choose the convergence threshold.'), 'legacy verified solutions are restored in the transcript');
  assert(!legacyHtml.includes('correctAnswer'), 'legacy migration never reveals saved answer keys');
  console.log('PASS: single chronological Phase 0–6 workspace render, one active question, no duplicate problem/solution panels, KaTeX in historical/active messages, and legacy phase-content migration without answer-key exposure');
} finally {
  await server.close();
}
