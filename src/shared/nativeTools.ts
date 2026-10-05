/**
 * Claude Code's own tools, as capabilities you can take away per agent
 * (Capabilities → Who has what). MCP grants only cover servers; an agent
 * without the Brave server still searched the web with Claude's WebSearch.
 * Blocked groups become --disallowedTools at spawn. File editing is not
 * offered: an agent that cannot write cannot post to its outbox either.
 */

export interface NativeToolGroup { id: string; label: string; description: string; tools: string[] }

export const NATIVE_TOOL_GROUPS: NativeToolGroup[] = [
  { id: 'web', label: 'Web', description: "Web search and page fetch: Claude's own (WebSearch, WebFetch) and the Fetch and Web Search servers. With Shell on, commands can still reach the web.", tools: ['WebSearch', 'WebFetch'] },
  { id: 'shell', label: 'Shell', description: 'Run commands (Bash, PowerShell)', tools: ['Bash', 'PowerShell'] },
  { id: 'subagents', label: 'Sub-agents', description: "Claude's own helpers inside the session, which the office never sees (Agent, Task)", tools: ['Agent', 'Task'] }
];

/** Keep only known group ids, once each. */
export function cleanToolBlocks(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const known = new Set(NATIVE_TOOL_GROUPS.map((g) => g.id));
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && known.has(x)))];
}

/** The tool names to pass to --disallowedTools. The orchestrator never gets
 *  sub-agents: it delegates through the office. */
export function disallowedTools(blocked: unknown, isGod: boolean): string[] {
  const groups = new Set(cleanToolBlocks(blocked));
  if (isGod) groups.add('subagents');
  return NATIVE_TOOL_GROUPS.filter((g) => groups.has(g.id)).flatMap((g) => g.tools);
}

/** MCP catalog servers whose job is reading the open web. Taking Web away
 *  drops them too: with only WebSearch/WebFetch blocked, an agent asked to
 *  search went through the Fetch server instead (seen live). */
export const WEB_MCP_SERVERS: readonly string[] = ['fetch', 'search-with-key'];

/** Catalog ids this agent must not get because of its blocked groups. */
export function blockedMcpServers(blocked: unknown): Set<string> {
  return new Set(cleanToolBlocks(blocked).includes('web') ? WEB_MCP_SERVERS : []);
}
