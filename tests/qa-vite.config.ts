/** Explicit local browser-test server. Never used by npm run dev/build or deployed. */
import { defineConfig, mergeConfig } from 'vite';
import base from '../vite.config.js';
const modules = [
  { id: 'cauchy', title: 'Cauchy condition', purpose: 'Control $d(x_n,x_m)$ for late terms.', dependsOn: [] },
  { id: 'triangle', title: 'Triangle inequality', purpose: 'Combine bounds using the triangle inequality.', dependsOn: ['cauchy'] },
];
export default mergeConfig(base, defineConfig({ plugins: [{
  name: 'explicit-browser-qa-fixture',
  configureServer(server) {
    server.middlewares.use('/__qa/tutor', (req, res) => {
      let raw = '';
      req.on('data', chunk => { raw += chunk; });
      req.on('end', () => {
        const body = JSON.parse(raw || '{}');
        const correct = body.answer ? body.answer === body.currentQuestion?.correctAnswer : null;
        const module = modules.find(m => m.id === body.selectedModule) || modules[(body.history?.length || 0) % 2];
        const question = module.id === 'cauchy' ? {
          prompt: 'Which statement defines a Cauchy sequence $(x_n)$?',
          options: [String.raw`For every $\varepsilon>0$, there exists $N$ such that $d(x_n,x_m)<\varepsilon$ for all $n,m>N$.`, '$x_n$ is constant.', '$x_n$ is increasing.', '$d(x_n,x_m)>1$ for all $n,m$.', 'Only one pair of terms is close.'],
        } : {
          prompt: 'Which inequality combines the two distances?',
          options: ['$d(x_n,x)\\le d(x_n,x_m)+d(x_m,x)$.', '$d(x_n,x)>d(x_n,x_m)+d(x_m,x)$.', '$d(x_n,x)=0$ for every $n$.', '$d(x_n,x_m)<0$.', '$d(x_m,x)=-1$.'],
        };
        const response = {
          problem: body.theorem || 'Let $(x_n)$ be Cauchy and a subsequence converge to $x$. Show $x_n\\to x$.',
          prerequisites: modules,
          nextQuestion: { ...question, moduleId: module.id, skill: module.title, difficulty: 'standard', correctAnswer: 'A', diagram: { type: 'none', caption: '' } },
          feedback: body.answer ? correct ? 'Correct. The quantifiers and the distance bound are justified.' : 'Check the defining condition for every $\\varepsilon>0$.' : body.learnerFeedback?.note ? 'Feedback received. Review the condition for $\\varepsilon>0$.' : '',
          explanation: body.answer ? '$$d(x_n,x)\\le d(x_n,x_m)+d(x_m,x).$$' : '',
          reasoningSound: true,
          teaching: body.stage === 'learning' || body.stage === 'proof' ? { title: module.title, concept: 'Use the defining distance bound for every sufficiently late pair of terms.', workedExample: '$$d(x_n,x)\\le \\varepsilon/2+\\varepsilon/2=\\varepsilon.$$', connection: 'Apply this bound to the original sequence and a late subsequence term.' } : null,
          learningPlan: { focus: module.title, nextMove: 'Apply the distance bound.' },
        };
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(response));
      });
    });
  },
}] }));
