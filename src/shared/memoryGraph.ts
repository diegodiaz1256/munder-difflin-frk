/**
 * What the office remembers, as a graph of concepts.
 *
 * Built from agents' memory.md files and the deliverables in research/: each
 * paragraph, bullet or table row is a note; the names that recur across notes
 * (factions, products, files, people…) are the concepts; two concepts that
 * appear in the same note are linked. Agents and documents hang off the
 * concepts they mention. Pure and language-agnostic enough for English and
 * Spanish notes; no model needed.
 */

export interface MemoryDoc {
  /** Stable id, e.g. "agent:god" or "doc:research/w40k-paletas.md". */
  id: string;
  kind: 'agent' | 'doc';
  /** Agent name or file name, for the UI. */
  label: string;
  /** For agent memories: the agent id. */
  agentId?: string;
  text: string;
}

export interface Concept { id: string; label: string; count: number }
export interface ConceptEdge { a: string; b: string; weight: number }
export interface MemoryNote { docId: string; text: string }

export interface ConceptGraph {
  concepts: Concept[];
  edges: ConceptEdge[];
  /** doc id → concept ids it mentions (agents and documents). */
  mentions: Record<string, string[]>;
  /** concept id → the notes it appears in (newest docs first, capped). */
  notes: Record<string, MemoryNote[]>;
}

/** Words that start sentences or headings and say nothing on their own. */
const STOP = new Set((
  'the this that these those there here what when where which who why how and or but for with from into onto ' +
  'a an of to in on at by is are was were be been it its as if then than also only not no yes all any each ' +
  'memory log rules notes note task tasks todo done wrote use used using see append durable facts decisions context below ' +
  'human worker workers agent agents god hive office floor board inbox outbox research deliverable deliverables ' +
  'el la los las un una unos unas de del al y o u e en con por para sin sobre que como cuando donde quien ' +
  'es son fue era ser está están tarea tareas entregable entregables notas nota fuentes fuente metodología ' +
  'alternativas resumen ver usar usa más menos muy cada todo todos toda todas otro otra otros otras ' +
  'eje ejes tabla puntuación justificación facción facciones raza razas color colores paleta paletas'
).split(/\s+/));

const PHRASE = /(?:\p{Lu}[\p{L}\p{N}'’-]*|\d+[\p{L}]+)(?:\s+(?:of|de|del|la|the|y|and)?\s*(?:\p{Lu}[\p{L}\p{N}'’-]*|\d+[\p{L}]+)){0,3}/gu;
const FILE = /\b[\w-]+\.(?:md|json|ts|tsx|py|txt)\b/g;

/** Split a document into notes: paragraphs, bullets, table rows, headings. */
export function splitNotes(text: string): string[] {
  const out: string[] = [];
  let buf: string[] = [];
  const flush = () => { const t = buf.join(' ').trim(); if (t.length > 3) out.push(t); buf = []; };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^([-*+]|\d+[.)]|#{1,6}|\|)\s?/.test(line)) { flush(); buf.push(line.replace(/^([-*+]|\d+[.)]|#{1,6})\s*/, '').replace(/\s*\|\s*/g, '; ').replace(/^;\s*|;\s*$/g, '')); flush(); continue; }
    buf.push(line);
  }
  flush();
  return out;
}

/** Candidate concepts in one note, keyed lower-case → as written. Single
 *  capitalised words count only when they are not the first word of the note
 *  or of a sentence (where capitals are grammar, not names). */
