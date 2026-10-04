import { useMemo, useState } from 'react';
import { useStore } from '@/store/store';
import { AskMeTab } from '@/components/AskMeTab';
import { TriggerHistoryTab } from '@/components/triggers/TriggerHistoryTab';
import { MarkdownPreview } from '@/markdown/MarkdownPreview';
import { waitsOnHuman } from '@/components/TasksKanban';
import { Avatar, usePoll, type KeyedTask } from './data';

type Tab = 'you' | 'team' | 'everyone' | 'outside';
type Message = Awaited<ReturnType<typeof window.cth.hiveMessages>>[number];

/** Senders that are the outside world rather than an agent on the floor. */
const OUTSIDE = new Set(['webhook', 'slack', 'org', 'github', 'linear', 'telegram']);
/** Harness beats, not conversation. */
const SYSTEM = new Set(['heartbeat', 'scheduler', 'breaker', 'system']);

/**
 * Inbox — every conversation in one place. For you: the questions waiting on
 * you (the Ask me board) and what the orchestrator addressed to you. Your
 * team: one row per agent. Everyone: every routed message. Outside: Slack
 * threads waiting in the queue, webhook mail, and held webhook requests to
 * approve or reject (the trigger history, which owns that decision).
 */
export function InboxView({ tasks }: { tasks: KeyedTask[] }) {
  const [tab, setTab] = useState<Tab>('you');
  const [openAgent, setOpenAgent] = useState<string | null>(null);
  const agents = useStore((s) => s.agents);
  const queues = useStore((s) => s.messageQueues);
  const messages = usePoll(() => window.cth.hiveMessages({ limit: 300 }), 5000, [] as Message[]);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const asks = tasks.filter(waitsOnHuman).length;

  const real = messages.filter((m) => !SYSTEM.has(m.from));
  const forYou = real.filter((m) => m.to === 'human');
  const outsideMail = real.filter((m) => OUTSIDE.has(m.from));
  const slackWaiting = Object.entries(queues).flatMap(([id, q]) => q.filter((m) => m.slack).map((m) => ({ ...m, agentId: id })));

  const name = (id: string) => byId.get(id)?.name ?? (id === 'human' ? 'You' : id);

  const list = (rows: Message[]) => rows.length === 0
    ? <p className="pro-sub">Nothing here yet.</p>
    : rows.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 120).map((m) => (
      <article key={`${m.id}-${m.direction}`} className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="pro-row" style={{ fontSize: 12 }}>
          <Avatar agent={byId.get(m.from)} />
          <strong>{name(m.from)}</strong><span className="pro-sub">→ {name(m.to)}</span>
          <span className="pro-chip">{m.act}</span>
          {m.requires_reply && <span className="pro-badge" style={{ background: 'var(--cth-peach-light)' }}>needs reply</span>}
          <span className="pro-sub" style={{ marginInlineStart: 'auto' }}>{new Date(m.created_at).toLocaleString()}</span>
        </div>
        <strong style={{ fontSize: 13 }}>{m.subject}</strong>
        {m.body && <div style={{ fontSize: 13, maxHeight: 160, overflow: 'auto' }}><MarkdownPreview source={m.body} variant="card" /></div>}
      </article>
    ));

  // Your team: one row per agent, with its latest message either way.
  const team = agents.filter((a) => !a.isAssistant).map((a) => {
    const mine = real.filter((m) => m.from === a.id || m.to === a.id);
    const last = mine.reduce<Message | undefined>((acc, m) => (!acc || m.created_at > acc.created_at ? m : acc), undefined);
    return { agent: a, count: mine.length, last, mine };
  });

  return (
    <div className="pro-page">
      <div className="pro-head">
        <h2>Inbox</h2>
        <div className="pro-tabs" role="tablist" style={{ marginInlineStart: 8 }}>
          <button role="tab" aria-selected={tab === 'you'} onClick={() => setTab('you')}>For you{asks ? ` · ${asks}` : ''}</button>
          <button role="tab" aria-selected={tab === 'team'} onClick={() => setTab('team')}>Your team</button>
          <button role="tab" aria-selected={tab === 'everyone'} onClick={() => setTab('everyone')}>Everyone</button>
          <button role="tab" aria-selected={tab === 'outside'} onClick={() => setTab('outside')}>Outside</button>
        </div>
      </div>

      {tab === 'you' && (
        <>
          <div className="pro-embed" style={{ minHeight: 280 }}><AskMeTab /></div>
          {forYou.length > 0 && <h3 style={{ margin: '8px 0 0', fontSize: 14 }}>Addressed to you</h3>}
          {forYou.length > 0 && list(forYou)}
        </>
      )}

      {tab === 'team' && (openAgent ? (
        <>
          <button className="pro-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setOpenAgent(null)}>← All agents</button>
          {list(team.find((r) => r.agent.id === openAgent)?.mine ?? [])}
        </>
      ) : team.map(({ agent, count, last }) => (
        <button key={agent.id} className="pro-card pro-row" onClick={() => setOpenAgent(agent.id)}>
          <Avatar agent={agent} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="pro-title">{agent.name}</p>
            <p className="pro-text" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {last ? `${name(last.from)}: ${last.subject}` : 'No messages yet'}
            </p>
          </div>
          <span className="pro-chip">{count}</span>
        </button>
      )))}

      {tab === 'everyone' && list(real)}

      {tab === 'outside' && (
        <>
          {slackWaiting.length > 0 && <h3 style={{ margin: 0, fontSize: 14 }}>Slack, waiting in a queue</h3>}
          {slackWaiting.map((m) => (
            <article key={m.id} className="pro-card">
              <div className="pro-row" style={{ fontSize: 12 }}>
                <span className="pro-chip">slack</span><span className="pro-sub">for {name(m.agentId)} · queued {new Date(m.ts).toLocaleTimeString()}</span>
              </div>
              <p className="pro-text" style={{ marginTop: 6 }}>{m.text}</p>
            </article>
          ))}
          {outsideMail.length > 0 && <h3 style={{ margin: 0, fontSize: 14 }}>Webhook mail</h3>}
          {outsideMail.length > 0 && list(outsideMail)}
          <h3 style={{ margin: 0, fontSize: 14 }}>Requests and approvals</h3>
          <div className="pro-embed" style={{ minHeight: 320 }}><TriggerHistoryTab /></div>
        </>
      )}
    </div>
  );
}
