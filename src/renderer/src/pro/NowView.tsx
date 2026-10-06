import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActivityItem, ActivityKind } from '@shared/officeActivity';
import { useOfficeActivity } from './activityStore';
import { useProStore } from './proStore';

const FILTERS: Array<'all' | 'message' | 'step' | 'problem'> = ['all', 'message', 'step', 'problem'];
const ICON: Record<ActivityKind, string> = { step: '›', message: '✉', join: '+', leave: '✓', problem: '!' };

/** "12 s", "3 min", "2 h" ago. */
function ago(ts: number, now: number, t: (k: string, o?: Record<string, unknown>) => string): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return t('pro.now.secs', { n: s });
  if (s < 3600) return t('pro.now.mins', { n: Math.round(s / 60) });
  return t('pro.now.hours', { n: Math.round(s / 3600) });
}

/** One item as a sentence (steps: the agent, what it did, and what to). */
export function useActivityText(): (i: ActivityItem) => { text: string; detail: string } {
  const { t } = useTranslation();
  return (i) => {
    if (i.kind === 'step') {
      return { text: `${i.params.who} · ${t(`pro.steps.${i.key}`, { defaultValue: i.params.tool })}`, detail: i.params.detail ?? '' };
    }
    return { text: t(`pro.now.${i.key}`, i.params), detail: '' };
  };
}

/**
 * Now: what the office is doing, newest first — who asked whom for what, who
 * is running or reading what, who joined, finished or stopped. Everything was
 * there before, but scattered across each agent's page, the inbox and a log
 * file; this is the one place to follow it.
 */
export function NowView() {
  const { t } = useTranslation();
  const items = useOfficeActivity();
  const sentence = useActivityText();
  const setView = useProStore((s) => s.setView);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(i); }, []);

  const shown = useMemo(() => items.filter((i) =>
    filter === 'all' ? true : filter === 'message' ? i.kind === 'message' || i.kind === 'join' || i.kind === 'leave' : i.kind === filter
  ).slice(0, 200), [items, filter]);

  return (
    <div className="pro-page">
      <div className="pro-head">
        <h2>{t('pro.nav.now')}</h2>
        <span className="pro-sub">{t('pro.now.sub')}</span>
      </div>
      <div className="pro-tabs" role="tablist">
        {FILTERS.map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>{t(`pro.now.filter_${f}`)}</button>
        ))}
      </div>
      {!shown.length ? (
        <p className="pro-text">{t('pro.now.empty')}</p>
      ) : (
        <div className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 8 }}>
          {shown.map((i) => {
            const s = sentence(i);
            return (
              <button key={i.id} className="pro-now-row" onClick={() => { if (i.agentId) setView({ kind: 'agent', agentId: i.agentId }); }}
                style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto', gap: 8, alignItems: 'baseline', textAlign: 'start', background: 'none', border: 'none', padding: '5px 6px', cursor: i.agentId ? 'pointer' : 'default', color: i.kind === 'problem' ? 'var(--cth-coral)' : 'inherit' }}>
                <span aria-hidden style={{ fontWeight: 700, textAlign: 'center' }}>{ICON[i.kind]}</span>
                <span style={{ minWidth: 0 }}>
                  <span>{s.text}</span>
                  {s.detail && <span className="pro-mono" style={{ display: 'block', fontSize: 12, opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.detail}</span>}
                </span>
                <span className="pro-sub" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{ago(i.ts, now, t)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
