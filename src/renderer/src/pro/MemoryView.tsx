import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Agent } from '@/store/store';
import { useStore } from '@/store/store';
import { buildMemoryGraph, parsePalaceSearch, splitNotes, type MemoryDoc } from '@shared/memoryGraph';
import { useProStore } from './proStore';
import { ConceptGraph } from './ConceptGraph';
import type { KeyedTask } from './data';

interface Hit {
  kind: 'ticket' | 'agent' | 'memory';
  title: string;
  /** Longer text under the title (a memory's note). */
  body?: string;
  detail?: string;
  onOpen?: () => void;
}

const KIND_BG: Record<Hit['kind'], string> = {
  ticket: 'var(--cth-mint-light)',
  agent: 'var(--cth-sky-light)',
  memory: 'var(--cth-lemon-light)'
};

function words(q: string): string[] {
  return q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
}

/** Share of the query's words found in `text` (0..1). */
function score(text: string, ws: string[]): number {
  if (!ws.length) return 0;
  const t = text.toLowerCase();
  return ws.filter((w) => t.includes(w)).length / ws.length;
}

/** First line of a note as a title, the rest as its body. */
function titled(text: string): { title: string; body?: string } {
  const clean = text.replace(/^[#>*\-\s]+/, '').trim();
  const cut = clean.search(/(?<=[.!?])\s|\n/);
  if (cut > 20 && cut < 160) return { title: clean.slice(0, cut).trim(), body: clean.slice(cut).trim() || undefined };
  return clean.length > 160 ? { title: `${clean.slice(0, 157)}…`, body: clean } : { title: clean };
}

/**
 * Memory — what the office knows. The graph is the concepts in agents'
 * memories and the research/ deliverables (shared/memoryGraph.ts); click one
 * to read the notes behind it. Search looks through tickets, agents, every
 * note, the knowledge base and, when MemPalace is on, by meaning.
 */
export function MemoryView({ tasks, roster }: { tasks: KeyedTask[]; roster: Agent[] }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [semantic, setSemantic] = useState<boolean | null>(null);
  const [docs, setDocs] = useState<MemoryDoc[]>([]);
  const [concept, setConcept] = useState<string | null>(null);
  const setView = useProStore((s) => s.setView);

  const openAgent = useCallback((id: string) => { useStore.getState().select(id); setView({ kind: 'agent', agentId: id }); }, [setView]);

  const loadCorpus = useCallback(() => {
    void window.cth.hiveMemoryCorpus().then((d) => setDocs(d)).catch(() => {});
  }, []);
  useEffect(() => {
    window.cth.memoryStatus().then((s) => setSemantic(s.active && (s as { modelReady?: boolean }).modelReady !== false)).catch(() => setSemantic(false));
    loadCorpus();
    const id = setInterval(loadCorpus, 30_000);
    return () => clearInterval(id);
  }, [loadCorpus]);

  const graph = useMemo(() => buildMemoryGraph(docs), [docs]);
  const docLabel = (id: string) => docs.find((d) => d.id === id)?.label ?? id;
  const docOpen = (id: string) => {
    const d = docs.find((x) => x.id === id);
    return d?.agentId ? () => openAgent(d.agentId!) : undefined;
  };

  const run = async () => {
    const query = q.trim();
    setConcept(null);
    if (!query) { setHits([]); return; }
    setBusy(true);
    const ws = words(query);
    const out: Hit[] = [];

    for (const t of tasks) {
      const s = score(`${t.key ?? ''} ${t.title} ${t.description ?? ''}`, ws);
      if (s >= 0.5) out.push({ kind: 'ticket', title: `${t.key ? `${t.key} ` : ''}${t.title}`, detail: t.status, onOpen: () => useStore.getState().openTaskDetail(t.id) });
    }
    for (const a of roster) {
      if (score(`${a.name} ${a.description}`, ws) >= 0.5) out.push({ kind: 'agent', title: a.name, detail: a.description, onOpen: () => openAgent(a.id) });
    }
    for (const d of docs) {
      for (const n of splitNotes(d.text)) {
        if (n.length > 8 && score(n, ws) >= 0.6) out.push({ kind: 'memory', ...titled(n), detail: d.label, onOpen: docOpen(d.id) });
      }
    }
    const [kg, palace] = await Promise.all([
      window.cth.kgSearch(query, 5).catch(() => []),
      semantic ? window.cth.searchMemory(query).catch(() => null) : Promise.resolve(null)
    ]);
    for (const h of kg) out.push({ kind: 'memory', ...titled(h.snippet), detail: h.title });
    if (palace?.ok) {
      for (const h of parsePalaceSearch(palace.output).slice(0, 6)) {
        const who = roster.find((a) => a.id === h.wing)?.name ?? h.wing;
        out.push({ kind: 'memory', ...titled(h.text), detail: `by meaning · ${who}${h.source ? ` · ${h.source}` : ''}${h.score ? ` · ${Math.round(h.score * 100)}%` : ''}` });
      }
    } else if (palace && !palace.ok && palace.error) {
      out.push({ kind: 'memory', title: 'Search by meaning is unavailable', body: palace.error });
    }
    setHits(out.slice(0, 50));
    setBusy(false);
  };

  // A selected concept shows its notes in the side panel.
  const conceptHits: Hit[] | null = concept
    ? (graph.notes[concept] ?? []).map((n) => ({ kind: 'memory' as const, ...titled(n.text), detail: docLabel(n.docId), onOpen: docOpen(n.docId) }))
    : null;
  const shown = conceptHits ?? hits;
  const conceptLabel = concept ? graph.concepts.find((c) => c.id === concept)?.label : null;

  const groups: { kind: Hit['kind']; label: string }[] = [
    { kind: 'ticket', label: 'Tickets' },
    { kind: 'agent', label: 'Agents' },
    { kind: 'memory', label: conceptLabel ? `Notes about ${conceptLabel}` : 'Memories' }
  ];

  return (
    <div className="pro-page">
      <div className="pro-head">
        <h2>Memory</h2>
        <span className="pro-sub">
          {graph.concepts.length} concepts from {docs.length} memories and documents · {semantic ? 'search by meaning is on' : semantic === false ? 'exact text search' : ''}
        </span>
        <div className="pro-head-end" style={{ flex: '1 1 280px', maxWidth: 420 }}>
          <input className="pro-input" style={{ flex: 1 }} placeholder="Ask what the floor knows"
            value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void run(); }} />
          <button className="pro-btn" onClick={() => void run()} disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 460, display: 'flex', gap: 12 }}>
        <div className="pro-card pro-embed" style={{ padding: 0, overflow: 'hidden', minWidth: 0, flex: 1 }}>
          <ConceptGraph graph={graph} docs={docs} selected={concept} onSelect={setConcept} />
        </div>
        <aside style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          {shown.length === 0 && <p className="pro-sub">{q.trim() && !busy ? 'Nothing found.' : 'Click a concept to read the notes behind it, or search.'}</p>}
          {groups.map((g) => {
            const rows = shown.filter((h) => h.kind === g.kind);
            if (!rows.length) return null;
            return (
              <section key={g.kind} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="pro-sub" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>{g.label}</div>
                {rows.map((h, i) => (
                  <button key={i} className="pro-card" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'start' }} onClick={h.onOpen} disabled={!h.onOpen}>
                    <strong style={{ fontSize: 13, lineHeight: 1.35 }}>{h.title}</strong>
                    {h.body && <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--cth-ink-700)', display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{h.body}</span>}
                    {h.detail && <span className="pro-badge" style={{ background: KIND_BG[h.kind], alignSelf: 'flex-start', fontSize: 11 }}>{h.detail}</span>}
                  </button>
                ))}
              </section>
            );
          })}
        </aside>
      </div>
    </div>
  );
}
