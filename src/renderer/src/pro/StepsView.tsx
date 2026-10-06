import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { canonicalTool, foldStep, foldSteps, type AgentStep, type StepGroup } from '@shared/agentSteps';

/**
 * An agent's steps as a readable timeline: what it ran, read, edited, searched
 * and called, with what it did it to. The terminal shows the same work as text
 * scrolling past in a small box; this is the same thing at reading size, with
 * filters, built from the hook events every provider's shim reports.
 */

const FILTERS: Array<'all' | StepGroup> = ['all', 'shell', 'files', 'web', 'connections', 'agents'];
const ICON: Record<StepGroup, string> = { shell: '>_', files: '▤', web: '◎', connections: '⚭', agents: '☺', other: '·' };

const fmtTime = (ts: number): string => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fmtDur = (ms: number): string => (ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60_000)} min`);

/** The agent's steps: history from main, then live from the hook stream. */
export function useAgentSteps(agentId: string): AgentStep[] {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  useEffect(() => {
    let alive = true;
    setSteps([]);
    // Events that arrive while the history is loading are held, then applied after it.
    let pending: Parameters<typeof foldStep>[1][] | null = [];
    const off = window.cth.onHiveHookEvent((e) => {
      if (e.agentId !== agentId) return;
      if (pending) pending.push(e); else setSteps((s) => foldStep(s, e));
    });
    void window.cth.hiveSteps(agentId).then((history) => {
      if (!alive) return;
      const held = pending ?? [];
      pending = null;
      const seen = new Set(history.map((h) => `${h.ts}|${h.event}|${h.tool}`));
      setSteps(foldSteps([...history, ...held.filter((h) => !seen.has(`${(h as { ts?: number }).ts}|${h.event}|${h.tool}`))]));
    }).catch(() => { pending = null; });
    return () => { alive = false; off(); };
  }, [agentId]);
  return steps;
}

export function StepsView({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const steps = useAgentSteps(agentId);
  const [filter, setFilter] = useState<'all' | StepGroup>('all');
  const [follow, setFollow] = useState(true);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const end = useRef<HTMLDivElement>(null);

  const shown = useMemo(
    () => steps.filter((s) => filter === 'all' || s.kind !== 'tool' || s.group === filter),
    [steps, filter]
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of steps) if (s.kind === 'tool') c[s.group] = (c[s.group] ?? 0) + 1;
    return c;
  }, [steps]);

  useEffect(() => { if (follow) end.current?.scrollIntoView({ block: 'end' }); }, [shown, follow]);

  return (
    <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="pro-row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {FILTERS.map((f) => (
          <button key={f} className={`pro-chip${filter === f ? ' pro-chip-on' : ''}`} style={{ cursor: 'pointer', fontFamily: 'var(--cth-font-ui)' }}
            aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(`pro.steps.filter_${f}`)}{f !== 'all' && counts[f] ? ` · ${counts[f]}` : ''}
          </button>
        ))}
        <label className="pro-sub" style={{ marginInlineStart: 'auto', display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> {t('pro.steps.follow')}
        </label>
      </div>

      <div className="pro-card" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 0 }}>
        {shown.length === 0 && <p className="pro-sub" style={{ margin: 0, padding: 16 }}>{t(steps.length ? 'pro.steps.nothingHere' : 'pro.steps.empty')}</p>}
        {shown.map((s) => <StepRow key={s.id} s={s} expanded={open.has(s.id)}
          onToggle={() => setOpen((o) => { const n = new Set(o); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} />)}
        <div ref={end} />
      </div>
    </div>
  );
}

function StepRow({ s, expanded, onToggle }: { s: AgentStep; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const prompt = s.kind === 'prompt';
  const dot = s.status === 'failed' || s.status === 'blocked' ? 'var(--cth-coral)' : s.status === 'running' ? 'var(--cth-lemon)' : 'var(--cth-mint)';
  const long = (s.detail?.length ?? 0) > 140;
  // The shared module words steps in English; the ones we know are translated here.
  const label = s.kind === 'prompt' ? t('pro.steps.prompt') : s.kind === 'stop' ? t('pro.steps.stop') : s.kind === 'tool' ? t(`pro.steps.tool_${canonicalTool(s.tool ?? '')}`, { defaultValue: s.label }) : s.label;
  return (
    <div style={{ display: 'flex', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--pro-line)', alignItems: 'flex-start', background: prompt ? 'var(--cth-lemon-light)' : undefined }}>
      <span className="pro-sub pro-mono" style={{ fontSize: 11, width: 86, flexShrink: 0, paddingTop: 2, whiteSpace: 'nowrap' }}>{fmtTime(s.ts)}</span>
      <span aria-hidden="true" className="pro-mono" style={{ width: 22, flexShrink: 0, textAlign: 'center', color: 'var(--cth-ink-500)' }}>{ICON[s.group]}</span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        {s.detail && (
          <span className="pro-mono" onClick={long ? onToggle : undefined} title={long ? t('pro.steps.toggle') : undefined}
            style={{ fontSize: 12, color: 'var(--cth-ink-700)', overflowWrap: 'anywhere', cursor: long ? 'pointer' : 'default',
              ...(long && !expanded ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' } : {}) }}>
            {s.detail}
          </span>
        )}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingTop: 2 }}>
        {s.durationMs !== undefined && s.durationMs >= 50 && <span className="pro-sub pro-mono" style={{ fontSize: 11 }}>{fmtDur(s.durationMs)}</span>}
        {s.kind === 'tool' && (
          <span title={t(`pro.steps.status_${s.status}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <span className="pro-dot" style={{ background: dot }} />{s.status !== 'ok' && t(`pro.steps.status_${s.status}`)}
          </span>
        )}
      </span>
    </div>
  );
}
