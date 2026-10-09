import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Agent } from '@/store/store';
import { useStore } from '@/store/store';
import { buildMemoryGraph, conceptsIn, parsePalaceSearch, splitNotes, type MemoryDoc } from '@shared/memoryGraph';
import { parseMemory, orderSections, sectionDef, filePathIn, PROJECT_TYPE_LABEL, type MemoryEntry, type ProjectType } from '@shared/memorySections';
import { useProStore } from './proStore';
import { ConceptGraph } from './ConceptGraph';
import { EntitiesView } from './EntitiesView';
import { ListsView } from './ListsView';
import { buildEntities, matchEntity } from '@shared/memoryEntities';
import type { KeyedTask } from './data';

type CorpusDoc = MemoryDoc & { project: string; projectType?: string };

interface Hit {
  title: string;
  body?: string;
  /** Who or where it comes from. */
  source: string;
  when?: string;
  section?: string;
  /** How search got here: what matched, where it lives, the file it came from. */
  path?: string[];
  /** The memory document it came from, to light it up on the map. */
  docId?: string;
}

/** A section's colour, from its tone (design tokens only). */
const toneVar = (tone: string) => (tone === 'cream' ? 'var(--cth-cream-200)' : `var(--cth-${tone}-light)`);

function words(q: string): string[] {
  return q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
}
function score(text: string, ws: string[]): number {
  if (!ws.length) return 0;
  const t = text.toLowerCase();
  return ws.filter((w) => t.includes(w)).length / ws.length;
}
/** First sentence as a title, the rest as its body. */
function titled(text: string): { title: string; body?: string } {
  const clean = text.replace(/^[#>*\-\s]+/, '').trim();
  const cut = clean.search(/(?<=[.!?])\s|\n/);
  if (cut > 20 && cut < 160) return { title: clean.slice(0, cut).trim(), body: clean.slice(cut).trim() || undefined };
  return clean.length > 160 ? { title: `${clean.slice(0, 157)}…`, body: clean } : { title: clean };
}

interface Entry extends MemoryEntry { agent: string; agentId?: string; project: string }

/** The same note written by several agents ("joined the demo office.") shows
 *  once, with everyone who wrote it and the latest date. */
interface Grouped { text: string; section: string; agents: string[]; date?: string }
function groupSame(entries: Entry[]): Grouped[] {
  const by = new Map<string, Grouped>();
  for (const e of entries) {
    const key = `${e.section}\u0000${e.text.trim().toLowerCase().replace(/\s+/g, ' ')}`;
    const g = by.get(key);
    if (!g) { by.set(key, { text: e.text, section: e.section, agents: [e.agent], date: e.date }); continue; }
    if (!g.agents.includes(e.agent)) g.agents.push(e.agent);
    if ((e.date ?? '') > (g.date ?? '')) g.date = e.date;
  }
  return [...by.values()];
}
/** "Angela" · "Angela, Dwight" · "Angela, Dwight +4". */
function whoWrote(agents: string[]): string {
  return agents.length <= 2 ? agents.join(', ') : `${agents.slice(0, 2).join(', ')} +${agents.length - 2}`;
}

/**
 * Memory — what the office knows, for two kinds of use.
 *
 * - Whole office (someone running Claude for everything): the map of what the
 *   team knows, what it learned lately, and search across all of it.
 * - One project (a technical user on one repo): that project's memory,
 *   sorted into decisions, conventions, known issues, key files and open
 *   questions (shared/memorySections.ts), from the agents working on it.
 */
export function MemoryView({ tasks, roster }: { tasks: KeyedTask[]; roster: Agent[] }) {
  const { t: tr } = useTranslation();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [semantic, setSemantic] = useState<boolean | null>(null);
  const [docs, setDocs] = useState<CorpusDoc[]>([]);
  const [scope, setScope] = useState<string>('office');
  const [concept, setConcept] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  /** Whole-office view: what the office knows by section, the concept map, or the entities in the deliverables. */
  const [tab, setTab] = useState<'overview' | 'map' | 'entities'>('overview');
  /** Why search by meaning failed on the last search, shown quietly in the header. */
  const [meaningError, setMeaningError] = useState<string | null>(null);
  const [focusEntity, setFocusEntity] = useState<string | null>(null);
  const setView = useProStore((s) => s.setView);
  const openAgent = useCallback((id: string) => { useStore.getState().select(id); setView({ kind: 'agent', agentId: id }); }, [setView]);

  const loadCorpus = useCallback(() => {
    void window.cth.hiveMemoryCorpus().then((d) => setDocs(d as CorpusDoc[])).catch(() => {});
  }, []);
  useEffect(() => {
    window.cth.memoryStatus().then((s) => setSemantic(s.active && (s as { modelReady?: boolean }).modelReady !== false)).catch(() => setSemantic(false));
    loadCorpus();
    const id = setInterval(loadCorpus, 30_000);
    return () => clearInterval(id);
  }, [loadCorpus]);

  // Every agent memory, sorted into entries with their project.
  const entries: Entry[] = useMemo(() => docs.filter((d) => d.kind === 'agent').flatMap((d) =>
    parseMemory(d.text).map((e) => ({ ...e, agent: d.label, agentId: d.agentId, project: d.project }))), [docs]);
  const projects = useMemo(() => {
    const count = new Map<string, number>();
    for (const e of entries) if (e.project !== 'office') count.set(e.project, (count.get(e.project) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);
  const inScope = (p: string) => scope === 'office' || p === scope;
  const scopedDocs = useMemo(() => docs.filter((d) => scope === 'office' || d.project === scope), [docs, scope]);
  const graph = useMemo(() => buildMemoryGraph(scopedDocs), [scopedDocs]);
  const entities = useMemo(() => buildEntities(scopedDocs), [scopedDocs]);
  // A search's path on the map: the concepts the query and its results go
  // through, and the agents and documents the results came from.
  const [hoverHit, setHoverHit] = useState<Hit | null>(null);
  const trail = useMemo(() => {
    if (!hits) return null;
    // Pointing at one result shows that result's path alone.
    const shown = hoverHit ? [hoverHit] : hits;
    const ids = new Set(graph.concepts.map((c) => c.id));
    const out = new Set<string>();
    const ws = words(q);
    for (const c of graph.concepts) if (ws.some((w) => c.id.includes(w))) out.add(`c:${c.id}`);
    for (const h of shown) {
      for (const k of conceptsIn(`${h.title} ${h.body ?? ''}`).keys()) if (ids.has(k)) out.add(`c:${k}`);
      if (h.docId) out.add(`d:${h.docId}`);
    }
    return out;
  }, [hits, hoverHit, graph, q]);
  const notesFor = useCallback((key: string) => {
    const words = key.split(' ');
    const out: Array<{ docId: string; text: string; source: string }> = [];
    for (const d of scopedDocs) {
      if (d.kind !== 'agent') continue;
      for (const n of splitNotes(d.text)) if (words.every((w) => n.toLowerCase().includes(w))) out.push({ docId: d.id, text: n, source: d.label });
    }
    return out;
  }, [scopedDocs]);

  const run = async () => {
    const query = q.trim();
    setConcept(null);
    if (!query) { setHits(null); return; }
    // A search that names an entity (by name, alias or close spelling) opens it.
    const named = matchEntity(entities, query);
    if (named) { setFocusEntity(named.key); setTab('entities'); setHits(null); if (scope !== 'office' && !scopedDocs.some(() => true)) setScope('office'); return; }
    setBusy(true);
    const ws = words(query);
    const out: Hit[] = [];
    const matched = (text: string) => tr('pro.memory.pathWords', { words: ws.filter((w) => text.toLowerCase().includes(w)).join(', ') });
    const sectionName = (s: string) => tr(`pro.memory.section.${sectionDef(s).key}`, { defaultValue: sectionDef(s).label });
    for (const e of entries) if (inScope(e.project) && score(e.text, ws) >= 0.6) {
      out.push({ ...titled(e.text), source: e.agent, when: e.date, section: e.section, docId: e.agentId ? `agent:${e.agentId}` : undefined,
        path: [matched(e.text), tr('pro.memory.pathMemory', { agent: e.agent, section: sectionName(e.section) }), ...(e.agentId ? [`agents/${e.agentId}/memory.md`] : [])] });
    }
    for (const d of scopedDocs) if (d.kind === 'doc') for (const n of splitNotes(d.text)) if (n.length > 8 && score(n, ws) >= 0.6) {
      out.push({ ...titled(n), source: d.label, docId: d.id, path: [matched(n), tr('pro.memory.pathDoc'), d.id.replace(/^doc:/, '')] });
    }
    for (const t of tasks) {
      const text = `${t.key ?? ''} ${t.title} ${t.description ?? ''}`;
      if (score(text, ws) >= 0.5) out.push({ title: `${t.key ? `${t.key} ` : ''}${t.title}`, source: tr('pro.memory.ticket', { status: tr(`pro.tasks.col_${t.status}`) }),
        path: [matched(text), tr('pro.memory.pathTicket', { status: tr(`pro.tasks.col_${t.status}`) })] });
    }
    if (semantic) {
      const palace = await window.cth.searchMemory(query).catch(() => null);
      if (palace?.ok) {
        setMeaningError(null);
        for (const h of parsePalaceSearch(palace.output).slice(0, 6)) {
          const who = roster.find((a) => a.id === h.wing)?.name ?? h.wing;
          if (!out.some((o) => h.text.includes(o.title.slice(0, 40)))) {
            const doc = docs.find((d) => d.id === `agent:${h.wing}`) ?? docs.find((d) => d.kind === 'doc' && h.source && d.label === h.source);
            out.push({ ...titled(h.text), source: `${who}${h.source ? ` · ${h.source}` : ''} · ${tr('pro.memory.byMeaning')}`, docId: doc?.id,
              path: [tr('pro.memory.pathMeaning', { score: h.score != null ? h.score.toFixed(2) : '–' }), who, ...(h.source ? [h.room ? `${h.room} › ${h.source}` : h.source] : [])] });
          }
        }
      } else {
        // Not a result: the exact matches above still stand, and the header says meaning search is off for now.
        setMeaningError(palace?.error || tr('pro.memory.meaningUnavailable'));
      }
    }
    setHits(out.slice(0, 60));
    setBusy(false);
  };

  // A concept picked on the map: its notes.
  const conceptHits: Hit[] | null = concept
    ? (graph.notes[concept] ?? []).map((n) => ({ ...titled(n.text), source: scopedDocs.find((d) => d.id === n.docId)?.label ?? n.docId }))
    : null;
  const recent = groupSame(entries.filter((e) => inScope(e.project) && e.date)).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 25);
  const sideHits: Hit[] = conceptHits ?? hits ?? recent.map((e) => ({ ...titled(e.text), source: whoWrote(e.agents), when: e.date, section: e.section }));
  const sideTitle = conceptHits ? tr('pro.memory.notesAbout', { name: graph.concepts.find((c) => c.id === concept)?.label ?? '' }) : hits ? tr('pro.memory.resultsFor', { q: q.trim() }) : tr('pro.memory.recent');

  const projectEntries = entries.filter((e) => e.project === scope);

  return (
    <div className="pro-page">
      <div className="pro-head">
        <h2>{tr('pro.nav.memory')}</h2>
        <span className="pro-sub" title={meaningError ?? undefined}>{meaningError ? tr('pro.memory.meaningDown') : semantic ? tr('pro.memory.meaningOn') : semantic === false ? tr('pro.memory.exactSearch') : ''}</span>
        <div className="pro-head-end" style={{ flex: '1 1 280px', maxWidth: 440 }}>
          <input className="pro-input" style={{ flex: 1 }} placeholder={scope === 'office' || scope === '__lists' ? tr('pro.memory.searchOffice') : tr('pro.memory.searchIn', { scope })}
            value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value.trim()) setHits(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void run(); }} />
          <button className="pro-btn" onClick={() => void run()} disabled={busy}>{busy ? tr('pro.memory.searching') : tr('pro.memory.search')}</button>
        </div>
      </div>

      <div className="pro-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button className={`pro-chip${scope === 'office' ? ' pro-chip-on' : ''}`} onClick={() => { setScope('office'); setConcept(null); }}>{tr('pro.memory.wholeOffice')}</button>
        <button className={`pro-chip${scope === '__lists' ? ' pro-chip-on' : ''}`} onClick={() => { setScope('__lists'); setConcept(null); setHits(null); }}>{tr('pro.memory.lists')}</button>
        {projects.filter(([p]) => p !== '__lists').map(([p, n]) => (
          <button key={p} className={`pro-chip${scope === p ? ' pro-chip-on' : ''}`} onClick={() => { setScope(p); setConcept(null); setHits(null); }}>{p} <span className="pro-sub">{n}</span></button>
        ))}
        {projects.length === 0 && <span className="pro-sub" style={{ fontSize: 12 }}>{tr('pro.memory.projectsHint')}</span>}
        {scope === '__lists' ? null : scope !== 'office' ? (
          <button className="pro-btn" style={{ marginInlineStart: 'auto' }} onClick={() => setShowMap((v) => !v)}>{showMap ? tr('pro.memory.hideMap') : tr('pro.memory.map')}</button>
        ) : (
          <div className="pro-switch" role="group" aria-label={tr('pro.memory.view')} style={{ marginInlineStart: 'auto' }}>
            <button aria-pressed={tab === 'overview'} onClick={() => { setTab('overview'); setConcept(null); }}>{tr('pro.memory.overview')}</button>
            <button aria-pressed={tab === 'map'} onClick={() => setTab('map')}>{tr('pro.memory.map')}</button>
            {entities.length > 0 && <button aria-pressed={tab === 'entities'} onClick={() => setTab('entities')}>{tr(entities.length === 1 ? 'pro.memory.entity' : 'pro.memory.entities', { count: entities.length })}</button>}
          </div>
        )}
      </div>

      {scope === '__lists' ? (
        <ListsView />
      ) : tab === 'entities' && !hits && entities.length > 0 && (scope === 'office' || focusEntity) ? (
        <EntitiesView entities={entities} notesFor={notesFor} focus={focusEntity} />
      ) : scope !== 'office' && !hits && !showMap ? (
        <ProjectMemory project={scope} type={(docs.find((d) => d.project === scope)?.projectType as ProjectType | undefined) ?? null} entries={projectEntries} roster={roster} onOpenAgent={openAgent} />
      ) : scope === 'office' && tab === 'overview' && !hits ? (
        <ProjectMemory project="office" type={null} entries={entries} roster={roster} onOpenAgent={openAgent} />
      ) : hits && !(scope === 'office' ? tab === 'map' : showMap) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="pro-row">
            <div className="pro-sub" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>{sideTitle}</div>
            <button className="pro-btn" style={{ marginInlineStart: 'auto', fontSize: 11 }} onClick={() => (scope === 'office' ? setTab('map') : setShowMap(true))}>{tr('pro.memory.showOnMap')}</button>
            <button className="pro-btn" style={{ fontSize: 11 }} onClick={() => { setHits(null); setQ(''); }}>{tr('common.back')}</button>
          </div>
          {hits.length === 0 && <p className="pro-sub">{tr('pro.memory.nothingFound')}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8, alignItems: 'start' }}>
            {hits.map((h, i) => <NoteCard key={`${sideTitle}-${i}`} hit={h} />)}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 460, display: 'flex', gap: 12 }}>
          <div className="pro-card pro-embed" style={{ padding: 0, overflow: 'hidden', minWidth: 0, flex: 1 }}>
            <ConceptGraph graph={graph} docs={scopedDocs} selected={concept} onSelect={setConcept} trail={trail} />
          </div>
          <aside style={{ width: 330, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
            <div className="pro-row">
              <div className="pro-sub" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>{sideTitle}</div>
              {(concept || hits) && <button className="pro-btn" style={{ marginInlineStart: 'auto', fontSize: 11 }} onClick={() => { setConcept(null); setHits(null); setQ(''); }}>{tr('common.back')}</button>}
            </div>
            {sideHits.length === 0 && (
              <p className="pro-sub">{hits ? tr('pro.memory.nothingFound') : tr('pro.memory.nothingDated')}</p>
            )}
            {sideHits.map((h, i) => <NoteCard key={`${sideTitle}-${i}`} hit={h} onHover={hits ? (on) => setHoverHit(on ? h : null) : undefined} />)}
          </aside>
        </div>
      )}
      <span className="pro-sub" style={{ fontSize: 11 }}>
        {tr('pro.memory.counts', { agents: docs.filter((d) => d.kind === 'agent').length, docs: docs.filter((d) => d.kind === 'doc').length, notes: entries.length })}
      </span>
    </div>
  );
}

