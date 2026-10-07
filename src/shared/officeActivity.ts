/**
 * "Now": what is happening in the office, as sentences anyone can follow.
 * The pieces existed but were scattered (each agent's steps inside its own
 * page, messages in the inbox, crashes in a log file), so it was hard to tell
 * what the office was doing. This turns the office log and the agents' tool
 * steps into one list of items: who, what, when.
 *
 * Pure: items carry an i18n key and its parameters; the page translates them.
 */
import { canonicalTool, describeTool, summarizeToolInput, type StepGroup } from './agentSteps';

export type ActivityKind = 'step' | 'message' | 'join' | 'leave' | 'problem';

export interface ActivityItem {
  /** Stable for de-duplication. */
  id: string;
  ts: number;
  kind: ActivityKind;
  agentId?: string;
  /** i18n key under pro.now.*, and its parameters. */
  key: string;
  params: Record<string, string>;
  /** Steps: which tool group (for the icon). */
  group?: StepGroup;
}

type Name = (id: string) => string;

/** The scheduler's own mail is noise here. */
const SYSTEM_SENDERS = new Set(['scheduler', 'heartbeat', 'system', 'breaker']);

const clip = (s: unknown, n = 140): string => {
  const t = typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '';
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** One log.jsonl entry → an item, or null for bookkeeping. */
export function activityFromLog(e: Record<string, unknown>, name: Name): ActivityItem | null {
  const ts = typeof e.ts === 'number' ? e.ts : 0;
  if (!ts) return null;
  const kind = String(e.kind ?? '');
  const id = `log:${ts}:${kind}:${String(e.id ?? e.agentId ?? '')}`;
  if (kind === 'message') {
    const from = String(e.from ?? '');
    if (SYSTEM_SENDERS.has(from)) return null;
    const to = String(e.to ?? '');
    const act = String(e.act ?? 'inform');
    const key = act === 'done' ? 'msgDone' : act === 'request' || act === 'query' || act === 'propose' ? 'msgAsk' : 'msgInform';
    return { id, ts, kind: 'message', agentId: from, key, params: { from: name(from), to: to === 'broadcast' ? '*' : name(to), subject: clip(e.subject) } };
  }
  if (kind === 'spawn') return { id, ts, kind: 'join', agentId: String(e.agentId ?? ''), key: 'joined', params: { who: String(e.name ?? name(String(e.agentId ?? ''))) } };
  if (kind === 'archive' && e.archived !== false) return { id, ts, kind: 'leave', agentId: String(e.agentId ?? ''), key: 'left', params: { who: name(String(e.agentId ?? '')) } };
  if (kind === 'agent-exit') {
    const code = e.signal ? String(e.signal) : String(e.exitCode ?? '?');
    return { id, ts, kind: 'problem', agentId: String(e.agentId ?? ''), key: 'crashed', params: { who: name(String(e.agentId ?? '')), code } };
  }
  if (kind === 'proxy-degraded' || kind === 'spawn-failed') {
    return { id, ts, kind: 'problem', agentId: String(e.agentId ?? ''), key: 'degraded', params: { who: name(String(e.agentId ?? '')) } };
  }
  return null;
}

/** One hook event → a step item (the start of a tool call), or null. */
export function activityFromStep(e: { agentId?: string; event?: string; tool?: string; detail?: string; input?: unknown; ts?: number }, name: Name): ActivityItem | null {
  if (e.event !== 'PreToolUse' || !e.tool || !e.agentId) return null;
  const ts = typeof e.ts === 'number' ? e.ts : Date.now();
  const { group } = describeTool(e.tool);
  return {
    id: `step:${e.agentId}:${ts}:${e.tool}`,
    ts,
    kind: 'step',
    agentId: e.agentId,
    key: `tool_${canonicalTool(e.tool)}`,
    params: { who: name(e.agentId), detail: tidyDetail(e.detail ?? summarizeToolInput(e.tool, e.input)), tool: describeTool(e.tool).label },
    group
  };
}

/** A command's leading `cd "<long path>" &&` (or `;`) says nothing a person needs. */
export function tidyDetail(detail: string): string {
  return detail.replace(/^cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*(?:&&|;)\s*/, '');
}

/** Merge new items into a list: newest first, no duplicates, at most `max`. */
export function mergeActivity(list: ActivityItem[], add: ActivityItem[], max = 300): ActivityItem[] {
  const seen = new Set(list.map((i) => i.id));
  const fresh = add.filter((i) => !seen.has(i.id));
  if (!fresh.length) return list;
  return [...fresh, ...list].sort((a, b) => b.ts - a.ts).slice(0, max);
}

/** What an agent is doing right now, from its latest step (null if it is older than `freshMs`). */
export function currentStep(items: ActivityItem[], agentId: string, now: number, freshMs = 120_000): ActivityItem | null {
  for (const i of items) {
    if (i.agentId !== agentId) continue;
    if (i.kind !== 'step') return null;
    return now - i.ts <= freshMs ? i : null;
  }
  return null;
}

/** The terminal said its process ended: "— process exited (code 1) —". */
export function exitedCode(tail: string): string | null {
  const m = /process exited \((?:code )?([^),]+)/i.exec(tail);
  return m ? m[1].trim() : null;
}

/** A feed row: one item, or several folded into one line. */
export type ActivityRow =
  | { kind: 'item'; item: ActivityItem; repeat: number }
  | { kind: 'roster'; ts: number; joined: string[]; left: string[] };

/**
 * The Now feed without the noise: agents joining or leaving within a minute of
 * each other become one "restarted" line (a relaunch made a dozen), and the
 * same sentence from the same agent in a row becomes one line with a count
 * (thirty "[hire manifest rejected]" did). `items` are newest first.
 */
export function groupActivity(items: readonly ActivityItem[], windowMs = 60_000): ActivityRow[] {
  const out: ActivityRow[] = [];
  const label = (i: ActivityItem) => i.params.name ?? i.params.who ?? i.agentId ?? '?';
  for (const i of items) {
    const prev = out[out.length - 1];
    if (i.kind === 'join' || i.kind === 'leave') {
      if (prev?.kind === 'roster' && prev.ts - i.ts <= windowMs) {
        const list = i.kind === 'join' ? prev.joined : prev.left;
        if (!list.includes(label(i))) list.push(label(i));
        continue;
      }
      out.push({ kind: 'roster', ts: i.ts, joined: i.kind === 'join' ? [label(i)] : [], left: i.kind === 'leave' ? [label(i)] : [] });
      continue;
    }
    if (prev?.kind === 'item' && prev.item.kind === i.kind && prev.item.key === i.key && prev.item.agentId === i.agentId
      && JSON.stringify(prev.item.params) === JSON.stringify(i.params)) {
      prev.repeat++;
      continue;
    }
    out.push({ kind: 'item', item: i, repeat: 1 });
  }
  return out;
}
