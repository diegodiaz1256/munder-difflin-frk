/**
 * What an agent may DO with a connection. Two levels meet:
 *
 *   ceiling  the human's cap on the connection itself (Connections). No role can
 *            exceed it. Absent = read-only: a connection that nobody configured
 *            can look but never change anything.
 *   role     what the agent's role grants for that service (Capabilities).
 *
 * The effective access is the lower of the two. The MCP gateway enforces it on
 * every tool call, whatever CLI the agent runs.
 */
export type Access = 'none' | 'read' | 'readwrite';

/** Levels a role or a ceiling can be set to by the human. */
export const ACCESS_LEVELS: Access[] = ['none', 'read', 'readwrite'];

const RANK: Record<Access, number> = { none: 0, read: 1, readwrite: 2 };

export const isAccess = (v: unknown): v is Access => v === 'none' || v === 'read' || v === 'readwrite';

export function minAccess(a: Access, b: Access): Access {
  return RANK[a] <= RANK[b] ? a : b;
}

/** A connection nobody set a ceiling on. */
export const DEFAULT_CEILING: Access = 'read';

/** An agent that has no access record (set up before roles carried access, or
 *  never given a role) keeps the connections it had, but read-only. */
export const ROLELESS_ACCESS: Access = 'read';

/**
 * The agent's effective access to one connection.
 * @param ceiling   the connection's cap (undefined → DEFAULT_CEILING)
 * @param record    the agent's access record, service → level (undefined → no record)
 * @param service   the connection's service id
 */
export function effectiveAccess(ceiling: Access | undefined, record: Record<string, Access> | undefined, service: string): Access {
  const cap = ceiling ?? DEFAULT_CEILING;
  const role = record ? (record[service] ?? 'none') : ROLELESS_ACCESS;
  return minAccess(cap, role);
}

/** Validate a service → level map; unknown levels are dropped, not repaired. */
export function cleanAccessMap(raw: unknown, validServices?: Set<string>): Record<string, Access> {
  const out: Record<string, Access> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isAccess(v) && (!validServices || validServices.has(k))) out[k] = v;
  }
  return out;
}

// ─── which tools only look ───────────────────────────────────────────────────
// Fail closed: a tool counts as read-only only when we can say so. Anything we
// do not recognise is treated as a write.

interface ToolAnnotations { readOnlyHint?: boolean; destructiveHint?: boolean }

/** Names that only fetch, shared by every service's server. */
const READ_NAME = /^(get|list|search|read|describe|explain|find|view|fetch|whoami|retrieve)([_-]|$)/i;

/** Per-service read-only tools that do not follow the naming rule. */
const READ_TOOLS: Record<string, RegExp> = {
  // postgres-mcp runs with --access-mode=restricted: execute_sql is read-only there.
  db: /^(execute_sql|explain_query|analyze_[a-z_]+|list_[a-z_]+|get_[a-z_]+)$/i,
  'search-with-key': /^brave_(web|local|news|image|video)_search$/i,
  // Notion's server names its tools API-<verb>-…
  notion: /^API-(get|retrieve|query|list|post-search)([_-]|$)/i
};

export function isReadTool(service: string, name: string, ann?: ToolAnnotations): boolean {
  if (ann?.destructiveHint === true) return false;
  if (ann?.readOnlyHint === true) return true;
  return READ_NAME.test(name) || !!READ_TOOLS[service]?.test(name);
}

/** The tools a `tools/list` result may show at this access level. */
export function filterTools<T extends { name?: unknown; annotations?: ToolAnnotations }>(service: string, tools: T[], access: Access): T[] {
  if (access === 'readwrite') return tools;
  if (access === 'none') return [];
  return tools.filter((t) => typeof t.name === 'string' && isReadTool(service, t.name, t.annotations));
}
