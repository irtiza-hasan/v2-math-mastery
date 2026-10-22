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
    .replace(/\\(?:begin|end)\{equation\*?\}/g, '');
  const outsideText = normalized
    .replace(/\\(?:text|mathrm|operatorname)\{[^}]*\}/g, '')
    .replace(/\\(?:begin|end)\{[^}]*\}/g, '')
    .replace(/\\[a-zA-Z]+/g, '');
  try {
    // Keep malformed model delimiters from turning an ordinary paragraph into math.
    if ((outsideText.match(/\b[a-zA-Z]{3,}\b/g) || []).length > 2) throw new Error('Prose inside math');
    return { text: source, math, block, html: katex.renderToString(normalized, {
      displayMode: block, throwOnError: true, strict: 'ignore', trust: false, maxSize: 20, maxExpand: 1000,
    }) };
  } catch {
    return { text: source, error: true };
  }
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
    if (plainStart < index) parts.push({ text: text.slice(plainStart, index) });
    const source = text.slice(index, end + close.length);
    const math = open.startsWith('\\begin') ? source : text.slice(index + open.length, end);
    parts.push(math.trim() ? render(source, math, block) : { text: source });
    index = end + close.length;
    plainStart = index;
  }
  if (plainStart < text.length) parts.push({ text: text.slice(plainStart) });
  return parts.length ? parts : [{ text }];
}
