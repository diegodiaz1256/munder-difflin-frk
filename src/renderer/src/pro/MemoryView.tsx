import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Agent } from '@/store/store';
import { useStore } from '@/store/store';
import { buildMemoryGraph, parsePalaceSearch, splitNotes, type MemoryDoc } from '@shared/memoryGraph';
import { parseMemory, SECTION_ORDER, filePathIn, type MemoryEntry, type MemorySection } from '@shared/memorySections';
import { useProStore } from './proStore';
import { ConceptGraph } from './ConceptGraph';
import type { KeyedTask } from './data';

type CorpusDoc = MemoryDoc & { project: string };

interface Hit {
  title: string;
  body?: string;
  /** Who or where it comes from. */
  source: string;
  when?: string;
  section?: MemorySection;
}

const SECTION_LABEL: Record<MemorySection, string> = {
  decisions: 'Decisions',
  conventions: 'Conventions',
  issues: 'Known issues',
  files: 'Key files',
  questions: 'Open questions',
  notes: 'Other notes'
};
const SECTION_HINT: Record<MemorySection, string> = {
  decisions: 'What was chosen, and why.',
  conventions: 'How things are done here.',
  issues: 'What breaks, and the way around it.',
  files: 'Where things live.',
  questions: 'Still to be decided or found out.',
  notes: 'Everything else agents wrote down.'
};
const SECTION_TONE: Record<MemorySection, string> = {
  decisions: 'var(--cth-lemon-light)',
  conventions: 'var(--cth-sky-light)',
  issues: 'var(--cth-coral-light)',
  files: 'var(--cth-mint-light)',
  questions: 'var(--cth-lilac-light)',
  notes: 'var(--cth-cream-200)'
};

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
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [semantic, setSemantic] = useState<boolean | null>(null);
  const [docs, setDocs] = useState<CorpusDoc[]>([]);
  const [scope, setScope] = useState<string>('office');
  const [concept, setConcept] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
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

  const run = async () => {
    const query = q.trim();
    setConcept(null);
    if (!query) { setHits(null); return; }
    setBusy(true);
    const ws = words(query);
    const out: Hit[] = [];
    for (const e of entries) if (inScope(e.project) && score(e.text, ws) >= 0.6) out.push({ ...titled(e.text), source: e.agent, when: e.date, section: e.section });
    for (const d of scopedDocs) if (d.kind === 'doc') for (const n of splitNotes(d.text)) if (n.length > 8 && score(n, ws) >= 0.6) out.push({ ...titled(n), source: d.label });
    for (const t of tasks) if (score(`${t.key ?? ''} ${t.title} ${t.description ?? ''}`, ws) >= 0.5) out.push({ title: `${t.key ? `${t.key} ` : ''}${t.title}`, source: `ticket · ${t.status}` });
    if (semantic) {
      const palace = await window.cth.searchMemory(query).catch(() => null);
      if (palace?.ok) {
        for (const h of parsePalaceSearch(palace.output).slice(0, 6)) {
          const who = roster.find((a) => a.id === h.wing)?.name ?? h.wing;
          if (!out.some((o) => h.text.includes(o.title.slice(0, 40)))) out.push({ ...titled(h.text), source: `${who}${h.source ? ` · ${h.source}` : ''} · by meaning` });
        }
      } else if (palace && palace.error) {
        out.push({ title: 'Search by meaning is unavailable', body: palace.error, source: 'memory' });
      }
    }
    setHits(out.slice(0, 60));
    setBusy(false);
  };

  // A concept picked on the map: its notes.
  const conceptHits: Hit[] | null = concept
    ? (graph.notes[concept] ?? []).map((n) => ({ ...titled(n.text), source: scopedDocs.find((d) => d.id === n.docId)?.label ?? n.docId }))
    : null;
  const recent = entries.filter((e) => inScope(e.project) && e.date).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 25);
  const sideHits: Hit[] = conceptHits ?? hits ?? recent.map((e) => ({ ...titled(e.text), source: e.agent, when: e.date, section: e.section }));
  const sideTitle = conceptHits ? `Notes about ${graph.concepts.find((c) => c.id === concept)?.label ?? ''}` : hits ? `Results for “${q.trim()}”` : 'Recently learned';

  const projectEntries = entries.filter((e) => e.project === scope);

  return (
    <div className="pro-page">
      <div className="pro-head">
        <h2>Memory</h2>
        <span className="pro-sub">{semantic ? 'search by meaning is on' : semantic === false ? 'exact text search' : ''}</span>
        <div className="pro-head-end" style={{ flex: '1 1 280px', maxWidth: 440 }}>
          <input className="pro-input" style={{ flex: 1 }} placeholder={scope === 'office' ? 'Search everything the office knows' : `Search ${scope}`}
            value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value.trim()) setHits(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void run(); }} />
          <button className="pro-btn" onClick={() => void run()} disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
        </div>
      </div>

      <div className="pro-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button className={`pro-chip${scope === 'office' ? ' pro-chip-on' : ''}`} onClick={() => { setScope('office'); setConcept(null); }}>Whole office</button>
        {projects.map(([p, n]) => (
          <button key={p} className={`pro-chip${scope === p ? ' pro-chip-on' : ''}`} onClick={() => { setScope(p); setConcept(null); setHits(null); }}>{p} <span className="pro-sub">{n}</span></button>
        ))}
        {projects.length === 0 && <span className="pro-sub" style={{ fontSize: 12 }}>Projects appear here as agents working in a repository write their memory.</span>}
        {scope !== 'office' && (
          <button className="pro-btn" style={{ marginInlineStart: 'auto' }} onClick={() => setShowMap((v) => !v)}>{showMap ? 'Hide map' : 'Map'}</button>
        )}
      </div>

      {scope !== 'office' && !hits && !showMap ? (
        <ProjectMemory project={scope} entries={projectEntries} roster={roster} onOpenAgent={openAgent} />
      ) : (
        <div style={{ flex: 1, minHeight: 460, display: 'flex', gap: 12 }}>
          <div className="pro-card pro-embed" style={{ padding: 0, overflow: 'hidden', minWidth: 0, flex: 1 }}>
            <ConceptGraph graph={graph} docs={scopedDocs} selected={concept} onSelect={setConcept} />
          </div>
          <aside style={{ width: 330, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
            <div className="pro-row">
              <div className="pro-sub" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>{sideTitle}</div>
              {(concept || hits) && <button className="pro-btn" style={{ marginInlineStart: 'auto', fontSize: 11 }} onClick={() => { setConcept(null); setHits(null); setQ(''); }}>Back</button>}
            </div>
            {sideHits.length === 0 && (
              <p className="pro-sub">{hits ? 'Nothing found.' : 'Nothing dated yet. As agents write their memory, what they learn shows up here.'}</p>
            )}
            {sideHits.map((h, i) => <NoteCard key={`${sideTitle}-${i}`} hit={h} />)}
          </aside>
        </div>
      )}
      <span className="pro-sub" style={{ fontSize: 11 }}>
        {docs.filter((d) => d.kind === 'agent').length} agent memories · {docs.filter((d) => d.kind === 'doc').length} documents · {entries.length} notes
      </span>
    </div>
  );
}

