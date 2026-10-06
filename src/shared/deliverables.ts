/**
 * Deliverables: what agents hand to the human (reports, plans, tables,
 * images…). They live in the office's `research/` folder (the memory already
 * mines it), a task card can point at one in its `deliverable` field, and the
 * files an agent writes during a session are seen from its tool calls. Pure:
 * main lists, the renderer previews.
 */

/** The office folder, under the hive root, where agents put deliverables. */
export const DELIVERABLES_DIR = 'research';

export type PreviewKind = 'markdown' | 'image' | 'csv' | 'json' | 'html' | 'text' | 'pdf' | 'binary';

const EXT: Record<string, PreviewKind> = {
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image',
  csv: 'csv', tsv: 'csv',
  json: 'json', jsonl: 'text',
  html: 'html', htm: 'html',
  pdf: 'pdf',
  txt: 'text', log: 'text', yaml: 'text', yml: 'text', toml: 'text', xml: 'text', ini: 'text',
  ts: 'text', tsx: 'text', js: 'text', jsx: 'text', cjs: 'text', mjs: 'text', py: 'text', go: 'text', rs: 'text', java: 'text',
  rb: 'text', php: 'text', cs: 'text', c: 'text', h: 'text', cpp: 'text', sh: 'text', ps1: 'text', sql: 'text', css: 'text', scss: 'text'
};

export function extOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1).toLowerCase() : '';
}

export function previewKind(name: string): PreviewKind {
  return EXT[extOf(name)] ?? 'binary';
}

/** Split an absolute path into the folder and the file name (either separator). */
export function splitPath(abs: string): { dir: string; name: string } {
  const i = Math.max(abs.lastIndexOf('/'), abs.lastIndexOf('\\'));
  return i < 0 ? { dir: '.', name: abs } : { dir: abs.slice(0, i) || abs.slice(0, 1), name: abs.slice(i + 1) };
}

const isAbs = (p: string): boolean => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\');

/**
 * The file paths a task's `deliverable` text names: one or more, absolute or
 * relative to the hive root (`research/report.md`), separated by commas, spaces
 * or new lines. Anything without a file extension is not a path.
 */
export function deliverablePaths(text: string | undefined, hiveRoot: string): string[] {
  if (!text) return [];
  const sep = hiveRoot.includes('\\') && !hiveRoot.includes('/') ? '\\' : '/';
  const out: string[] = [];
  // A whole line is one path when it is one (paths may hold spaces); otherwise
  // its words are tried one by one ("see research/report.md").
  const pieces = text.split(/[\n,;]+/).flatMap((line) => {
    const l = line.trim().replace(/^[`'"(<]+|[`'")>.]+$/g, '');
    return /^([A-Za-z]:[\\/]|\/|\.{0,2}[\\/]|[\w-]+[\\/])\S/.test(l) && /\.[A-Za-z0-9]{1,6}$/.test(l) ? [l] : l.split(/\s+/);
  });
  for (const raw of pieces) {
    const p = raw.trim().replace(/^[`'"(<]+|[`'")>.]+$/g, '');
    if (!p || /^https?:\/\//i.test(p) || !/\.[A-Za-z0-9]{1,6}$/.test(p)) continue;
    const abs = isAbs(p) ? p : `${hiveRoot.replace(/[\\/]+$/, '')}${sep}${p.replace(/^\.?[\\/]/, '')}`;
    if (!out.includes(abs)) out.push(abs);
  }
  return out;
}

/** A small CSV/TSV reader for previews: quoted fields, doubled quotes, CRLF. */
export function parseDelimited(text: string, delimiter: string, maxRows = 200): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
      if (rows.length >= maxRows) return rows;
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/** The files an agent wrote or edited, newest first, one entry per file, from
 *  its tool-call events (the `detail` of a write is the file path). */
export function writtenFiles(events: Array<{ event: string; tool?: string; detail?: string; ts?: number; blocked?: boolean }>): Array<{ path: string; ts: number; created: boolean }> {
  const byPath = new Map<string, { path: string; ts: number; created: boolean }>();
  for (const e of events) {
    if (e.event !== 'PreToolUse' || e.blocked || !e.tool || !WRITE_TOOLS.has(e.tool) || !e.detail) continue;
    if (!isAbs(e.detail)) continue;
    const prev = byPath.get(e.detail);
    byPath.set(e.detail, { path: e.detail, ts: e.ts ?? 0, created: (prev?.created ?? false) || e.tool === 'Write' });
  }
  return [...byPath.values()].sort((a, b) => b.ts - a.ts);
}
