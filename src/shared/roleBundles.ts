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

export const BUNDLE_ICONS = ['sparkle', 'code', 'ledger', 'sidebar', 'web', 'terminal', 'git', 'mcp'] as const;
export type BundleIcon = typeof BUNDLE_ICONS[number];

export interface RoleBundle {
  id: string;
  label: string;
  /** Icon name from the renderer's pixel icon set. */
  icon: BundleIcon;
  servers: string[];
  /** Set on the user's own bundles (config.customRoleBundles); the built-ins
   *  are templates and cannot be edited, only duplicated. */
  custom?: boolean;
}

export const ROLE_BUNDLES: RoleBundle[] = [
  { id: 'designer', label: 'Designer', icon: 'sparkle', servers: ['context7', 'filesystem'] },
  { id: 'software-engineer', label: 'Software Engineer', icon: 'code', servers: ['git', 'github-token', 'db'] },
  { id: 'product-manager', label: 'Product Manager', icon: 'ledger', servers: ['github-token', 'search-with-key'] },
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

/** The user's own bundles may hold at most this many. */
export const MAX_CUSTOM_BUNDLES = 30;

/**
 * Validate the user's bundles before they are saved: a slug id unique among
 * themselves and the built-ins, a label, a known icon, real catalog servers.
 * Malformed entries are dropped, not repaired into something the user did not
 * write. Pure, so main and the tests share it.
 */
export function cleanCustomBundles(raw: unknown): RoleBundle[] {
  if (!Array.isArray(raw)) return [];
  const taken = new Set(ROLE_BUNDLES.map((b) => b.id));
  const out: RoleBundle[] = [];
  for (const item of raw) {
    if (out.length >= MAX_CUSTOM_BUNDLES) break;
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const label = typeof r.label === 'string' ? r.label.trim().slice(0, 40) : '';
    if (!label) continue;
    // Keep a valid id across edits (grants and selections point at it); a
    // missing or clashing one becomes the label's slug, numbered if needed.
    let id = typeof r.id === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(r.id) && !taken.has(r.id) ? r.id : bundleSlug(label);
    for (let i = 2; taken.has(id); i++) id = `${bundleSlug(label)}-${i}`;
    taken.add(id);
    const icon = (BUNDLE_ICONS as readonly string[]).includes(r.icon as string) ? (r.icon as BundleIcon) : 'mcp';
    out.push({ id, label, icon, servers: cleanServerList(r.servers), custom: true });
  }
  return out;
}

export function bundleSlug(label: string): string {
  return 'my-' + (label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'bundle');
}

/** Built-ins first, then the user's own. */
export function allRoleBundles(custom: unknown): RoleBundle[] {
  return [...ROLE_BUNDLES, ...cleanCustomBundles(custom)];
}
