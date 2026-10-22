import assert from 'node:assert/strict';
import { parseMath } from '../src/math.ts';
const rendered = text => parseMath(text).filter(p => p.math !== undefined);
const samples = [
  String.raw`Let $(x_n)$ be Cauchy. If a subsequence converges to $x$, show $x_n \to x$.`,
  String.raw`\(x_n\to x\) and \[d(x_n,x)<\varepsilon\]`,
  '$$\\begin{pmatrix}1 & 2 \\\\ 3 & 4\\end{pmatrix}$$',
  String.raw`\begin{align*}a&=b+c\\ &=d\end{align*}`,
  String.raw`\[\begin{cases}x^2 & x\ge0\\-x & x<0\end{cases}\]`,
  '$$\n\\sum_{i=1}^n i = \\frac{n(n+1)}{2}\n$$',
  String.raw`$\text{for every }\varepsilon>0,\quad N\in\mathbb{N}$`,
];
for (const source of samples) { assert(rendered(source).length > 0,source); assert(!parseMath(source).some(p=>p.error),source); }
assert.equal(rendered(samples[0]).length,3);
assert.equal(rendered(samples[1]).filter(p=>p.block).length,1);
assert.equal(rendered(String.raw`Cost \$5; then $x^2$.`).length,1);
assert.equal(rendered('An unmatched $x and ordinary text.').length,0);
assert.equal(rendered(String.raw`$\notacommand{x}$`).length,0);
const bad=String.raw`A metric on $2^N. Let us start by testing your foundational understanding of sequences$ now.`;
assert.equal(rendered(bad).length,0);assert.equal(parseMath(bad).map(p=>p.text).join(''),bad);
assert.equal(parseMath(samples[1]).map(p=>p.text).join(''),samples[1],'source remains intact');
assert(!rendered(String.raw`$\href{javascript:alert(1)}{x}$`).some(p=>p.html.includes('href="javascript:')));
console.log('PASS: inline/display delimiters, screenshot example, matrices, align, cases, multiline math, escaped dollars, invalid-source fallback, and untrusted links');
