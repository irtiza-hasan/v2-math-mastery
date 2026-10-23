import katex from 'katex';

export type MathPart = { text: string; math?: string; block?: boolean; html?: string; error?: boolean };

function escaped(text: string, index: number) {
  let count = 0;
  while (index > 0 && text[--index] === '\\') count++;
  return count % 2 === 1;
}

function render(source: string, math: string, block: boolean): MathPart {
  // KaTeX uses aligned/gathered for display environments supplied by a tutor.
  const normalized = math
    .replace(/\\(begin|end)\{align\*?\}/g, '\\$1{aligned}')
    .replace(/\\(begin|end)\{gather\*?\}/g, '\\$1{gathered}')
    // Gemini occasionally drops the backslash and the leading n in the common
    // nonzero condition. This narrow form is unambiguous in a delimited formula.
    .replace(/(?<=\b[A-Za-z])\s+eq\s+(?=0(?:\b|$))/g, ' \\neq ')
    .replace(/\\(?:begin|end)\{equation\*?\}/g, '');
  const outsideText = normalized
    .replace(/\\(?:text|mathrm|operatorname)\{[^}]*\}/g, '')
    .replace(/\\(?:begin|end)\{[^}]*\}/g, '')
    .replace(/\\[a-zA-Z]+/g, '');
  try {
    // Keep malformed model delimiters from turning an ordinary paragraph into math.
    if ((outsideText.match(/\b[a-zA-Z]{3,}\b/g) || []).length > 2) throw new Error('Prose inside math');
    return { text: source, math: normalized, block, html: katex.renderToString(normalized, {
      displayMode: block, throwOnError: true, strict: 'ignore', trust: false, maxSize: 20, maxExpand: 1000,
    }) };
  } catch {
    return { text: source, error: true };
  }
}

const BARE_TEX_COMMANDS = new Set(['\\sqrt','\\frac','\\dfrac','\\tfrac','\\mathbb','\\mathcal','\\mathbf','\\mathrm','\\operatorname','\\in','\\notin','\\subset','\\subseteq','\\supset','\\supseteq','\\to','\\mapsto','\\implies','\\iff','\\le','\\leq','\\ge','\\geq','\\neq','\\ne','\\approx','\\sim','\\times','\\cdot','\\pm','\\infty','\\sum','\\prod','\\lim','\\forall','\\exists','\\varepsilon','\\epsilon','\\delta','\\lambda','\\alpha','\\beta','\\gamma','\\mathbb']);

function readGroup(source: string, start: number): number {
  if (source[start] !== '{') return start;
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{' && !escaped(source, i)) depth++;
    if (source[i] === '}' && !escaped(source, i) && --depth === 0) return i + 1;
  }
  return start;
}

function bareMathEnd(source: string, start: number): number {
  let i = start, sawCommand = false, tokens = 0;
  while (i < source.length && source[i] !== '\n') {
    const beforeSpace = i;
    while (source[i] === ' ' || source[i] === '\t') i++;
    const tokenStart = i;
    if (source[i] === '\\' && !escaped(source, i)) {
      const command = source.slice(i).match(/^\\[A-Za-z]+/)?.[0];
      if (!command || !BARE_TEX_COMMANDS.has(command)) { i = beforeSpace; break; }
      sawCommand = true; i += command.length;
      while (source[i] === '{') { const end = readGroup(source, i); if (end === i) break; i = end; }
      while (source[i] === '_' || source[i] === '^') {
        i++; if (source[i] === '{') { const end = readGroup(source, i); if (end === i) break; i = end; }
        else if (/[A-Za-z0-9]/.test(source[i] || '')) i++;
      }
    } else if (/[A-Za-z]/.test(source[i] || '')) {
      const variable = source[i++];
      if (/[A-Za-z]/.test(source[i] || '')) { i = beforeSpace; break; }
      if (source[i] === '_' || source[i] === '^') {
        i++; if (source[i] === '{') { const end = readGroup(source, i); if (end === i) { i = beforeSpace; break; } i = end; }
        else if (/[A-Za-z0-9]/.test(source[i] || '')) i++;
      }
      if (!variable) { i = beforeSpace; break; }
    } else if (/[0-9]/.test(source[i] || '')) {
      while (/[0-9.]/.test(source[i] || '')) i++;
    } else if (/[=<>+*/(),|\[\]{}-]/.test(source[i] || '')) {
      i++;
    } else { i = beforeSpace; break; }
    if (i === tokenStart) { i = beforeSpace; break; }
    tokens++;
  }
  return sawCommand && tokens ? i : start;
}

function appendPlain(parts: MathPart[], source: string) {
  let start = 0, i = 0, code = false;
  while (i < source.length) {
    if (source[i] === '`' && !escaped(source, i)) { code = !code; i++; continue; }
    if (!code && source[i] === '\\' && !escaped(source, i)) {
      const command = source.slice(i).match(/^\\[A-Za-z]+/)?.[0];
      if (command && BARE_TEX_COMMANDS.has(command)) {
        const end = bareMathEnd(source, i);
        if (end > i) {
          const before = source.slice(start, i);
          const variable = before.match(/(?:^|[\s(])([A-Za-z](?:[_^][A-Za-z0-9]+)?)\s+$/);
          const expressionStart = variable ? start + before.lastIndexOf(variable[1]) : i;
          if (start < expressionStart) parts.push({ text: source.slice(start, expressionStart) });
          const math = source.slice(expressionStart, end).trim();
          parts.push(render(`$${math}$`, math, false));
          i = end; start = end; continue;
        }
      }
    }
    i++;
  }
  if (start < source.length) parts.push({ text: source.slice(start) });
}

/** Supports $...$, $$...$$, \(...\), \[...\], and common display environments.
 * Unbalanced/unsupported notation stays readable; text is never injected as HTML.
 */
export function parseMath(text = ''): MathPart[] {
  text = String(text);
  const parts: MathPart[] = [];
  let plainStart = 0;
  let index = 0;
  while (index < text.length) {
    let open = '', close = '', block = false;
    if (text[index] === '$' && !escaped(text, index)) {
      open = text[index + 1] === '$' ? '$$' : '$'; close = open; block = open === '$$';
    } else if (text[index] === '\\' && !escaped(text, index)) {
      if (text.startsWith('\\(', index)) { open = '\\('; close = '\\)'; }
      else if (text.startsWith('\\[', index)) { open = '\\['; close = '\\]'; block = true; }
      else {
        const environment = text.slice(index).match(/^\\begin\{(align\*?|aligned|gather\*?|gathered|equation\*?)\}/);
        if (environment) { open = environment[0]; close = `\\end{${environment[1]}}`; block = true; }
      }
    }
    if (!open) { index++; continue; }
    let end = text.indexOf(close, index + open.length);
    while (end >= 0 && escaped(text, end)) end = text.indexOf(close, end + close.length);
    if (end < 0 || (!block && text.slice(index + open.length, end).includes('\n'))) { index += open.length; continue; }
    if (plainStart < index) appendPlain(parts, text.slice(plainStart, index));
    const source = text.slice(index, end + close.length);
    const math = open.startsWith('\\begin') ? source : text.slice(index + open.length, end);
    parts.push(math.trim() ? render(source, math, block) : { text: source });
    index = end + close.length;
    plainStart = index;
  }
  if (plainStart < text.length) appendPlain(parts, text.slice(plainStart));
  return parts.length ? parts : [{ text }];
}