/** One note: its first sentence, the rest on demand. */
function NoteCard({ hit, onHover }: { hit: Hit; onHover?: (on: boolean) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <button className="pro-card" onClick={() => setOpen((v) => !v)} aria-expanded={open}
      onMouseEnter={onHover && (() => onHover(true))} onMouseLeave={onHover && (() => onHover(false))}
      onFocus={onHover && (() => onHover(true))} onBlur={onHover && (() => onHover(false))}
      style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'start', flexShrink: 0 }}>
      <strong style={{ fontSize: 13, lineHeight: 1.35, fontWeight: 600 }}>{hit.title}</strong>
      {hit.body && (
        <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--cth-ink-700)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
          ...(open ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }) }}>{hit.body}</span>
      )}
      <span className="pro-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {hit.section && <span className="pro-badge" style={{ background: toneVar(sectionDef(hit.section).tone), fontSize: 10 }}>{t(`pro.memory.section.${sectionDef(hit.section).key}`, { defaultValue: sectionDef(hit.section).label })}</span>}
        <span className="pro-sub" style={{ fontSize: 11 }}>{hit.source}{hit.when ? ` · ${hit.when}` : ''}</span>
      </span>
      {hit.path && hit.path.length > 0 && (
        <span className="pro-mono pro-sub" title={t('pro.memory.pathTitle')} style={{ fontSize: 10, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
          {hit.path.map((step, i) => <span key={i}>{i > 0 && <span aria-hidden> → </span>}{step}</span>)}
        </span>
      )}
    </button>
  );
}

