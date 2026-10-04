import { useEffect, useState } from 'react';
import type { Agent } from '@/store/store';
import { useStore } from '@/store/store';
import { MemoryGraphPanel } from '@/components/MemoryGraphPanel';
import { useProStore } from './proStore';
import type { KeyedTask } from './data';

interface Hit {
  kind: 'ticket' | 'agent' | 'memory';
  title: string;
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

/** Share of the query's words found in `text` (0..1). Exact text search: the
 *  semantic layer (MemPalace) answers by meaning when it is installed. */
function score(text: string, ws: string[]): number {
  if (!ws.length) return 0;
  const t = text.toLowerCase();
  return ws.filter((w) => t.includes(w)).length / ws.length;
}

/**
 * Memory — ask what the floor knows. Three result groups: tickets from the
 * board, agents (role and notes), and memories: each agent's memory.md lines,
 * the knowledge graph when it is on, and MemPalace's search by meaning when it
 * is installed. The graph beside it is the Classic memory graph.
 */
export function MemoryView({ tasks, roster }: { tasks: KeyedTask[]; roster: Agent[] }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [semantic, setSemantic] = useState<boolean | null>(null);
  const setView = useProStore((s) => s.setView);
  const god = roster.find((a) => a.isGod);

  useEffect(() => {
    window.cth.memoryStatus().then((s) => setSemantic(s.active)).catch(() => setSemantic(false));
  }, []);

  const openAgent = (id: string) => { useStore.getState().select(id); setView({ kind: 'agent', agentId: id }); };

  const run = async () => {
    const query = q.trim();
    if (!query) { setHits([]); return; }
    setBusy(true);
    const ws = words(query);
    const out: Hit[] = [];

    for (const t of tasks) {
      const s = score(`${t.key ?? ''} ${t.title} ${t.description ?? ''}`, ws);
      if (s >= 0.5) out.push({ kind: 'ticket', title: `${t.key ? `${t.key} ` : ''}${t.title}`, detail: t.status, onOpen: () => useStore.getState().openTaskDetail(t.id) });
    }

    const memories = await Promise.all(roster.map(async (a) => {
      try { return { a, text: await window.cth.hiveMemory(a.id) }; } catch { return { a, text: '' }; }
    }));
    for (const { a, text } of memories) {
      if (score(`${a.name} ${a.description}`, ws) >= 0.5) out.push({ kind: 'agent', title: a.name, detail: a.description, onOpen: () => openAgent(a.id) });
      for (const line of (text ?? '').split('\n')) {
        const clean = line.replace(/^[-*#>\s]+/, '').trim();
        if (clean.length > 8 && score(clean, ws) >= 0.6) out.push({ kind: 'memory', title: clean.slice(0, 160), detail: a.name, onOpen: () => openAgent(a.id) });
      }
    }

    const [kg, palace] = await Promise.all([
      window.cth.kgSearch(query, 5).catch(() => []),
      semantic ? window.cth.searchMemory(query).catch(() => null) : Promise.resolve(null)
    ]);
    for (const h of kg) out.push({ kind: 'memory', title: h.snippet.slice(0, 160), detail: h.title });
    if (palace?.ok && palace.output.trim()) {
      for (const block of palace.output.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).slice(0, 5)) {
        out.push({ kind: 'memory', title: block.slice(0, 200), detail: 'by meaning' });
      }
    }

    setHits(out.slice(0, 40));
    setBusy(false);
  };

  const groups: { kind: Hit['kind']; label: string }[] = [
    { kind: 'ticket', label: 'Tickets' },
    { kind: 'agent', label: 'Agents' },
    { kind: 'memory', label: 'Memories' }
  ];

  return (
    <div className="pro-page">
      <div className="pro-head">
        <h2>Memory</h2>
        <span className="pro-sub">{semantic ? 'search by meaning is on' : semantic === false ? 'exact text search (install MemPalace for meaning)' : ''}</span>
        <div className="pro-head-end" style={{ flex: '1 1 280px', maxWidth: 420 }}>
          <input className="pro-input" style={{ flex: 1 }} placeholder="Ask what the floor knows"
            value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void run(); }} />
          <button className="pro-btn" onClick={() => void run()} disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 420, display: 'flex', gap: 12 }}>
        <div className="pro-card pro-embed" style={{ padding: 0, overflow: 'hidden', minWidth: 0 }}>
          {god ? <MemoryGraphPanel godId={god.id} onJumpToMemory={openAgent} /> : <p className="pro-sub" style={{ padding: 16 }}>The graph appears once the orchestrator is on the floor.</p>}
        </div>
        <aside style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          {hits.length === 0 && <p className="pro-sub">{q.trim() && !busy ? 'Nothing found.' : 'Results land here: tickets, agents and memories.'}</p>}
          {groups.map((g) => {
            const rows = hits.filter((h) => h.kind === g.kind);
            if (!rows.length) return null;
            return (
              <section key={g.kind} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="pro-sub" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>{g.label}</div>
                {rows.map((h, i) => (
                  <button key={i} className="pro-card" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }} onClick={h.onOpen} disabled={!h.onOpen}>
                    <span className="pro-badge" style={{ background: KIND_BG[h.kind], alignSelf: 'flex-start' }}>{h.kind}</span>
                    <strong style={{ fontSize: 13 }}>{h.title}</strong>
                    {h.detail && <span className="pro-sub" style={{ fontSize: 12 }}>{h.detail}</span>}
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
