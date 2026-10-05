/**
 * Structured memory: what an agent's memory.md says, sorted into the sections
 * its kind of project needs. A software repository wants decisions,
 * conventions, known issues and key files; a research project wants findings,
 * sources and a glossary; a data project wants datasets, metrics and
 * assumptions… New agents are seeded with the headings of their project's
 * type and told to write under them. The Memory screen groups by the
 * headings agents actually used (synonyms in English and Spanish merged), so
 * a heading nobody planned for still gets its own card.
 */

export type ProjectType = 'code' | 'data' | 'infra' | 'docs' | 'research';

export interface SectionDef { key: string; label: string; hint: string; tone: string }

/** Every known section, keyed; `match` recognises it in a heading. */
const SECTIONS: Array<SectionDef & { match: RegExp }> = [
  { key: 'decisions', label: 'Decisions', hint: 'What was chosen, and why.', tone: 'lemon', match: /decisi|decided|chosen|elegid/ },
  { key: 'conventions', label: 'Conventions', hint: 'How things are done here.', tone: 'sky', match: /convention|convenci|rules?\b|reglas?|style|estilo|how we|criterio/ },
  { key: 'issues', label: 'Known issues', hint: 'What breaks, and the way around it.', tone: 'coral', match: /issue|problem|gotcha|bug|pitfall|caveat|known|incidenc|problema|error|riesgo|risk/ },
  { key: 'files', label: 'Key files', hint: 'Where things live.', tone: 'mint', match: /\bfiles?\b|ficheros?|archivos?|paths?\b|rutas?|where things/ },
  { key: 'findings', label: 'Findings', hint: 'What was found out.', tone: 'lemon', match: /finding|hallazgo|result|resultado|conclusi|learned|aprendid|facts?\b|hechos?|datos clave/ },
  { key: 'sources', label: 'Sources', hint: 'Where it comes from, and how reliable it is.', tone: 'sky', match: /source|fuente|reference|referencia|bibliograf|links?\b|enlaces?/ },
  { key: 'glossary', label: 'Glossary', hint: 'Terms and names, and what they mean here.', tone: 'mint', match: /glossar|glosario|terms?\b|términos?|terminolog|names?\b|nombres?/ },
  { key: 'datasets', label: 'Datasets', hint: 'What data exists, where, and its shape.', tone: 'mint', match: /dataset|datos\b|data sources?|tablas?|tables?|schema|esquema/ },
  { key: 'metrics', label: 'Metrics', hint: 'How things are measured.', tone: 'lemon', match: /metric|métrica|kpi|measure|medida/ },
  { key: 'assumptions', label: 'Assumptions', hint: 'What is taken as true for now.', tone: 'sky', match: /assum|supuesto|hipótesis|hypothes/ },
  { key: 'services', label: 'Services', hint: 'What runs, where, and who owns it.', tone: 'mint', match: /service|servicio|systems?\b|sistemas?|infra|environments?|entornos?/ },
  { key: 'runbooks', label: 'Runbooks', hint: 'How to do the routine and the urgent.', tone: 'sky', match: /runbook|procedimiento|procedure|how to|cómo|playbook/ },
  { key: 'incidents', label: 'Incidents', hint: 'What went wrong, and what was done.', tone: 'coral', match: /incident|outage|caída|postmortem|post-mortem/ },
  { key: 'audience', label: 'Audience and tone', hint: 'Who it is for and how it should sound.', tone: 'sky', match: /audience|audiencia|público|tone|tono|voice|voz/ },
  { key: 'questions', label: 'Open questions', hint: 'Still to be decided or found out.', tone: 'lilac', match: /question|pregunta|todo|pending|pendiente|open\b|abiert/ },
  { key: 'notes', label: 'Other notes', hint: 'Everything else agents wrote down.', tone: 'cream', match: /\blog\b|notes?\b|notas?|history|historial|diario|misc/ }
];
const BY_KEY = new Map(SECTIONS.map((s) => [s.key, s]));

/** The sections each kind of project is seeded with, in order. */
export const PROJECT_SECTIONS: Record<ProjectType, string[]> = {
  code: ['decisions', 'conventions', 'issues', 'files', 'questions', 'notes'],
  data: ['datasets', 'metrics', 'assumptions', 'issues', 'questions', 'notes'],
  infra: ['services', 'runbooks', 'incidents', 'decisions', 'questions', 'notes'],
  docs: ['audience', 'conventions', 'decisions', 'sources', 'questions', 'notes'],
  research: ['findings', 'sources', 'glossary', 'decisions', 'questions', 'notes']
};

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  code: 'software', data: 'data', infra: 'infrastructure', docs: 'writing', research: 'research'
};

