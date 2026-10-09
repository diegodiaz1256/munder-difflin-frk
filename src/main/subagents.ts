/**
 * Subagents: when an agent's Claude starts one (its Task/Agent tool), the app
 * sees it only through that agent's hooks, as one tool call that starts
 * (PreToolUse) and later returns (PostToolUse / PostToolUseFailure). There is
 * no terminal of its own to show, so Temps lists them from here: what it was
 * asked, which kind of subagent, who called it, and how long it ran.
 *
 * Electron-free and kept in memory only (they are short-lived and belong to a
 * running session).
 */
export interface SubagentRun {
  /** The tool call's id, or a made-up one when the CLI does not send it. */
  id: string;
  /** The agent that started it. */
  parentId: string;
  /** The subagent type the caller asked for ("general-purpose", "Explore", …). */
  type: string;
  /** What it was asked to do, short. */
  description: string;
  startedAt: number;
  endedAt?: number;
  /** false when the tool call failed. */
  ok?: boolean;
}

export const SUBAGENT_TOOLS = new Set(['Task', 'Agent']);
const KEEP_ENDED_MS = 2 * 60 * 60_000;
const MAX_ENDED = 50;

function short(s: string, n: number): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1).trimEnd()}…` : one;
}

export class SubagentTracker {
  private runs = new Map<string, SubagentRun>();
  private seq = 0;

  /** Feed one hook event; returns true when the list changed. */
  onHook(agentId: string | undefined, event: string, p: { tool_name?: string; tool_input?: unknown; tool_use_id?: string }, now = Date.now()): boolean {
    if (!agentId || !p.tool_name || !SUBAGENT_TOOLS.has(p.tool_name)) return false;
    const input = (p.tool_input && typeof p.tool_input === 'object' ? p.tool_input : {}) as Record<string, unknown>;
    const description = typeof input.description === 'string' && input.description.trim()
      ? input.description
      : typeof input.prompt === 'string' ? input.prompt.split('\n')[0] : '';
    if (event === 'PreToolUse') {
      const id = typeof p.tool_use_id === 'string' && p.tool_use_id ? p.tool_use_id : `${agentId}:${now}:${++this.seq}`;
      if (this.runs.has(id)) return false;
      this.runs.set(id, {
        id, parentId: agentId,
        type: typeof input.subagent_type === 'string' && input.subagent_type.trim() ? input.subagent_type.trim() : 'general-purpose',
        description: short(description || '(no description)', 160),
        startedAt: now
      });
      this.prune(now);
      return true;
    }
    if (event === 'PostToolUse' || event === 'PostToolUseFailure') {
      // By id when the CLI sends one; else the oldest open run of that caller
      // with the same description (or, failing that, its oldest open run).
      let run = typeof p.tool_use_id === 'string' ? this.runs.get(p.tool_use_id) : undefined;
      if (!run || run.endedAt) {
        const open = [...this.runs.values()].filter((r) => r.parentId === agentId && !r.endedAt).sort((a, b) => a.startedAt - b.startedAt);
        const want = short(description || '(no description)', 160);
        run = open.find((r) => r.description === want) ?? open[0];
      }
      if (!run) return false;
      run.endedAt = now;
      run.ok = event === 'PostToolUse';
      return true;
    }
    return false;
  }

  /** The caller left (exited, archived): its open subagents ended with it. */
  endFor(agentId: string, now = Date.now()): boolean {
    let changed = false;
    for (const r of this.runs.values()) if (r.parentId === agentId && !r.endedAt) { r.endedAt = now; r.ok = false; changed = true; }
    return changed;
  }

  /** Running ones first (oldest first), then the recently ended (newest first). */
  list(now = Date.now()): SubagentRun[] {
    this.prune(now);
    const all = [...this.runs.values()].map((r) => ({ ...r }));
    const running = all.filter((r) => !r.endedAt).sort((a, b) => a.startedAt - b.startedAt);
    const ended = all.filter((r) => r.endedAt).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
    return [...running, ...ended];
  }

  private prune(now: number): void {
    const ended = [...this.runs.values()].filter((r) => r.endedAt).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
    ended.forEach((r, i) => { if (i >= MAX_ENDED || now - (r.endedAt ?? now) > KEEP_ENDED_MS) this.runs.delete(r.id); });
  }
}
