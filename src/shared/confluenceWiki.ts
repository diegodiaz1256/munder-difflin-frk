/**
 * Confluence wiki markup (.wiki, .confluence) to Markdown, so a deliverable
 * written for Confluence previews like any report. Covers what agents write:
 * headings, bold/italic/strike/monospace, links, nested lists, tables, code
 * and noformat blocks, quotes, panels (info/note/warning/tip) and rules.
 * Anything else is left as text rather than guessed at.
 */

const PANEL = /^\{(panel|info|note|warning|tip)(?::[^}]*)?\}\s*$/i;

/** Inline markup in one line of prose. */
function inline(s: string): string {
  const codes: string[] = [];
  // {{monospace}} first, kept out of the other rules.
  let out = s.replace(/\{\{(.+?)\}\}/g, (_m, c: string) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  out = out
    // [text|url] and [url]
    .replace(/\[([^|\]]+)\|([^\]]+)\]/g, (_m, t: string, u: string) => `[${t.trim()}](${u.trim()})`)
    .replace(/\[((?:https?:\/\/|mailto:)[^\]\s]+)\]/g, '<$1>')
    // *bold*, _italic_, -strike-, +underline+ (not inside words)
    .replace(/(^|[\s(])\*(\S(?:[^*]*\S)?)\*(?=$|[\s).,;:!?])/g, '$1**$2**')
    .replace(/(^|[\s(])_(\S(?:[^_]*\S)?)_(?=$|[\s).,;:!?])/g, '$1*$2*')
    .replace(/(^|[\s(])-(\S(?:[^-]*\S)?)-(?=$|[\s).,;:!?])/g, '$1~~$2~~')
    .replace(/(^|[\s(])\+(\S(?:[^+]*\S)?)\+(?=$|[\s).,;:!?])/g, '$1$2')
    // \\ forced line break
    .replace(/\\\\\s*$/g, '  ');
  return out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => `\`${codes[Number(i)]}\``);
}

export function confluenceToMarkdown(src: string): string {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let fence: string | null = null; // the closing tag of an open {code}/{noformat}
  let quote: string | null = null; // the closing tag of an open {quote}/{panel}...
  let tableHeaderDone = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (fence) {
      const close = line.indexOf(fence);
      if (close >= 0) { if (close > 0) out.push(line.slice(0, close)); out.push('```'); fence = null; }
      else out.push(raw);
      continue;
    }
    const code = /^\s*\{(code|noformat)(?::([^}]*))?\}(.*)$/i.exec(line);
    if (code) {
      const lang = (code[2] ?? '').split('|').map((p) => p.trim()).find((p) => /^[a-z0-9+#-]+$/i.test(p) && !p.includes('=')) ?? '';
      const tag = `{${code[1].toLowerCase()}}`;
      out.push('```' + (code[1].toLowerCase() === 'code' ? lang.toLowerCase() : ''));
      const rest = code[3];
      const close = rest.indexOf(tag);
      if (close >= 0) { if (close > 0) out.push(rest.slice(0, close)); out.push('```'); }
      else { if (rest.trim()) out.push(rest); fence = tag; }
      continue;
    }
    const panel = PANEL.exec(line) ?? /^\{quote\}\s*$/i.exec(line);
    if (panel) {
      const kind = panel[1]?.toLowerCase() ?? 'quote';
      if (quote && (line.toLowerCase() === `{${kind}}` || line.toLowerCase() === quote)) { quote = null; out.push(''); continue; }
      quote = `{${kind}}`;
      if (kind !== 'quote' && kind !== 'panel') out.push(`> **${kind[0].toUpperCase()}${kind.slice(1)}**`);
      continue;
    }
    const prefix = quote ? '> ' : '';
    if (/^\s*----\s*$/.test(line)) { out.push(prefix + '---'); continue; }
    const h = /^\s*h([1-6])\.\s+(.*)$/.exec(line);
    if (h) { out.push(prefix + '#'.repeat(Number(h[1])) + ' ' + inline(h[2])); continue; }
    const bq = /^\s*bq\.\s+(.*)$/.exec(line);
    if (bq) { out.push('> ' + inline(bq[1])); continue; }
    if (/^\s*\|\|/.test(line)) {
      const cells = line.trim().replace(/^\|\||\|\|$/g, '').split('||').map((c) => inline(c.trim()));
      out.push(prefix + '| ' + cells.join(' | ') + ' |', prefix + '|' + cells.map(() => ' --- ').join('|') + '|');
      tableHeaderDone = true;
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      if (!tableHeaderDone) { out.push(prefix + '| ' + cells.map(() => ' ').join(' | ') + ' |', prefix + '|' + cells.map(() => ' --- ').join('|') + '|'); tableHeaderDone = true; }
      out.push(prefix + '| ' + cells.join(' | ') + ' |');
      continue;
    }
    tableHeaderDone = false;
    const li = /^\s*([*#-]+)\s+(.*)$/.exec(line);
    if (li && !/^-+$/.test(li[1])) {
      const depth = li[1].length - 1;
      const marker = li[1].endsWith('#') ? '1.' : '-';
      out.push(prefix + '  '.repeat(depth) + marker + ' ' + inline(li[2]));
      continue;
    }
    out.push(prefix + inline(line));
  }
  if (fence) out.push('```');
  return out.join('\n');
}
