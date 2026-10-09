import katex from 'katex';

// Malformed model output must remain readable instead of consuming surrounding prose.
export function parseMath(text = ''): { text: string; math?: string; block?: boolean; html?: string }[] {
  const normalized = String(text).replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math}$`).replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `$$${math}$$`);
  return normalized.split(/(\$\$[\s\S]+?\$\$|(?<!\\)\$[^$\n]+(?<!\\)\$)/g).map(part => {
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      const block = part.startsWith('$$') && part.endsWith('$$');
      const math = part.slice(block ? 2 : 1, block ? -2 : -1);
      const outsideText = math.replace(/\\(?:text|mathrm|operatorname)\{[^}]*\}/g, '').replace(/\\[a-zA-Z]+/g, '');
      try {
        if ((outsideText.match(/\b[a-zA-Z]{3,}\b/g) || []).length > 2) throw new Error('Prose inside math');
        const html = katex.renderToString(math, { displayMode: block, throwOnError: true, strict: 'ignore', trust: false });
        return { text: part, math, block, html };
      } catch { /* preserve the original text and mathematical notation */ }
    }
    return { text: part };
  });
}
