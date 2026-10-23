import assert from 'node:assert/strict';
import { parseMath } from '../src/math.ts';
import { validMathText, validModelMath } from '../worker/src/math-validation.js';
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
const exactExamples=[
  String.raw`$\sqrt{2} \notin \mathbb{Q}$`,
  String.raw`\sqrt{2} \notin \mathbb{Q} is the contradiction we need.`,
  String.raw`$q eq 0$`,
  String.raw`$q \neq 0$`,
];
for(const source of exactExamples){assert(rendered(source).length>0,source);assert(!parseMath(source).some(part=>part.error),source);}
assert(rendered(exactExamples[1]).length===1,'bare TeX expressions are bounded before surrounding prose');
assert(rendered(exactExamples[2])[0].math.includes('\\neq'),'the screenshot’s unambiguous malformed nonzero condition is normalized');
assert.equal(rendered(String.raw`Use \sqrt{2} in code: `+'`'+String.raw`\\sqrt{3}`+'`')[0].math,String.raw`\sqrt{2}`,'bare TeX in plain prose is recognized without parsing code spans');
assert(rendered(String.raw`Assume x \in \mathbb{R}.`)[0].math.startsWith('x '),'bare variable prefixes are included in TeX expressions');
const malformed=String.raw`$\frac{1}{x$`;
assert(parseMath(malformed).some(part=>part.error),'invalid LaTeX stays visible as source with an error marker');
assert.equal(parseMath(malformed).map(part=>part.text).join(''),malformed,'invalid mathematical source is not silently discarded');
assert(validMathText(String.raw`\sqrt{2} \notin \mathbb{Q}`));
assert(validMathText(String.raw`The definition is $d(x_n,x)<\varepsilon$ and $$\sum_{i=1}^n i=\frac{n(n+1)}2.$$`));
assert(!validMathText(String.raw`$q eq 0$`),'backend rejects the exact malformed multiple-choice expression');
assert(!validMathText(String.raw`$\frac{1}{x$`),'backend refuses malformed delimited TeX before presentation');
assert(!validModelMath({options:['$x=0$','$$\\sqrt{x}$$','\\[a=b\\]','$q eq 0$']}));
console.log('PASS: delimiters, exact screenshot failures, bare TeX, safe nonzero repair, matrices, align, cases, multiline math, escaping, malformed-source fallback, and untrusted links');
