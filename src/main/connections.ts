/**
 * Connections (Pro): credentials for the keyed MCP servers in MCP_CATALOG —
 * GitHub, Database, Web Search, Notion, Sentry.
 *
 * Values go into the SAME encrypted store as the REST integrations
 * (integrations.ts, Electron safeStorage, fail-closed), under `mcp:<server>:<ENV>`.
 * They are never returned to the renderer (only "stored: yes/no") and never
 * reach an agent: the MAIN process runs each keyed server through its MCP
 * gateway (mcpGateway.ts) with the key in that server's environment only, and
 * an agent the server is granted to (consent in `mcpDefaults`, optional
 * per-server agent list in `connectionScopes`) gets a capability token.
 */
import { MCP_CATALOG, mcpCatalogEntry, type McpCatalogEntry } from '../shared/mcpCatalog';
import { readConfig, writeConfig } from './config';
import { getSecret, setSecret, deleteSecret, hasSecret } from './integrations';

export interface ConnectionField {
  env: string;
  label: string;
  help: string;
  placeholder?: string;
  optional?: boolean;
  stored: boolean;
}

export interface ConnectionStatus {
  id: string;
  label: string;
  description: string;
  docsUrl?: string;
  fields: ConnectionField[];
  /** Switched on (consent in mcpDefaults). */
  enabled: boolean;
  /** Every required field holds a stored value. */
  ready: boolean;
  /** Agent ids it is limited to, or null for every agent. */
  scope: string[] | null;
  /** Whether Test can actually reach the service for this kind. */
  testable: boolean;
}

export interface ConnectionTestResult {
  ok: boolean;
  /** Human sentence: who the key belongs to, or what went wrong. */
  message: string;
}

const refFor = (serverId: string, env: string): string => `mcp:${serverId}:${env}`;

function keyed(): McpCatalogEntry[] {
  return MCP_CATALOG.filter((e) => (e.secrets ?? []).length > 0);
}

function field(serverId: string, env: string): NonNullable<McpCatalogEntry['secrets']>[number] | undefined {
  return mcpCatalogEntry(serverId)?.secrets?.find((f) => f.env === env);
}

/** The value for one server credential. MAIN-ONLY: read by the MCP gateway
 *  when it starts that server, never handed to an agent. */
export function connectionSecret(serverId: string, env: string): string | undefined {
  return field(serverId, env) ? getSecret(refFor(serverId, env)) : undefined;
}

/** Whether a credential is stored, without decrypting it (the hive's check). */
export function connectionKeyStored(serverId: string, env: string): boolean {
  return !!field(serverId, env) && hasSecret(refFor(serverId, env));
}

/** How the MCP gateway launches a keyed server: the catalog spec plus the
 *  decrypted keys, or null when a required key is missing. MAIN-ONLY. */
export function connectionLaunchEnv(serverId: string): Record<string, string> | null {
  const entry = mcpCatalogEntry(serverId);
  if (!entry || !(entry.secrets ?? []).length) return null;
  const env: Record<string, string> = {};
  for (const f of entry.secrets ?? []) {
    const v = connectionSecret(serverId, f.env);
    if (v) env[f.env] = v;
    else if (!f.optional) return null;
  }
  return env;
}

export function listConnections(): ConnectionStatus[] {
  const cfg = readConfig();
  return keyed().map((e) => {
    const fields = (e.secrets ?? []).map((f) => ({ ...f, stored: hasSecret(refFor(e.id, f.env)) }));
    const scope = cfg.connectionScopes?.[e.id];
    return {
      id: e.id,
      label: e.label,
      description: e.description,
      docsUrl: e.docsUrl,
      fields,
      enabled: cfg.mcpDefaults?.[e.id]?.enabled === true,
      ready: fields.every((f) => f.optional || f.stored),
      scope: Array.isArray(scope) ? scope : null,
      testable: e.id in TESTS
    };
  });
}

/** Store (or, with an empty value, remove) one credential. */
export function setConnectionSecret(serverId: unknown, env: unknown, value: unknown): { ok: boolean; error?: string } {
  if (typeof serverId !== 'string' || typeof env !== 'string' || !field(serverId, env)) {
    return { ok: false, error: 'unknown connection field' };
  }
  if (typeof value !== 'string') return { ok: false, error: 'invalid value' };
  const trimmed = value.trim();
  if (!trimmed) { deleteSecret(refFor(serverId, env)); return { ok: true }; }
  if (trimmed.length > 4096) return { ok: false, error: 'value too long' };
  return setSecret(refFor(serverId, env), trimmed);
}

/** Switch a connection on or off (the same consent the MCP settings toggle writes). */
export function setConnectionEnabled(serverId: unknown, on: unknown): { ok: boolean; error?: string } {
  if (typeof serverId !== 'string' || !keyed().some((e) => e.id === serverId)) return { ok: false, error: 'unknown connection' };
  const cfg = readConfig();
  writeConfig({ mcpDefaults: { ...(cfg.mcpDefaults ?? {}), [serverId]: { enabled: on === true } } });
  return { ok: true };
}

