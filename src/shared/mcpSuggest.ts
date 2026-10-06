/**
 * Does an MCP server found on this machine (or added by an agent) match
 * something the app already manages? A GitHub server with a token is the GitHub
 * Connection; pointing the agent at the Connection gets it the same tools with
 * the key held by the app, a role's read/write limits and a Test button — so
 * that is what we recommend instead of importing the raw server.
 */
import { MCP_CATALOG, type McpCatalogEntry } from './mcpCatalog';

export interface McpSuggestion {
  /** `connection`: keyed catalog service (Connections). `builtin`: already shipped, no key. */
  kind: 'connection' | 'builtin';
  id: string;
  label: string;
}

/** `@scope/pkg@1.2.3` → `@scope/pkg`; flags and placeholders → ''. */
function pkgOf(arg: string): string {
  if (!arg || arg.startsWith('-') || arg.includes('<')) return '';
  const at = arg.lastIndexOf('@');
  return at > 0 ? arg.slice(0, at) : arg;
}

function matches(e: McpCatalogEntry, command: string, args: string[], envNames: string[]): boolean {
  const mine = new Set(e.spec.args.map(pkgOf).filter(Boolean));
  const theirs = args.map(pkgOf).filter(Boolean);
  // The same package (npx/uvx name) is the same server.
  if (theirs.some((p) => mine.has(p) && p.length > 3)) return true;
  // A keyed server with the very same credential variable(s).
  const secrets = (e.secrets ?? []).map((s) => s.env);
  if (secrets.length && secrets.some((s) => envNames.includes(s)) && command === e.spec.command) return true;
  return false;
}

export function suggestFor(
  transport: { kind: 'stdio'; command: string; args: string[] } | { kind: 'http'; url: string },
  envNames: string[]
): McpSuggestion | null {
  if (transport.kind !== 'stdio') return null;
  // Keyed services first: they are the ones worth steering to Connections.
  const ordered = [...MCP_CATALOG].sort((a, b) => Number((b.secrets ?? []).length > 0) - Number((a.secrets ?? []).length > 0));
  for (const e of ordered) {
    if (matches(e, transport.command, transport.args, envNames)) {
      return { kind: (e.secrets ?? []).length > 0 ? 'connection' : 'builtin', id: e.id, label: e.label };
    }
  }
  return null;
}
