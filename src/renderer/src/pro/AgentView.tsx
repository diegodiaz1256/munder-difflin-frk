import type { HarnessConfig } from '@/store/config';
import type { Agent } from '@/store/store';
import { AgentDetailPanel } from '@/components/AgentDetailPanel';
import { MCP_CATALOG } from '@shared/mcpCatalog';
import { mcpLabel } from '@shared/roleBundles';
import { useProStore } from './proStore';
import { Avatar, Bar, StateBadge, agentState, fmtTokens, isActive, type AgentDirectoryEntry, type KeyedTask } from './data';
import { currentTicket, spendLine } from './AgentsView';

interface Props {
  agent: Agent;
  roster: Agent[];
  tasks: KeyedTask[];
  directory: Record<string, AgentDirectoryEntry>;
  config: HarnessConfig;
  onOpen: (id: string) => void;
}

/** MCP servers an agent gets on its next spawn: its grant, else the defaults. */
export function effectiveServers(config: HarnessConfig, agentId: string): string[] {
  const grant = config.agentMcpGrants?.[agentId];
  if (grant) return grant;
  return MCP_CATALOG.filter((e) => config.mcpDefaults?.[e.id]?.enabled ?? e.defaultEnabled).map((e) => e.id);
}

/**
 * An agent's room: the live terminal (the same AgentDetailPanel Classic uses,
 * so the queue, the command bar and every tab keep working) with the agent's
 * facts beside it. The orchestrator's room opens on who he is routing to and
 * the floor's spend against its cap.
 */
export function AgentView({ agent, roster, tasks, directory, config, onOpen }: Props) {
  const setView = useProStore((s) => s.setView);
  const dir = directory[agent.id];
  const st = agentState(agent, false);
  const cap = config.agentTokenCaps?.[agent.id];
  const servers = effectiveServers(config, agent.id);

  return (
    <div className="pro-page" style={{ gap: 12 }}>
      <div className="pro-head">
        <Avatar agent={agent} />
        <h2>{agent.name}</h2>
        {agent.isGod
          ? <span className="pro-badge" style={{ background: 'var(--cth-lemon-light)' }}>orchestrator</span>
          : <StateBadge {...st} />}
      </div>

      {agent.isGod && <RoutingMap god={agent} roster={roster} tasks={tasks} directory={directory} config={config} onOpen={onOpen} />}

      <div style={{ flex: 1, minHeight: 420, display: 'flex', gap: 12 }}>
        <div className="pro-embed" style={{ minWidth: 0 }}>
          <AgentDetailPanel agent={agent} />
        </div>
        <aside style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Fact label="Goal">{agent.goal || agent.description || '—'}</Fact>
          <Fact label="Engine">{[agent.provider ?? 'claude', agent.model].filter(Boolean).join(' · ')}</Fact>
          <Fact label="Usage">
            {dir ? `${fmtTokens(dir.tokens)} tokens · $${dir.usd.toFixed(2)}` : '—'}
            <div className="pro-sub" style={{ fontSize: 12 }}>{cap ? `cap ${fmtTokens(cap)}` : 'workspace budget'}</div>
          </Fact>
          <Fact label="Capabilities">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {servers.length ? servers.map((id) => <span key={id} className="pro-chip">{mcpLabel(id)}</span>) : '—'}
            </div>
            <button className="pro-btn" style={{ marginTop: 8 }} onClick={() => setView({ kind: 'section', section: 'capabilities' })}>Manage</button>
          </Fact>
          {agent.worktreePath && <Fact label="Worktree"><span className="pro-mono" style={{ wordBreak: 'break-all' }}>{agent.worktreePath}</span></Fact>}
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pro-card" style={{ padding: '10px 12px', fontSize: 13 }}>
      <div className="pro-sub" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

/** God on the left, a dashed line to every agent with work in progress (a ticket
 *  in `doing`, or busy right now), each labelled with that ticket: yellow while
 *  the agent is at it, light green otherwise. The floor spend under it. */
function RoutingMap({ god, roster, tasks, directory, config, onOpen }: Omit<Props, 'agent'> & { god: Agent }) {
  const others = roster.filter((a) => !a.isGod && (isActive(a) || currentTicket(tasks, a.id)?.status === 'doing'));
  const spend = spendLine(directory, config);
  const breaker = directory[god.id]?.breaker || 'healthy';
  const godTicket = currentTicket(tasks, god.id);
  const rowH = 44;
  const h = Math.max(120, others.length * rowH + 16);
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ position: 'relative', height: h }}>
        <svg width="100%" height={h} style={{ position: 'absolute', inset: 0 }} aria-hidden="true" preserveAspectRatio="none" viewBox={`0 0 100 ${h}`}>
          {others.map((a, i) => (
            <line key={a.id} x1={22} y1={h / 2} x2={62} y2={8 + i * rowH + rowH / 2}
              stroke="var(--cth-ink-300)" strokeDasharray="2 2" strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <button className="pro-card" onClick={() => onOpen(god.id)}
          style={{ position: 'absolute', insetInlineStart: '4%', top: h / 2 - 42, width: '18%', minWidth: 110, height: 84, background: 'var(--cth-lemon-light)', borderColor: 'var(--cth-lemon)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          {godTicket?.key && <TicketChip id={godTicket.key} live={isActive(god)} />}
          <Avatar agent={god} />
          <strong style={{ fontSize: 13 }}>{god.name}</strong>
        </button>
        {others.map((a, i) => {
          const t = currentTicket(tasks, a.id);
          return (
            <button key={a.id} className="pro-card" onClick={() => onOpen(a.id)}
              style={{ position: 'absolute', insetInlineStart: '62%', top: 8 + i * rowH + 2, height: rowH - 6, width: '34%', padding: '0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar agent={a} />
              <strong style={{ fontSize: 13 }}>{a.name}</strong>
              {t?.key && <span style={{ marginInlineStart: 'auto' }}><TicketChip id={t.key} live={isActive(a)} /></span>}
            </button>
          );
        })}
      </div>
      <div className="pro-card" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="pro-row" style={{ fontSize: 13 }}>
          <span>{spend.main} <span className="pro-sub">{spend.sub}</span></span>
          <span className="pro-badge" style={{ marginInlineStart: 'auto', background: breaker === 'healthy' ? 'var(--cth-mint-light)' : 'var(--cth-coral-light)' }}>
            <span className="pro-dot" style={{ background: breaker === 'healthy' ? 'var(--cth-mint)' : 'var(--cth-coral)' }} /> Circuit breaker
          </span>
        </div>
        <Bar value={spend.ratio} tone={spend.ratio > 0.85 ? 'red' : 'gold'} />
      </div>
      {others.length === 0 && <p className="pro-sub" style={{ margin: 0 }}>Nobody has work in progress right now.</p>}
    </section>
  );
}

/** A ticket key on the map: yellow while its agent is working on it. */
function TicketChip({ id, live }: { id: string; live: boolean }) {
  return (
    <span className="pro-chip" style={{
      borderColor: live ? 'var(--cth-lemon)' : 'var(--cth-mint)',
      background: live ? 'var(--cth-lemon-light)' : 'var(--cth-mint-light)',
      color: 'var(--cth-ink-900)'
    }}>{id}</span>
  );
}
