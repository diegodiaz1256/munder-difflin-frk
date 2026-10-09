/**
 * Entities in what the office wrote: the rows of the tables in agents'
 * deliverables. A research table of factions (popularity, difficulty…) and
 * another of their colour schemes become one profile per faction, each value
 * with the document it came from. No schema is declared anywhere: the first
 * column names the entity, the other columns are its attributes, and rows
 * whose other cells are empty group the rows under them ("Imperium").
 */

export interface EntityAttr { label: string; value: string; source: string }
export interface Entity {
  key: string;
  name: string;
  /** Other names it goes by: from tables ("Space Marines (Ultramarines)"),
   *  and from notes ("DG = Death Guard", "also called …"). */
  aliases: string[];
  /** The kind of thing, from the first column's header ("Facción", "Producto"). */
  kind: string;
  group?: string;
  attrs: EntityAttr[];
}

interface Table { headers: string[]; rows: string[][] }

const cells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const clean = (s: string): string => s.replace(/\*\*|__|`/g, '').replace(/\s*\[[\w\s,-]+\](?=\s|$|[.,;])/g, '').trim();

/** Markdown tables in `md`: header, separator, then rows. */
export function parseTables(md: string): Table[] {
  const out: Table[] = [];
  const lines = md.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/^\s*\|.*\|\s*$/.test(lines[i]) || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
    const headers = cells(lines[i]).map(clean);
    const rows: string[][] = [];
    let j = i + 2;
    for (; j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j]); j++) rows.push(cells(lines[j]));
    if (headers.length >= 2 && rows.length >= 2) out.push({ headers, rows });
    i = j - 1;
  }
  return out;
}

/** The key two spellings of one entity share: "Space Marines (genérico)"
 *  and "Space Marines (Ultramarines…)" are both "space marines". */
export function entityKey(name: string): string {
  return fold(clean(name).replace(/\s*\([^)]*\)\s*/g, ' ').replace(/[*_]/g, ''));
}

/** Lower case, no accents, single spaces, a trailing plural "s" dropped from
 *  each word: "Marines del Caos" and "marine del caos" meet. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    .split(' ').map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)).join(' ')
    .replace(/^(?:the|el|la|lo|lo|los|las|a|an|un|una) /, '');
}

/** Edit distance (insert, delete, substitute, swap neighbours). */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

/** Two folded names that differ only by typos: same number of words, each
 *  within one edit (two for words of five letters or more). */
export function closeSpelling(a: string, b: string): boolean {
  const wa = a.split(' '); const wb = b.split(' ');
  if (wa.length !== wb.length || a.length < 4) return false;
  return wa.every((w, i) => distance(w, wb[i]) <= (Math.max(w.length, wb[i].length) >= 5 ? 2 : w === wb[i] ? 0 : 1));
}

/** Similarity of two folded names, 0..1 (Dice coefficient on letter pairs). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const pairs = (x: string) => { const out = new Map<string, number>(); for (let i = 0; i < x.length - 1; i++) { const p = x.slice(i, i + 2); out.set(p, (out.get(p) ?? 0) + 1); } return out; };
  const pa = pairs(a); const pb = pairs(b);
  let inter = 0; let total = 0;
  for (const [p, n] of pa) { inter += Math.min(n, pb.get(p) ?? 0); total += n; }
  for (const n of pb.values()) total += n;
  return total ? (2 * inter) / total : 0;
}

/** Alias pairs written in notes: "DG = Death Guard", "Astartes (also called
 *  Space Marines)", "Nurgle marines, a.k.a. Death Guard", "X también llamado Y". */
export function aliasPairs(text: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const name = "([\\p{L}\\p{N}][\\p{L}\\p{N}' -]{1,40}?)";
  const res = [
    new RegExp(`${name}\\s*(?:=|≡)\\s*${name}(?=[.,;:)\\n]|$)`, 'gu'),
    new RegExp(`${name}\\s*,?\\s*\\(?\\s*(?:a\\.?k\\.?a\\.?|also (?:called|known as)|alias|también (?:llamad[oa]s?|conocid[oa]s? como)|conocid[oa]s? como)\\s+${name}(?=[.,;:)\\n]|$)`, 'giu')
  ];
  for (const re of res) for (const m of text.matchAll(re)) {
    const a = m[1].trim(); const b = m[2].trim();
    if (a && b && fold(a) !== fold(b)) out.push([a, b]);
  }
  return out;
}

/** Every entity in `docs`, attributes merged across documents. Entities that
 *  appear in only one small table still count; tables of fewer than three
 *  rows are left out as too thin to be a collection. */
export function buildEntities(docs: Array<{ label: string; text: string }>): Entity[] {
  const byKey = new Map<string, Entity>();
  /** The entity a name refers to: exact key, an alias, or a near spelling.
   *  Names with a number in them (tickets like ACME-101, versions) only
   *  match exactly: one digit apart is another ticket, not a typo. */
  const find = (n: string): Entity | undefined => {
    const k = entityKey(n);
    const hit = byKey.get(k);
    if (hit) return hit;
    for (const e of byKey.values()) if (e.aliases.some((a) => entityKey(a) === k)) return e;
    if (/\d/.test(k)) return undefined;
    for (const e of byKey.values()) if (!/\d/.test(e.key) && k.length >= 5 && (similarity(k, e.key) >= 0.86 || closeSpelling(k, e.key))) return e;
    return undefined;
  };
  for (const d of docs) {
    for (const t of parseTables(d.text)) {
      if (t.rows.length < 3) continue;
      // A numbered list of steps, a timeline or a table of measurements names
      // no things: its first column is mostly numbers, times or dates.
      const firsts = t.rows.map((r) => clean(r[0] ?? '')).filter(Boolean);
      if (firsts.filter((c) => /^[#\d\s.:,/\-–>+%()smhx]+$/i.test(c)).length > firsts.length / 2) continue;
      const kind = t.headers[0] || 'Item';
      let group: string | undefined;
      for (const r of t.rows) {
        const name = clean(r[0] ?? '');
        if (!name) continue;
        const rest = r.slice(1).map(clean);
        if (rest.every((c) => !c)) { group = name.replace(/\s*[—–-]\s*$/, ''); continue; }
        const key = entityKey(name);
        if (!key) continue;
        const paren = /\(([^)]+)\)/.exec(name)?.[1]?.split(/[,;/]/)[0]?.trim();
        const e = find(name) ?? { key, name: name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name, kind, group, aliases: [], attrs: [] };
        e.group ??= group;
        // "Space Marines (Ultramarines, …)": the first word in brackets names
        // a variant people also use for it — unless it is a qualifier.
        if (paren && paren.length < 40 && !/^(gen[eé]ric|general|todos?|all|aprox|approx|estimad|v\d)/i.test(paren) && !e.aliases.includes(paren)) e.aliases.push(paren);
        rest.forEach((v, i) => {
          const label = t.headers[i + 1];
          if (!v || !label || /^(fuentes?|sources?|refs?)$/i.test(label)) return;
          if (!e.attrs.some((a) => a.label === label && a.value === v)) e.attrs.push({ label, value: v, source: d.label });
        });
        byKey.set(key, e);
      }
    }
  }
  // Aliases written anywhere in the notes join the entity they name.
  for (const d of docs) {
    for (const [a, b] of aliasPairs(d.text)) {
      const e = find(a) ?? find(b);
      if (!e) continue;
      for (const n of [a, b]) if (entityKey(n) !== e.key && !e.aliases.some((x) => entityKey(x) === entityKey(n))) e.aliases.push(n);
    }
  }
  // One entity can sit under several keys (each spelling that found it): list it once.
  return [...new Set(byKey.values())].filter((e) => e.attrs.length > 0);
}

/** The entity a query names (its name, an alias, or close to either). */
export function matchEntity(entities: Entity[], query: string): Entity | undefined {
  const k = entityKey(query);
  if (!k) return undefined;
  return entities.find((e) => e.key === k || e.aliases.some((a) => entityKey(a) === k))
    ?? entities.find((e) => [e.key, ...e.aliases.map(entityKey)].some((n) => n.includes(k) && k.length >= 3))
    ?? entities.find((e) => [e.key, ...e.aliases.map(entityKey)].some((n) => closeSpelling(k, n)))
    ?? entities.map((e) => ({ e, s: Math.max(similarity(k, e.key), ...e.aliases.map((a) => similarity(k, entityKey(a)))) })).filter((x) => x.s >= 0.75).sort((a, b) => b.s - a.s)[0]?.e;
}

/** A 1–5 style score in a value ("4", "4/5", "3→2"), for a bar; else null. */
export function scoreOf(value: string): number | null {
  const m = /^\s*(\d(?:[.,]\d)?)\s*(?:\/\s*5|→\s*(\d))?\s*$/.exec(value);
  if (!m) return null;
  const n = Number((m[2] ?? m[1]).replace(',', '.'));
  return n >= 0 && n <= 5 ? n : null;
}