/** Guess a project's type from the names of its top-level (and one level down) entries. */
export function detectProjectType(names: string[]): ProjectType {
  const n = names.map((x) => x.toLowerCase());
  const has = (re: RegExp) => n.some((x) => re.test(x));
  const count = (re: RegExp) => n.filter((x) => re.test(x)).length;
  if (has(/^(main|variables|outputs)\.tf$|\.tf$|^terraform|^helm|^k8s$|^kubernetes|^ansible|^docker-compose\.ya?ml$|^chart\.ya?ml$/)) return 'infra';
  if (count(/\.ipynb$/) > 0 || count(/\.(csv|parquet|xlsx?)$/) >= 2 || has(/^dbt_project\.ya?ml$/)) return 'data';
  if (has(/^(package\.json|pyproject\.toml|setup\.py|requirements\.txt|go\.mod|cargo\.toml|pom\.xml|build\.gradle|gemfile|composer\.json|.*\.csproj|.*\.sln|makefile|cmakelists\.txt)$/)) return 'code';
  const md = count(/\.(md|mdx|txt|docx?|rst)$/);
  if (md >= 3 && md >= n.length / 2) return 'docs';
  return 'research';
}

/** The section a heading names, or null. */
export function sectionForHeading(heading: string): string | null {
  const h = heading.toLowerCase();
  for (const s of SECTIONS) if (s.match.test(h)) return s.key;
  return null;
}

/** A section's label, hint and tone; an unknown key (a heading nobody
 *  planned for) gets its own label and a neutral look. */
export function sectionDef(key: string): SectionDef {
  const s = BY_KEY.get(key);
  if (s) return { key: s.key, label: s.label, hint: s.hint, tone: s.tone };
  return { key, label: key.replace(/^h:/, ''), hint: '', tone: 'cream' };
}

export function memoryTemplate(name: string, id: string, type: ProjectType = 'code'): string {
  return [
    `# Memory — ${name} (${id})`,
    '',
    '_Durable knowledge, one dated bullet each, under the heading it belongs to. Correct or remove a bullet when it stops being true._',
    '',
    ...PROJECT_SECTIONS[type].flatMap((k) => [`## ${k === 'notes' ? 'Log' : sectionDef(k).label}`, ''])
  ].join('\n');
}

/** How an agent is told to write its memory, for its project's type. */
export function memoryInstruction(type: ProjectType): string {
  const list = PROJECT_SECTIONS[type].filter((k) => k !== 'notes').map((k) => `${sectionDef(k).label} (${sectionDef(k).hint.replace(/\.$/, '').toLowerCase()})`);
  return `under the heading it belongs to: ${list.join(', ')}; anything else under Log. Another heading is fine when none fits`;
}

export interface MemoryEntry {
  /** Section key: a known one, or "h:<Heading>" for a heading nobody planned for. */
  section: string;
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
  let section = 'notes';
  let headingDate: string | undefined;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const t = line.trim();
    if (!t || /^_.*_$/.test(t) || /^# /.test(t)) continue;
    const head = /^#{2,6}\s+(.*)$/.exec(t);
    if (head) {
      const title = head[1].trim();
      headingDate = DATE.exec(title)?.[1];
      const known = sectionForHeading(title);
      // "## 2026-10-05 — Task: …" is a dated log entry, not a section.
      section = known ?? (headingDate ? 'notes' : `h:${title.replace(/[:.]\s*$/, '')}`);
      continue;
    }
    const bullet = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    let text = (bullet ? bullet[1] : t).trim();
    if (text.length < 4) continue;
    const d = DATE.exec(text);
    const date = d?.[1] ?? headingDate;
    if (d) text = text.slice(d[0].length).trim();
    // A bullet can name its own kind: "Decision: …", "Gotcha: …".
    const tag = /^(decision|decisión|convention|convención|rule|regla|gotcha|issue|problema|file|fichero|question|pregunta|finding|hallazgo|source|fuente|assumption|supuesto|incident|incidente)\s*:\s*/i.exec(text);
    const own = tag ? sectionForHeading(tag[1]) : null;
    if (tag) text = text.slice(tag[0].length);
    out.push({ section: own ?? section, text, date, line });
  }
  return out;
}

/** Order sections for display: the project type's own first, then the rest
 *  (known ones in catalogue order, then headings nobody planned for). */
export function orderSections(keys: string[], type: ProjectType | null): string[] {
  const seeded = type ? PROJECT_SECTIONS[type] : [];
  const known = SECTIONS.map((s) => s.key);
  const rank = (k: string) => {
    const i = seeded.indexOf(k);
    if (i >= 0) return i;
    const j = known.indexOf(k);
    return j >= 0 ? 100 + j : 1000;
  };
  return [...new Set(keys)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** A file path mentioned in an entry (for "Key files"). */
export function filePathIn(text: string): string | null {
  const m = /`([^`\s]+\.[A-Za-z0-9]{1,6})`|(?:^|\s)((?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]{1,6})\b/.exec(text);
  return m ? (m[1] ?? m[2]) : null;
}
