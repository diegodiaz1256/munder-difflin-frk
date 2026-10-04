/**
 * Role bundles — one-click sets of MCP servers for a kind of job, granted per
 * agent from the Pro Capabilities screen.
 *
 * Every id is an `MCP_CATALOG` id. A grant only lists servers; it never
 * bypasses consent: a write or secret server in a bundle still runs only once
 * the user has switched it on (and given its key) in Settings, see
 * `buildDefaultMcpServers` in hive.ts.
 */
import { MCP_CATALOG } from './mcpCatalog';

export interface RoleBundle {
  id: string;
  label: string;
  /** Icon name from the renderer's pixel icon set. */
  icon: 'sparkle' | 'code' | 'ledger' | 'sidebar';
  servers: string[];
}

export const ROLE_BUNDLES: RoleBundle[] = [
  { id: 'designer', label: 'Designer', icon: 'sparkle', servers: ['context7', 'filesystem'] },
  { id: 'software-engineer', label: 'Software Engineer', icon: 'code', servers: ['git', 'github-token', 'db'] },
  { id: 'product-manager', label: 'Product Manager', icon: 'ledger', servers: ['github-token', 'email-calendar', 'search-with-key'] },
  { id: 'frontend-developer', label: 'Frontend Developer', icon: 'sidebar', servers: ['git', 'github-token'] }
];

const CATALOG_IDS = new Set(MCP_CATALOG.map((e) => e.id));

/** Keep only real catalog ids, de-duplicated, in catalog order. */
export function cleanServerList(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const want = new Set(ids.filter((x): x is string => typeof x === 'string' && CATALOG_IDS.has(x)));
  return MCP_CATALOG.map((e) => e.id).filter((id) => want.has(id));
}

export function mcpLabel(id: string): string {
  return MCP_CATALOG.find((e) => e.id === id)?.label ?? id;
}