/** Inline `code` in a note, shown as code. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return <>{parts.map((p, i) => (p.startsWith('`') && p.endsWith('`') && p.length > 2
    ? <code key={i} className="pro-mono" style={{ fontSize: '0.92em', background: 'var(--cth-cream-200)', padding: '0 3px' }}>{p.slice(1, -1)}</code>
    : <span key={i}>{p}</span>))}</>;
}

/** "demo-shop: orders are…" → "orders are…" inside demo-shop's own view. */
function withoutProject(text: string, project: string): string {
  const prefix = text.slice(0, project.length + 3);
  if (!prefix.toLowerCase().startsWith(project.toLowerCase())) return text;
  const rest = text.slice(project.length);
  const m = /^\s*[:—–-]\s*/.exec(rest);
  return m ? rest.slice(m[0].length) : text;
}

/** A project's memory, by section: what a technical user needs to trust. */
function ProjectMemory({ project, type, entries, roster, onOpenAgent }: {
  project: string; type: ProjectType | null; entries: Entry[]; roster: Agent[]; onOpenAgent: (id: string) => void;
}) {
  const { t } = useTranslation();
  const by = new Map<string, Grouped[]>();
  for (const g of groupSame(entries)) by.set(g.section, [...(by.get(g.section) ?? []), g]);
  const agents = [...new Map(entries.filter((e) => e.agentId).map((e) => [e.agentId!, e.agent])).entries()];
  if (!entries.length) return <p className="pro-sub">{t('pro.memory.nothingFor', { project })}</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="pro-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {type && <span className="pro-badge" style={{ background: 'var(--cth-cream-200)' }}>{t('pro.memory.projectType', { type: t(`pro.memory.type.${type}`, { defaultValue: PROJECT_TYPE_LABEL[type] }) })}</span>}
        <span className="pro-sub" style={{ fontSize: 12 }}>{t('pro.memory.from')}</span>
        {agents.map(([id, name]) => (
          <button key={id} className="pro-chip" onClick={() => onOpenAgent(id)} disabled={!roster.some((a) => a.id === id)}>{name}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12, alignItems: 'start' }}>
        {orderSections([...by.keys()], type).map((s) => (
          <section key={s} className="pro-card" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--pro-line)', background: toneVar(sectionDef(s).tone) }}>
              <strong style={{ fontSize: 13 }}>{t(`pro.memory.section.${sectionDef(s).key}`, { defaultValue: sectionDef(s).label })}</strong>
              {sectionDef(s).hint && <span className="pro-sub" style={{ fontSize: 11, marginInlineStart: 8 }}>{t(`pro.memory.hint.${sectionDef(s).key}`, { defaultValue: sectionDef(s).hint })}</span>}
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {(by.get(s) ?? []).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).map((e, i) => {
                const file = s === 'files' ? filePathIn(e.text) : null;
                return (
                  <li key={i} style={{ padding: '8px 12px', borderTop: i ? '1px solid var(--pro-line)' : undefined, fontSize: 13, lineHeight: 1.45 }}>
                    {file ? <><code className="pro-mono" style={{ fontSize: 12 }}>{file}</code> <Rich text={withoutProject(e.text, project).replace(/`[^`]+`/, '').replace(/^\s*[—–-]\s*/, '')} /></> : <Rich text={withoutProject(e.text, project)} />}
                    <div className="pro-sub" style={{ fontSize: 11 }} title={e.agents.length > 2 ? e.agents.join(', ') : undefined}>{whoWrote(e.agents)}{e.date ? ` · ${e.date}` : ''}</div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
