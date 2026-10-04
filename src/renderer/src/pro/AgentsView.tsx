import { useMemo, useState } from 'react';
import type { HarnessConfig } from '@/store/config';
import { useStore, type Agent } from '@/store/store';
import { MessageQueueComposer } from '@/components/MessageQueueComposer';
import { waitsOnHuman } from '@/components/TasksKanban';
import { useProStore } from './proStore';
import {
  Avatar, Bar, StateBadge, agentState, fmtTokens, stripAnsi,
  type AgentDirectoryEntry, type KeyedTask
} from './data';

interface Props {
  roster: Agent[];
  tasks: KeyedTask[];
  directory: Record<string, AgentDirectoryEntry>;
  asking: Set<string>;
  config: HarnessConfig;
  onOpen: (id: string) => void;
}

/** The ticket an agent is on: its newest `doing` card, else its newest open one. */
export function currentTicket(tasks: KeyedTask[], agentId: string): KeyedTask | undefined {
  const mine = tasks.filter((t) => t.assignee === agentId && t.status !== 'done');
  const by = (s: string) => mine.filter((t) => t.status === s).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return by('doing') ?? by('blocked') ?? by('todo');
}

/** Floor spend vs the user's budget, for the orchestrator card and his room. */
export function spendLine(directory: Record<string, AgentDirectoryEntry>, config: HarnessConfig) {
  const rows = Object.values(directory).filter((d) => !d.archived);
  const usd = rows.reduce((n, d) => n + (d.usd || 0), 0);
  const tokens = rows.reduce((n, d) => n + (d.tokens || 0), 0);
  if (config.costCapUsd) return { main: `$${usd.toFixed(2)}`, sub: `of $${config.costCapUsd} cap`, ratio: usd / config.costCapUsd };
  if (config.costCapTokens) return { main: `$${usd.toFixed(2)}`, sub: `${fmtTokens(tokens)} of ${fmtTokens(config.costCapTokens)} tok`, ratio: tokens / config.costCapTokens };
  return { main: `$${usd.toFixed(2)}`, sub: 'no cap set', ratio: 0 };
}

export function AgentsView({ roster, tasks, directory, asking, config, onOpen }: Props) {
  const [q, setQ] = useState('');
  const setView = useProStore((s) => s.setView);
  const god = roster.find((a) => a.isGod);
  const workers = roster.filter((a) => !a.isGod);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return workers;
    return workers.filter((a) => `${a.name} ${a.description} ${a.model ?? ''}`.toLowerCase().includes(needle));
  }, [workers, q]);

  return (
    <div className="pro-page">
      <div className="pro-head">
        <h2>Agents</h2>
        <span className="pro-sub">{roster.length} agents</span>
        <div className="pro-head-end">
          <input className="pro-input" placeholder="Search agents" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="pro-btn" onClick={() => setView({ kind: 'section', section: 'capabilities' })}>Capabilities</button>
          <button className="pro-btn pro-btn-primary" onClick={() => useStore.getState().setAddAgentOpen(true)}>Add an agent</button>
        </div>
      </div>

      {god && <OrchestratorCard god={god} tasks={tasks} directory={directory} config={config} onOpen={onOpen} />}

      <div className="pro-grid">
        {shown.map((a) => (
          <AgentTile key={a.id} agent={a} ticket={currentTicket(tasks, a.id)} dir={directory[a.id]} asksYou={asking.has(a.id)} onOpen={onOpen} />
        ))}
        <button
          className="pro-card"
          style={{ borderStyle: 'dashed', minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cth-ink-500)' }}
          onClick={() => useStore.getState().setAddAgentOpen(true)}
        >
          + Add an agent
        </button>
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pro-card" style={{ padding: '10px 12px' }}>
      <div className="pro-sub" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 6 }}>{children}</div>
    </div>
  );
}