/** Limit a connection to some agents, or (null) give it to every agent. */
export function setConnectionScope(serverId: unknown, agentIds: unknown): { ok: boolean; error?: string } {
  if (typeof serverId !== 'string' || !keyed().some((e) => e.id === serverId)) return { ok: false, error: 'unknown connection' };
  const scopes = { ...(readConfig().connectionScopes ?? {}) };
  if (agentIds === null) {
    delete scopes[serverId];
  } else if (Array.isArray(agentIds) && agentIds.every((a) => typeof a === 'string')) {
    scopes[serverId] = Array.from(new Set((agentIds as string[]).map((a) => a.trim()).filter(Boolean)));
  } else {
    return { ok: false, error: 'invalid agent list' };
  }
  writeConfig({ connectionScopes: scopes });
  return { ok: true };
}

// ─── Test: one cheap, read-only call per service ─────────────────────────────

async function call(url: string, headers: Record<string, string>): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { headers: { 'User-Agent': 'munder-difflin-connections', ...headers }, signal: AbortSignal.timeout(10_000) });
  let body: unknown = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, body };
}

const httpFailure = (status: number): string =>
  status === 401 || status === 403 ? 'The key was rejected (check it and its permissions).' : `The service answered HTTP ${status}.`;

type Tester = (value: (env: string) => string | undefined) => Promise<ConnectionTestResult>;

const TESTS: Record<string, Tester> = {
  'github-token': async (v) => {
    const r = await call('https://api.github.com/user', { Authorization: `Bearer ${v('GITHUB_PERSONAL_ACCESS_TOKEN')}`, Accept: 'application/vnd.github+json' });
    const login = (r.body as { login?: string } | null)?.login;
    return r.status === 200 ? { ok: true, message: `Connected as ${login ?? 'your account'}.` } : { ok: false, message: httpFailure(r.status) };
  },
  'search-with-key': async (v) => {
    const r = await call('https://api.search.brave.com/res/v1/web/search?q=munder%20difflin&count=1', { 'X-Subscription-Token': v('BRAVE_API_KEY') ?? '', Accept: 'application/json' });
    return r.status === 200 ? { ok: true, message: 'Search works with this key.' } : { ok: false, message: httpFailure(r.status) };
  },
  notion: async (v) => {
    const r = await call('https://api.notion.com/v1/users/me', { Authorization: `Bearer ${v('NOTION_TOKEN')}`, 'Notion-Version': '2022-06-28' });
    const name = (r.body as { name?: string; bot?: { workspace_name?: string } } | null);
    return r.status === 200
      ? { ok: true, message: `Connected${name?.bot?.workspace_name ? ` to ${name.bot.workspace_name}` : ''}${name?.name ? ` as ${name.name}` : ''}.` }
      : { ok: false, message: httpFailure(r.status) };
  },
  sentry: async (v) => {
    const host = (v('SENTRY_HOST') || 'sentry.io').replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const r = await call(`https://${host}/api/0/organizations/`, { Authorization: `Bearer ${v('SENTRY_ACCESS_TOKEN')}` });
    const orgs = Array.isArray(r.body) ? (r.body as Array<{ slug?: string }>).map((o) => o.slug).filter(Boolean) : [];
    return r.status === 200 ? { ok: true, message: orgs.length ? `Connected to ${orgs.join(', ')}.` : 'Connected (no organisations visible to this token).' } : { ok: false, message: httpFailure(r.status) };
  },
  db: async (v) => {
    // A real query needs a Postgres driver the app does not ship; the server
    // itself connects on first use. Check the shape, which catches most typos.
    const raw = v('DATABASE_URI') ?? '';
    try {
      const u = new URL(raw);
      if (!/^postgres(ql)?:$/.test(u.protocol)) return { ok: false, message: 'Expected a postgresql:// connection string.' };
      if (!u.hostname) return { ok: false, message: 'The connection string has no host.' };
      return { ok: true, message: `Looks right (${u.hostname}${u.pathname}). The agent connects on first use.` };
    } catch {
      return { ok: false, message: 'Not a valid connection string.' };
    }
  }
};

export async function testConnection(serverId: unknown): Promise<ConnectionTestResult> {
  if (typeof serverId !== 'string') return { ok: false, message: 'Unknown connection.' };
  const entry = mcpCatalogEntry(serverId);
  const tester = TESTS[serverId];
  if (!entry || !tester) return { ok: false, message: 'No test for this connection.' };
  const value = (env: string) => connectionSecret(serverId, env);
  const missing = (entry.secrets ?? []).filter((f) => !f.optional && !value(f.env));
  if (missing.length) return { ok: false, message: `Add the ${missing.map((f) => f.label.toLowerCase()).join(' and ')} first.` };
  try {
    return await tester(value);
  } catch (e) {
    const msg = e instanceof Error && e.name === 'TimeoutError' ? 'The service did not answer in 10 s.' : 'Could not reach the service (offline or blocked?).';
    return { ok: false, message: msg };
  }
}
