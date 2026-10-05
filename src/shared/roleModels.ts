/**
 * Model and effort per kind of agent: the orchestrator, your own agents (the
 * ones you or a hire added), and temps (one-job workers the orchestrator starts).
 * Without an effort, Claude Code uses its own default, which is often "high":
 * slow and dear for a temp that renames a file. Claude Code only (--effort).
 */

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];
export type AgentKind = 'god' | 'agent' | 'temp';

export interface RoleModelConfig {
  godModel?: string;
  defaultModel?: string;
  tempModel?: string;
  roleEffort?: Partial<Record<AgentKind, Effort>>;
}

export function isEffort(v: unknown): v is Effort {
  return typeof v === 'string' && (EFFORTS as readonly string[]).includes(v);
}

export function agentKind(meta: { isGod?: boolean } | undefined, temp?: boolean): AgentKind {
  return meta?.isGod ? 'god' : temp ? 'temp' : 'agent';
}

/** The effort flag to add for this kind, unless the command already sets one. */
export function effortArgs(args: string[], kind: AgentKind, cfg: RoleModelConfig): string[] {
  if (args.some((a) => a === '--effort' || a.startsWith('--effort='))) return [];
  const e = cfg.roleEffort?.[kind];
  return isEffort(e) ? ['--effort', e] : [];
}
