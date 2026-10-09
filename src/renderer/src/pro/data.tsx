import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { useStore, type Agent } from '@/store/store';
import { SpritePortrait } from '@/components/SpritePortrait';
import { loadKeyedTasks, waitsOnHuman, type HiveTask } from '@/components/TasksKanban';
import { terminalTail } from '@/components/terminalPool';

/**
 * Pro's read layer. Every screen polls the same main-process sources the
 * Classic panels use (hive:tasks, hive:agentDirectory, workers:list …); nothing
 * here writes, and nothing needs new data beyond ticket keys and MCP grants.
 */

/** Poll `load` every `ms` while mounted. Errors keep the last good value. */
export function usePoll<T>(load: () => Promise<T>, ms: number, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let alive = true;
    const tick = () => {
      loadRef.current().then((v) => { if (alive) setValue(v); }).catch(() => { /* keep last */ });
    };
    tick();
    const t = setInterval(tick, ms);
    return () => { alive = false; clearInterval(t); };
  }, [ms]);
  return value;
}

/** An agent's last terminal lines, re-read every 1.5 s. */
export function useTerminalTail(ptyId: string | undefined, max = 3): string[] {
  return usePoll(() => Promise.resolve(terminalTail(ptyId, max)), 1500, [] as string[]);
}

export interface KeyedTask extends HiveTask {
  key?: string;
}

/** The board with its ticket keys, polled every 5 s (the Classic kanban's cadence). */
export function useTasks(): KeyedTask[] {
  return usePoll(loadKeyedTasks, 5000, [] as KeyedTask[]);
}

// Types flow from the typed `window.cth` global, as elsewhere in the renderer,
// so there is no cross-package import of the preload module.
type AgentDirectory = Awaited<ReturnType<typeof window.cth.hiveAgentDirectory>>;
export type AgentDirectoryEntry = AgentDirectory['agents'][number];
export type WorkerList = Awaited<ReturnType<typeof window.cth.listWorkers>>;

const EMPTY_DIRECTORY: AgentDirectory = { godId: null, agents: [] };

/** Per-agent tokens, spend, breaker and inbox backlog, polled every 4 s. */
export function useDirectory(): Record<string, AgentDirectoryEntry> {
  const dir = usePoll(() => window.cth.hiveAgentDirectory(), 4000, EMPTY_DIRECTORY);
  const out: Record<string, AgentDirectoryEntry> = {};
  for (const a of dir.agents) out[a.id] = a;
  return out;
}

/** Live agents in sidebar order: the orchestrator first, the prep assistant
 *  hidden (it is send-only and has nothing to show). */
export function useRoster(): Agent[] {
  const agents = useStore((s) => s.agents);
  return agents
    .filter((a) => !a.isAssistant)
    .slice()
    .sort((a, b) => Number(!!b.isGod) - Number(!!a.isGod));
}

export type Tone = 'green' | 'blue' | 'amber' | 'gold' | 'red' | 'grey';

export const TONE_COLOR: Record<Tone, string> = {
  green: 'var(--cth-mint)',
  blue: 'var(--cth-sky)',
  amber: 'var(--cth-peach)',
  gold: 'var(--cth-lemon)',
  red: 'var(--cth-coral)',
  grey: 'var(--cth-status-idle)'
};

const TONE_BG: Record<Tone, string> = {
  green: 'var(--cth-mint-light)',
  blue: 'var(--cth-sky-light)',
  amber: 'var(--cth-peach-light)',
  gold: 'var(--cth-lemon-light)',
  red: 'var(--cth-coral-light)',
  grey: 'var(--cth-cream-200)'
};

/** The four states the Pro cards speak, from the richer Classic status set. */
export function agentState(a: Agent, asksYou: boolean): { label: string; tone: Tone } {
  if (asksYou || a.status === 'blocked' || a.status === 'waiting') return { label: 'Needs you', tone: 'amber' };
  switch (a.status) {
    case 'working':
    case 'typing':
      return { label: 'Working', tone: 'green' };
    case 'thinking':
    case 'compacting':
      return { label: 'Thinking', tone: 'blue' };
    case 'looping':
      return { label: 'Breaker', tone: 'red' };
    case 'success':
      return { label: 'Done', tone: 'green' };
    default:
      return { label: 'Idle', tone: 'grey' };
  }
}

/** Is the agent doing something right now (vs idle / done / gone)? Drives the
 *  sidebar's green-or-grey dot and who appears on the orchestrator's map. */
export function isActive(a: Agent): boolean {
  return ['working', 'typing', 'thinking', 'compacting', 'looping'].includes(a.status);
}

/** Agent ids with an open question on the board (the "Asked you" marker). */
export function askingAgents(tasks: HiveTask[]): Set<string> {
  const out = new Set<string>();
  for (const t of tasks) if (waitsOnHuman(t) && t.assignee) out.add(t.assignee);
  return out;
}

/** agentState's labels → their i18n keys (`pro.state.*`). */
const STATE_KEY: Record<string, string> = { 'Needs you': 'needsYou', Working: 'working', Thinking: 'thinking', Breaker: 'breaker', Done: 'done', Idle: 'idle', Stopped: 'stopped' };

/** Marks the orchestrator (the "god agent") wherever agents are listed, so it
 *  never reads as just another worker. `star` is the one-glyph form for tight
 *  rows; the tooltip says what the role is either way. */
export function GodBadge({ star = false }: { star?: boolean }) {
  const { t } = useTranslation();
  const tip = t('pro.god.tip');
  if (star) return <span className="pro-god-star" title={tip} aria-label={t('pro.god.badge')}>★</span>;
  return <span className="pro-badge pro-badge-god" title={tip}>★ {t('pro.god.badge')} <span className="pro-badge-god-sub">· god agent</span></span>;
}

/** The same state as StateBadge, as a quiet line (a dot and a word) for dense rows. */
export function StateLine({ label, tone }: { label: string; tone: Tone }) {
  const { t } = useTranslation();
  const key = STATE_KEY[label];
  return (
    <span className="pro-state-line">
      <span className="pro-dot" style={{ background: TONE_COLOR[tone] }} /> {key ? t(`pro.state.${key}`) : label}
    </span>
  );
}

export function StateBadge({ label, tone }: { label: string; tone: Tone }) {
  const { t } = useTranslation();
  const key = STATE_KEY[label];
  label = key ? t(`pro.state.${key}`) : label;
  return (
    <span className="pro-badge" style={{ background: TONE_BG[tone], color: 'var(--cth-ink-900)' }}>
      <span className="pro-dot" style={{ background: TONE_COLOR[tone] }} /> {label}
    </span>
  );
}

export function Avatar({ agent, scale = 1 }: { agent: Pick<Agent, 'character'> | undefined; scale?: number }) {
  if (!agent) return <span style={{ width: 16 * scale, height: 16 * scale, display: 'inline-block' }} />;
  return (
    <span style={{ display: 'inline-flex', flexShrink: 0, lineHeight: 0 }}>
      <SpritePortrait character={agent.character} scale={scale} />
    </span>
  );
}

export function Bar({ value, tone = 'green', indeterminate = false }: { value: number; tone?: Tone; indeterminate?: boolean }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`pro-bar${indeterminate ? ' pro-bar-indet' : ''}`}>
      <span style={{ width: `${pct}%`, background: TONE_COLOR[tone] }} />
    </div>
  );
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}