/** One note: its first sentence, the rest on demand. */
function NoteCard({ hit }: { hit: Hit }) {
  const [open, setOpen] = useState(false);
  return (
    <button className="pro-card" onClick={() => setOpen((v) => !v)} aria-expanded={open}
      style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'start', flexShrink: 0 }}>
      <strong style={{ fontSize: 13, lineHeight: 1.35, fontWeight: 600 }}>{hit.title}</strong>
      {hit.body && (
        <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--cth-ink-700)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
          ...(open ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }) }}>{hit.body}</span>
      )}
      <span className="pro-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {hit.section && <span className="pro-badge" style={{ background: SECTION_TONE[hit.section], fontSize: 10 }}>{SECTION_LABEL[hit.section]}</span>}
        <span className="pro-sub" style={{ fontSize: 11 }}>{hit.source}{hit.when ? ` · ${hit.when}` : ''}</span>
      </span>
    </button>
  );
}

/** A project's memory, by section: what a technical user needs to trust. */
function ProjectMemory({ project, entries, roster, onOpenAgent }: {
  project: string; entries: Entry[]; roster: Agent[]; onOpenAgent: (id: string) => void;
}) {
  const by = new Map<MemorySection, Entry[]>();
  for (const e of entries) by.set(e.section, [...(by.get(e.section) ?? []), e]);
  const agents = [...new Map(entries.filter((e) => e.agentId).map((e) => [e.agentId!, e.agent])).entries()];
  if (!entries.length) return <p className="pro-sub">Nothing recorded for {project} yet.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="pro-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span className="pro-sub" style={{ fontSize: 12 }}>From</span>
        {agents.map(([id, name]) => (
          <button key={id} className="pro-chip" onClick={() => onOpenAgent(id)} disabled={!roster.some((a) => a.id === id)}>{name}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12, alignItems: 'start' }}>
        {SECTION_ORDER.filter((s) => by.has(s)).map((s) => (
          <section key={s} className="pro-card" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--pro-line)', background: SECTION_TONE[s] }}>
              <strong style={{ fontSize: 13 }}>{SECTION_LABEL[s]}</strong>
              <span className="pro-sub" style={{ fontSize: 11, marginInlineStart: 8 }}>{SECTION_HINT[s]}</span>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {(by.get(s) ?? []).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).map((e, i) => {
                const file = s === 'files' ? filePathIn(e.text) : null;
                return (
                  <li key={i} style={{ padding: '8px 12px', borderTop: i ? '1px solid var(--pro-line)' : undefined, fontSize: 13, lineHeight: 1.45 }}>
                    {file ? <><code className="pro-mono" style={{ fontSize: 12 }}>{file}</code> <span>{e.text.replace(/`[^`]+`/, '').replace(/^\s*[—–-]\s*/, '')}</span></> : e.text}
                    <div className="pro-sub" style={{ fontSize: 11 }}>{e.agent}{e.date ? ` · ${e.date}` : ''}</div>
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