function OrchestratorCard({ god, tasks, directory, config, onOpen }: {
  god: Agent; tasks: KeyedTask[]; directory: Record<string, AgentDirectoryEntry>; config: HarnessConfig; onOpen: (id: string) => void;
}) {
  const spend = spendLine(directory, config);
  const breaker = directory[god.id]?.breaker || 'healthy';
  const doing = tasks.filter((t) => t.status === 'doing').length;
  const blocked = tasks.filter((t) => t.status === 'blocked').length;
  const asks = tasks.filter(waitsOnHuman).length;
  const st = agentState(god, false);
  const ctx = god.contextTokens && god.contextLimit ? Math.round((god.contextTokens / god.contextLimit) * 100) : null;
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="pro-row">
        <Avatar agent={god} scale={1.5} />
        <div style={{ minWidth: 0 }}>
          <div className="pro-row" style={{ gap: 8 }}>
            <button className="pro-title" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }} onClick={() => onOpen(god.id)}>{god.name}</button>
            <span className="pro-badge" style={{ background: 'var(--cth-lemon-light)' }}>orchestrator</span>
          </div>
          <div className="pro-sub" style={{ fontSize: 12 }}>
            {[god.model ?? god.provider, ctx !== null ? `ctx ${ctx}%` : null].filter(Boolean).join(' · ')}
          </div>
        </div>
        <span style={{ marginInlineStart: 'auto' }}><StateBadge {...st} /></span>
      </div>
      {god.description && <p className="pro-text">{god.description}</p>}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Stat label="Spend"><strong style={{ fontSize: 18, color: 'var(--cth-peach)' }}>{spend.main}</strong><span className="pro-mono pro-sub">{spend.sub}</span></Stat>
        <Stat label="Circuit breaker"><span className="pro-dot" style={{ background: breaker === 'healthy' ? 'var(--cth-mint)' : 'var(--cth-coral)' }} /><strong>{breaker}</strong></Stat>
        <Stat label="Tasks"><strong style={{ fontSize: 18 }}>{doing}</strong><span className="pro-mono pro-sub">doing · {blocked} blocked</span></Stat>
        <Stat label="Waiting on you"><strong style={{ fontSize: 18, color: asks ? 'var(--cth-peach)' : undefined }}>{asks}</strong><span className="pro-mono pro-sub">{asks === 1 ? 'question' : 'questions'}</span></Stat>
      </div>
      <MessageQueueComposer agent={god} />
    </section>
  );
}

function AgentTile({ agent, ticket, dir, asksYou, onOpen }: {
  agent: Agent; ticket?: KeyedTask; dir?: AgentDirectoryEntry; asksYou: boolean; onOpen: (id: string) => void;
}) {
  const feed = useStore((s) => s.feeds[agent.id]);
  const st = agentState(agent, asksYou);
  const lines = (feed ?? []).slice(-3).map(stripAnsi);
  const tail = lines.length ? lines.join('\n') : stripAnsi(agent.recentAssistantText ?? agent.action ?? '').slice(-160);
  const ctxRatio = agent.contextTokens && agent.contextLimit ? agent.contextTokens / agent.contextLimit : 0;
  return (
    <article className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="pro-row" style={{ alignItems: 'flex-start' }}>
        <Avatar agent={agent} scale={1.5} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="pro-title">{agent.name}</p>
          <div className="pro-sub" style={{ fontSize: 12 }}>{agent.model ?? agent.provider ?? 'CLI default'}</div>
        </div>
        <StateBadge {...st} />
      </div>
      {ticket ? (
        <button className="pro-card" style={{ padding: '6px 10px', display: 'flex', gap: 8, minWidth: 0 }} onClick={() => useStore.getState().openTaskDetail(ticket.id)}>
          {ticket.key && <span className="pro-ticket">{ticket.key}</span>}
          <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.title}</span>
        </button>
      ) : (
        <p className="pro-text">{agent.action || agent.description || 'Waiting for work'}</p>
      )}
      <div>
        <div className="pro-sub" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>Terminal</div>
        <div className="pro-term">{tail || '—'}</div>
      </div>
      <div className="pro-row pro-mono pro-sub" style={{ fontSize: 11 }}>
        <span>{Math.round(ctxRatio * 100)}%</span>
        <div style={{ flex: 1 }}><Bar value={ctxRatio} tone={ctxRatio > 0.8 ? 'red' : 'blue'} /></div>
        <span>{agent.contextLimit ? fmtTokens(agent.contextLimit) : ''}</span>
      </div>
      <div className="pro-row">
        {dir && <span className="pro-chip">{fmtTokens(dir.tokens)} tok</span>}
        {dir && dir.inboxBacklog > 0 && <span className="pro-chip">{dir.inboxBacklog} unread</span>}
        <button className="pro-btn" style={{ marginInlineStart: 'auto' }} onClick={() => onOpen(agent.id)}>Prompt</button>
      </div>
    </article>
  );
}
