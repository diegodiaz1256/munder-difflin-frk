/**
 * Structured memory: what an agent's memory.md says, sorted into the sections
 * a project needs (decisions, conventions, known issues, key files, open
 * questions). New agents are seeded with these headings and told to write
 * under them; older or free-form memories still parse (their bullets land in
 * "notes", or in a section their own heading clearly names).
 */

export type MemorySection = 'decisions' | 'conventions' | 'issues' | 'files' | 'questions' | 'notes';

export const SECTION_ORDER: MemorySection[] = ['decisions', 'conventions', 'issues', 'files', 'questions', 'notes'];

/** The headings a new memory.md starts with (English, the agents' working language). */
export const MEMORY_TEMPLATE_HEADINGS: Array<[MemorySection, string]> = [
  ['decisions', 'Decisions'],
  ['conventions', 'Conventions'],
  ['issues', 'Known issues'],
  ['files', 'Key files'],
  ['questions', 'Open questions'],
  ['notes', 'Log']
];

export function memoryTemplate(name: string, id: string): string {
  return [
    `# Memory — ${name} (${id})`,
    '',
    '_Durable knowledge, one dated bullet each, under the heading it belongs to. Correct or remove a bullet when it stops being true._',
    '',
    ...MEMORY_TEMPLATE_HEADINGS.flatMap(([, h]) => [`## ${h}`, ''])
  ].join('\n');
}

/** Which section a heading names (English or Spanish), or null. */
export function sectionForHeading(heading: string): MemorySection | null {
  const h = heading.toLowerCase();
  if (/decisi|decided|chosen/.test(h)) return 'decisions';
  if (/convention|convenci|rules?\b|reglas?|style|estilo|how we/.test(h)) return 'conventions';
  if (/issue|problem|gotcha|bug|pitfall|caveat|known|incidenc|problema|error/.test(h)) return 'issues';
  if (/files?|ficheros?|archivos?|paths?|rutas?|where things/.test(h)) return 'files';
  if (/question|pregunta|todo|pending|pendiente|open/.test(h)) return 'questions';
  if (/log|notes?|notas?|history|historial|diario/.test(h)) return 'notes';
  return null;
}

export interface MemoryEntry {
  section: MemorySection;
  text: string;
  /** ISO date the bullet starts with ("2026-10-05: …"), when it has one. */
  date?: string;
  /** The exact line in memory.md, so it can be edited or removed. */
  line: string;
}

const DATE = /^(\d{4}-\d{2}-\d{2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?Z?)?\s*[:—–-]?\s*/;

/** Sort a memory.md into sections, one entry per bullet (or paragraph). */
export function parseMemory(md: string): MemoryEntry[] {
  const out: MemoryEntry[] = [];
  let section: MemorySection = 'notes';
  let headingDate: string | undefined;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const t = line.trim();
    if (!t || /^_.*_$/.test(t) || /^# /.test(t)) continue;
    const head = /^#{2,6}\s+(.*)$/.exec(t);
    if (head) {
      section = sectionForHeading(head[1]) ?? section;
      // "## 2026-10-05 — Task: …" dates the bullets under it.
      headingDate = DATE.exec(head[1])?.[1];
      if (!sectionForHeading(head[1]) && !headingDate) section = 'notes';
      continue;
    }
    const bullet = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    let text = (bullet ? bullet[1] : t).trim();
    if (text.length < 4) continue;
    const d = DATE.exec(text);
    const date = d?.[1] ?? headingDate;
    if (d) text = text.slice(d[0].length).trim();
    // A bullet can name its own kind: "Decision: …", "Gotcha: …".
    const tag = /^(decision|decisión|convention|convención|rule|regla|gotcha|issue|problema|file|fichero|question|pregunta)\s*:\s*/i.exec(text);
    const own = tag ? sectionForHeading(tag[1]) : null;
    if (tag) text = text.slice(tag[0].length);
    out.push({ section: own ?? section, text, date, line });
  }
  return out;
}

/** A file path mentioned in an entry (for "Key files": open it). */
export function filePathIn(text: string): string | null {
  const m = /`([^`\s]+\.[A-Za-z0-9]{1,6})`|(?:^|\s)((?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]{1,6})\b/.exec(text);
  return m ? (m[1] ?? m[2]) : null;
}