export function conceptsIn(note: string): Map<string, string> {
  const found = new Map<string, string>();
  const add = (label: string) => {
    const clean = label.replace(/[’']s$/, '').replace(/[-’']+$/, '').trim();
    const key = clean.toLowerCase();
    if (key.length < 3 || STOP.has(key) || /^\d+$/.test(key)) return;
    // Colour codes (C39E81, 231F) and ordinals (10ª) are not concepts.
    if (/^#?[0-9a-f]{3,8}$/i.test(key) && /\d/.test(key)) return;
    if (/^\d+[ªº°]$/.test(key)) return;
    if (!found.has(key)) found.set(key, clean);
  };
  for (const m of note.matchAll(PHRASE)) {
    const label = m[0].trim();
    const words = label.split(/\s+/);
    const at = m.index ?? 0;
    const before = note.slice(0, at).trimEnd();
    const sentenceStart = before === '' || /[.!?:;—–(]$/.test(before);
    if (words.length === 1) {
      if (sentenceStart && !/\d/.test(label)) continue;
      add(label);
    } else {
      // Drop a sentence-initial capital word ("Meta Death Guard" → "Death Guard").
      const ws = sentenceStart && words.length > 1 && STOP.has(words[0].toLowerCase()) ? words.slice(1) : words;
      while (ws.length && STOP.has(ws[ws.length - 1].toLowerCase())) ws.pop();
      if (ws.length) add(ws.join(' '));
    }
  }
  for (const m of note.matchAll(FILE)) add(m[0]);
  return found;
}

export function buildMemoryGraph(docs: MemoryDoc[], opts: { maxConcepts?: number; maxNotesPerConcept?: number } = {}): ConceptGraph {
  const maxConcepts = opts.maxConcepts ?? 45;
  const maxNotes = opts.maxNotesPerConcept ?? 12;
  const noteCount = new Map<string, number>();
  const labels = new Map<string, Map<string, number>>();
  const perNote: Array<{ docId: string; text: string; keys: string[] }> = [];
  for (const d of docs) {
    for (const n of splitNotes(d.text)) {
      const found = conceptsIn(n);
      const keys = [...found.keys()];
      perNote.push({ docId: d.id, text: n, keys });
      for (const [k, label] of found) {
        noteCount.set(k, (noteCount.get(k) ?? 0) + 1);
        const l = labels.get(k) ?? new Map<string, number>();
        l.set(label, (l.get(label) ?? 0) + 1);
        labels.set(k, l);
      }
    }
  }
  const minCount = noteCount.size > maxConcepts ? 2 : 1;
  const kept = [...noteCount.entries()]
    .filter(([, c]) => c >= minCount)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxConcepts);
  const keep = new Set(kept.map(([k]) => k));
  const concepts: Concept[] = kept.map(([k, count]) => {
    const best = [...(labels.get(k) ?? new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? k;
    return { id: k, label: best, count };
  });

  const pair = new Map<string, number>();
  const mentions: Record<string, Set<string>> = {};
  const notes: Record<string, MemoryNote[]> = {};
  for (const n of perNote) {
    const ks = n.keys.filter((k) => keep.has(k));
    for (const k of ks) {
      (mentions[n.docId] ??= new Set()).add(k);
      const list = (notes[k] ??= []);
      if (list.length < maxNotes) list.push({ docId: n.docId, text: n.text.slice(0, 400) });
    }
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const [a, b] = ks[i] < ks[j] ? [ks[i], ks[j]] : [ks[j], ks[i]];
      pair.set(`${a}\u0000${b}`, (pair.get(`${a}\u0000${b}`) ?? 0) + 1);
    }
  }
  // Each concept keeps its strongest few links, so the picture stays readable.
  const all = [...pair.entries()].map(([k, w]) => { const [a, b] = k.split('\u0000'); return { a, b, weight: w }; })
    .sort((x, y) => y.weight - x.weight);
  const degree = new Map<string, number>();
  const edges: ConceptEdge[] = [];
  for (const e of all) {
    if ((degree.get(e.a) ?? 0) >= 4 && (degree.get(e.b) ?? 0) >= 4) continue;
    edges.push(e);
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }
  return {
    concepts,
    edges,
    mentions: Object.fromEntries(Object.entries(mentions).map(([k, v]) => [k, [...v]])),
    notes
  };
}

/** One result of `mempalace search`'s text output. */
export interface PalaceHit { wing: string; room: string; source: string; score?: number; text: string }

/** Parse `mempalace search` output into results (it prints text, not JSON). */
export function parsePalaceSearch(out: string): PalaceHit[] {
  const hits: PalaceHit[] = [];
  const blocks = out.split(/\n\s*\[\d+\]\s+/).slice(1);
  for (const b of blocks) {
    const lines = b.split(/\r?\n/);
    const [wing, room] = (lines[0] ?? '').split('/').map((s) => s.trim());
    const source = /Source:\s*(.+)/.exec(b)?.[1]?.trim() ?? '';
    const cos = /cosine(?:_sim)?=([\d.]+)/.exec(b)?.[1];
    const body = lines.slice(1)
      .filter((l) => !/^\s*(Source:|Match:)/.test(l) && !/^\s*[-=]{8,}\s*$/.test(l))
      .map((l) => l.trim()).join('\n').trim();
    if (body) hits.push({ wing: wing ?? '', room: room ?? '', source, score: cos ? Number(cos) : undefined, text: body });
  }
  return hits;
}
