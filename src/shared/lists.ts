/**
 * Lists the human keeps, with the office's help: the figures they own and the
 * ones they want, books to read, things to buy… One markdown file per list in
 * hive/lists/: a title, then one section per state ("Have", "Want"), each a
 * checklist. People edit them in Memory → Lists; agents keep them up to date
 * when told ("I bought the Death Guard box"), and they are mined into the
 * office memory like everything else.
 */

export interface ListItem { text: string; done: boolean; note?: string }
export interface ListSection { name: string; items: ListItem[] }
export interface PersonalList { slug: string; title: string; sections: ListSection[] }

export function slugify(title: string): string {
  return title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'list';
}

/** Read a list file. Items are "- [ ] text — note" (the box and note optional). */
export function parseList(slug: string, md: string): PersonalList {
  let title = slug;
  const sections: ListSection[] = [];
  let cur: ListSection | null = null;
  for (const raw of md.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t || /^_.*_$/.test(t)) continue;
    const h1 = /^#\s+(.*)$/.exec(t);
    if (h1) { title = h1[1].trim(); continue; }
    const h = /^#{2,6}\s+(.*)$/.exec(t);
    if (h) { cur = { name: h[1].trim(), items: [] }; sections.push(cur); continue; }
    const m = /^[-*+]\s+(?:\[( |x|X)\]\s+)?(.*)$/.exec(t);
    if (!m) continue;
    if (!cur) { cur = { name: 'Items', items: [] }; sections.push(cur); }
    const [text, ...note] = m[2].split(/\s+[—–]\s+/);
    cur.items.push({ text: text.trim(), done: !!m[1] && m[1] !== ' ', ...(note.length ? { note: note.join(' — ').trim() } : {}) });
  }
  return { slug, title, sections };
}

export function formatList(l: PersonalList): string {
  const out = [`# ${l.title}`, '', '_A list the human keeps: one section per state, one item per line. Agents update it when told._', ''];
  for (const s of l.sections) {
    out.push(`## ${s.name}`, '');
    for (const i of s.items) out.push(`- [${i.done ? 'x' : ' '}] ${i.text}${i.note ? ` — ${i.note}` : ''}`);
    out.push('');
  }
  return out.join('\n');
}

/** Move an item (by its text) to another section, keeping its note. */
export function moveItem(l: PersonalList, text: string, to: string): PersonalList {
  let item: ListItem | undefined;
  const sections = l.sections.map((s) => ({ ...s, items: s.items.filter((i) => (i.text === text ? ((item = i), false) : true)) }));
  if (!item) return l;
  const target = sections.find((s) => s.name === to) ?? (sections.push({ name: to, items: [] }), sections[sections.length - 1]);
  target.items.push(item);
  return { ...l, sections };
}

/** The instruction agents get about lists, naming the ones that exist. */
/** `tools`: the agent has the munder-lists MCP server (only Claude Code gets the office's MCP servers). */
export function listsInstruction(dir: string, existing: Array<Pick<PersonalList, 'slug' | 'title' | 'sections'>> = [], tools = true): string {
  const known = existing.length
    ? ` Lists that exist now: ${existing.map((l) => `${l.slug}.md ("${l.title}": ${l.sections.map((x) => x.name).join(' / ') || 'no sections'})`).join('; ')}.`
    : ' There are none yet.';
  return `LISTS: the human keeps personal lists in ${dir} — one markdown file per topic, one "## Section" per state (e.g. Have / Want), each item a "- [ ] text — optional note" line.${known} When the human tells you something that belongs in one (things they own, want, plan, like), ${tools ? 'use the munder-lists tools (lists_overview, list_add, list_move, list_create)' : 'edit the file in that folder'}: add the item, or move it between sections (bought → from Want to Have); look at what exists first and use the list that fits; only create a new file when none does. These lists are the one place for it: not your memory.md, and never Claude Code's own memory (~/.claude/projects/…/memory), which the office cannot see. Keep the human's wording; never delete an item they did not ask you to.`;
}
