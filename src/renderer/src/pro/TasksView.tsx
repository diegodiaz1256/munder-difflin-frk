import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, type Agent } from '@/store/store';
import { waitsOnHuman } from '@/components/TasksKanban';
import { Avatar, type KeyedTask } from './data';

type Filter = 'all' | 'asks' | 'unassigned';

/** Board columns; their names are `pro.tasks.col_<status>`. */
const COLUMNS: { status: KeyedTask['status']; color: string }[] = [
  { status: 'todo', color: 'var(--cth-sky)' },
  { status: 'doing', color: 'var(--cth-mint)' },
  { status: 'blocked', color: 'var(--cth-coral)' },
  { status: 'done', color: 'var(--cth-status-idle)' }
];

/**
 * Tasks — every job as a card with an owner and a key. A read surface over
 * tasks.json like the Classic kanban: the orchestrator writes the ledger, so
 * "New task" goes to him through his queue instead of inserting a card he
 * never heard about.
 */
export function TasksView({ tasks, roster }: { tasks: KeyedTask[]; roster: Agent[] }) {
  const { t: tr } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<string | null>(null);
  const god = roster.find((a) => a.isGod);
  const byId = new Map(roster.map((a) => [a.id, a]));

  const needle = q.trim().toLowerCase();
  const shown = tasks.filter((t) =>
    (filter === 'all' || (filter === 'asks' ? waitsOnHuman(t) : !t.assignee))
    && (!needle || `${t.key ?? ''} ${t.title} ${t.description ?? ''}`.toLowerCase().includes(needle))
  );
  const doing = tasks.filter((t) => t.status === 'doing').length;
  const blocked = tasks.filter((t) => t.status === 'blocked').length;

  const send = () => {
    const text = draft?.trim();
    if (!text || !god) return;
    useStore.getState().enqueueMessage(god.id, `New task from the human: ${text}\nAdd it to tasks.json, pick an owner and dispatch it.`);
    setDraft(null);
  };

  return (
    <div className="pro-page">
      <div className="pro-head">
        <h2>{tr('pro.nav.tasks')}</h2>
        <span className="pro-sub">{tr('pro.tasks.summary', { doing, blocked })}</span>
        <div className="pro-head-end">
          <div className="pro-tabs" role="tablist">
            {(['all', 'asks', 'unassigned'] as Filter[]).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>
                {tr(`pro.tasks.filter_${f}`)}
              </button>
            ))}
          </div>
          <input className="pro-input" placeholder={tr('pro.tasks.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="pro-btn pro-btn-primary" disabled={!god} onClick={() => setDraft('')}>{tr('pro.tasks.new')}</button>
        </div>
      </div>

      {draft !== null && (
        <div className="pro-card pro-row">
          <input
            className="pro-input" style={{ flex: 1 }} autoFocus
            placeholder={tr('pro.tasks.describe', { name: god?.name ?? tr('pro.nav.orchestrator') })}
            value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(); if (e.key === 'Escape') setDraft(null); }}
          />
          <button className="pro-btn pro-btn-primary" onClick={send} disabled={!draft.trim()}>{tr('pro.tasks.sendTo', { name: god?.name ?? tr('pro.nav.orchestrator') })}</button>
          <button className="pro-btn" onClick={() => setDraft(null)}>{tr('common.cancel')}</button>
        </div>
      )}

      <div className="pro-board">
        {COLUMNS.map((col) => {
          const cards = shown.filter((t) => t.status === col.status)
            .sort((a, b) => a.priority - b.priority || b.createdAt.localeCompare(a.createdAt));
          return (
            <section key={col.status} className="pro-col" aria-label={tr(`pro.tasks.col_${col.status}`)}>
              <div className="pro-col-head"><span className="pro-dot" style={{ background: col.color }} />{tr(`pro.tasks.col_${col.status}`)}<span className="pro-sub">{cards.length}</span></div>
              {cards.map((t) => {
                const owner = t.assignee ? byId.get(t.assignee) : undefined;
                return (
                  <button key={t.id} className="pro-card" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}
                    onClick={() => useStore.getState().openTaskDetail(t.id)}>
                    <span className="pro-ticket">{t.key ?? t.id}</span>
                    <span style={{ fontSize: 13, lineHeight: '18px' }}>{t.title}</span>
                    <span className="pro-row" style={{ justifyContent: 'space-between' }}>
                      {waitsOnHuman(t)
                        ? <span className="pro-badge" style={{ background: 'var(--cth-peach-light)' }}>{tr('pro.tasks.asksYou')}</span>
                        : t.status === 'done' ? <span className="pro-badge" style={{ background: 'var(--cth-mint-light)' }}>{tr('pro.state.done')}</span> : <span />}
                      {owner ? <span title={owner.name}><Avatar agent={owner} /></span>
                        : <span className="pro-sub" style={{ fontSize: 11 }}>{t.assignee ?? tr('pro.tasks.unassigned')}</span>}
                    </span>
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
