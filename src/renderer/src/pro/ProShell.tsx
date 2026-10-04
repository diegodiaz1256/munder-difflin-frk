import { useMemo } from 'react';
import type { HarnessConfig } from '@/store/config';
import { useStore } from '@/store/store';
import { ProIcon, type ProIconName } from './ProIcon';
import { waitsOnHuman } from '@/components/TasksKanban';
import { useRestoreTeam } from '@/hooks/useRestoreTeam';
import { useProStore, type ProSection } from './proStore';
import { Avatar, TONE_COLOR, askingAgents, isActive, useDirectory, useRoster, useTasks } from './data';
import { TasksView } from './TasksView';
import { InboxView } from './InboxView';
import { AutomationsView } from './AutomationsView';
import { MemoryView } from './MemoryView';
import { CapabilitiesView } from './CapabilitiesView';
import { AgentsView } from './AgentsView';
import { AgentView } from './AgentView';
import { TempsView } from './TempsView';
import { ConnectionsView } from './ConnectionsView';
import './pro.css';

const TOP: { id: ProSection; label: string; icon: ProIconName }[] = [
  { id: 'tasks', label: 'Tasks', icon: 'tasks' },
  { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'automations', label: 'Automations', icon: 'automations' },
  { id: 'memory', label: 'Memory', icon: 'memory' },
  { id: 'capabilities', label: 'Capabilities', icon: 'capabilities' },
  { id: 'connections', label: 'Connections', icon: 'connections' }
];

/**
 * PRO — the office in a sidebar, one screen at a time. Replaces the Classic
 * floor + detail sidebar + agent strip when the title-bar switch says PRO; the
 * hive underneath (god, routing, PTYs, queues) is the same one, so switching
 * back and forth never touches a running agent.
 */
export function ProShell({ config }: { config: HarnessConfig }) {
  const view = useProStore((s) => s.view);
  const setView = useProStore((s) => s.setView);
  const roster = useRoster();
  const tasks = useTasks();
  const directory = useDirectory();
  const asking = useMemo(() => askingAgents(tasks), [tasks]);
  const openAsks = tasks.filter(waitsOnHuman).length;
  const god = roster.find((a) => a.isGod);
  // The boot-time "restore your team" lives in this hook, and Classic mounts it
  // from the agent strip — which PRO replaces. Without it here, opening the app
  // in PRO left every worker from the last session unrestored.
  useRestoreTeam(config);

  // An agent view whose agent left the floor falls back to the roster.
  const agentInView = view.kind === 'agent' ? roster.find((a) => a.id === view.agentId) : undefined;
  const section: ProSection | null = view.kind === 'section' ? view.section : agentInView ? null : 'agents';

  const go = (s: ProSection) => setView({ kind: 'section', section: s });
  const openAgent = (id: string) => {
    useStore.getState().select(id);
    setView({ kind: 'agent', agentId: id });
  };

  let page: JSX.Element;
  switch (section) {
    case 'tasks': page = <TasksView tasks={tasks} roster={roster} />; break;
    case 'inbox': page = <InboxView tasks={tasks} />; break;
    case 'automations': page = <AutomationsView />; break;
    case 'memory': page = <MemoryView tasks={tasks} roster={roster} />; break;
    case 'capabilities': page = <CapabilitiesView roster={roster} config={config} />; break;
    case 'temps': page = <TempsView roster={roster} />; break;
    case 'connections': page = <ConnectionsView roster={roster} />; break;
    case 'agents': page = <AgentsView roster={roster} tasks={tasks} directory={directory} asking={asking} config={config} onOpen={openAgent} />; break;
    default: page = <AgentView agent={agentInView!} roster={roster} tasks={tasks} directory={directory} config={config} onOpen={openAgent} />;
  }

  return (
    <div className="pro-root">
      <nav className="pro-side" aria-label="Pro navigation">
        <div className="pro-brand">
          <Avatar agent={god} />
          <span>Munder Difflin</span>
        </div>
        {TOP.map((item) => (
          <button key={item.id} className="pro-nav" aria-current={section === item.id} onClick={() => go(item.id)}>
            <ProIcon name={item.icon} /> {item.label}
            {item.id === 'inbox' && openAsks > 0 && <span className="pro-nav-end"><span className="pro-count">{openAsks}</span></span>}
          </button>
        ))}

        <div className="pro-side-label">Agents</div>
        <button className="pro-nav" aria-current={section === 'agents'} onClick={() => go('agents')}>
          <ProIcon name="agents" /> Agents
          <span className="pro-nav-end pro-sub" style={{ fontSize: 11 }}>
            {roster.filter(isActive).length} active
          </span>
        </button>
        {roster.map((a) => {
          const active = isActive(a);
          const ctx = a.contextTokens && a.contextLimit ? Math.round((a.contextTokens / a.contextLimit) * 100) : null;
          return (
            <button
              key={a.id}
              className="pro-nav"
              style={{ paddingBlock: 3 }}
              aria-current={view.kind === 'agent' && view.agentId === a.id}
              onClick={() => openAgent(a.id)}
              title={a.description}
            >
              <Avatar agent={a} />
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: '15px' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                <span className="pro-sub" style={{ fontSize: 11 }}>
                  {asking.has(a.id) ? 'Asked you' : ctx !== null ? `ctx ${ctx}%` : a.isGod ? 'orchestrator' : (a.model ?? a.provider ?? 'agent')}
                </span>
              </span>
              <span className="pro-nav-end">
                <span className="pro-dot" style={{ background: TONE_COLOR[active ? 'green' : 'grey'] }} title={active ? 'Active' : 'Idle'} />
              </span>
            </button>
          );
        })}
        <button className="pro-nav" style={{ marginTop: 4 }} aria-current={section === 'temps'} onClick={() => go('temps')}>
          <ProIcon name="temps" /> Temps
        </button>
      </nav>
      <main className="pro-main">{page}</main>
    </div>
  );
}

/** Classic / PRO switch for the title bar. */
export function LayoutSwitch() {
  const layout = useProStore((s) => s.layout);
  const setLayout = useProStore((s) => s.setLayout);
  return (
    <div className="pro-switch cth-titlebar-nodrag" role="group" aria-label="Layout">
      <button aria-pressed={layout === 'classic'} onClick={() => setLayout('classic')}>Classic</button>
      <button aria-pressed={layout === 'pro'} onClick={() => setLayout('pro')}>PRO</button>
    </div>
  );
}
