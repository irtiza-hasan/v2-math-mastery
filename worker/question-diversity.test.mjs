import assert from 'node:assert/strict';
import { duplicateQuestion } from './src/index.js';
const previous=[{question:'For every epsilon greater than zero, choose N so that d(x_n,x_m) < epsilon for all n,m >= N.',options:['$d(x_n,x_m)<\\varepsilon$','$d(x_n,x_m)>\\varepsilon$','$x_n=x_m$','bounded','constant']}];
assert.equal(duplicateQuestion({prompt:'For every epsilon greater than zero, choose N so that d(y_n,y_m) < epsilon for all n,m >= N.',options:['constant','bounded','$y_n=y_m$','$d(y_n,y_m)>\\varepsilon$','$d(y_n,y_m)<\\varepsilon$']},previous),true,'variable-renamed/reordered duplicate');
assert.equal(duplicateQuestion({prompt:'Which condition guarantees that a sequence is Cauchy?',options:['all late pairs are close','the sequence is bounded','it is monotone','it converges','it is constant']},previous),false,'different angle on same skill is allowed');
assert.equal(duplicateQuestion({prompt:previous[0].question,options:previous[0].options},previous),true,'exact duplicate');
console.log('PASS: question novelty rejects cosmetic repeats and permits different same-skill assessments');
