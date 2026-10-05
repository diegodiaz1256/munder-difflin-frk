/**
 * Claude Code's own tools, as capabilities you can take away per agent
 * (Capabilities → Who has what). MCP grants only cover servers; an agent
 * without the Brave server still searched the web with Claude's WebSearch.
 * Blocked groups become --disallowedTools at spawn. File editing is not
 * offered: an agent that cannot write cannot post to its outbox either.
 */

export interface NativeToolGroup { id: string; label: string; description: string; tools: string[] }

export const NATIVE_TOOL_GROUPS: NativeToolGroup[] = [
  { id: 'web', label: 'Web', description: "Claude's own web search and page fetch (WebSearch, WebFetch)", tools: ['WebSearch', 'WebFetch'] },
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
