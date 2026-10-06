/**
 * Models and sign-in for the BYOK engines the app drives (Pi, OpenCode): what
 * their own CLI says is available, read into `provider/model` ids — the form
 * both take on `--model`. Pure: main runs the CLI, this reads its output.
 */

export type ManagedEngine = 'pi' | 'opencode';

/** The CLI call that lists an engine's models. */
export const LIST_MODELS: Record<ManagedEngine, { cmd: string; args: string[] }> = {
  opencode: { cmd: 'opencode', args: ['models'] },
  pi: { cmd: 'pi', args: ['--list-models'] }
};

/** The command that signs an engine in, run in a terminal inside the app. Pi
 *  signs in from inside its own session (type /login). */
export const SIGN_IN: Record<ManagedEngine, { cmd: string; args: string[] }> = {
  opencode: { cmd: 'opencode', args: ['auth', 'login'] },
  pi: { cmd: 'pi', args: [] }
};

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g;
const ID = /^[a-z0-9][\w.-]*\/[\w.:@/+-]+$/i;
/** A table row's provider (lowercase id) and model (an id with a digit, dash, dot or colon). */
const PROVIDER = /^[a-z0-9][a-z0-9.-]*$/;
const MODEL = /^[a-z0-9][\w.:@+-]*[\d.:-][\w.:@+-]*$/i;

/**
 * Read a model list printed by a CLI:
 *   - `provider/model` per line (OpenCode), or anywhere on a line;
 *   - a table with the provider and the model as its first two columns (Pi),
 *     header and separator rows skipped.
 * Unique, in order, at most 2000.
 */
export function parseModelList(output: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => { if (!seen.has(id) && out.length < 2000) { seen.add(id); out.push(id); } };
  for (const raw of output.replace(ANSI, '').split(/\r?\n/)) {
    const line = raw.replace(/[│┃|]/g, ' ').trim();
    if (!line || /^[-=─━+\s]+$/.test(line)) continue;
    const cols = line.split(/\s+/);
    const slashed = cols.find((c) => ID.test(c));
    if (slashed) { add(slashed); continue; }
    if (cols.length >= 2 && PROVIDER.test(cols[0]) && MODEL.test(cols[1]) && !/^(provider|model|name|id)$/i.test(cols[0])) {
      add(`${cols[0]}/${cols[1]}`);
    }
  }
  return out;
}

/** Providers named in an engine's auth file (Pi ~/.pi/agent/auth.json, OpenCode
 *  ~/.local/share/opencode/auth.json) and how each signed in. Never a secret. */
export function authProviders(json: string): Array<{ id: string; kind: string; empty?: boolean }> {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    return Object.entries(raw)
      .filter(([, v]) => !!v && typeof v === 'object')
      .map(([id, v]) => {
        const o = v as Record<string, unknown>;
        // An entry with no credential in it (an abandoned /login) still wins over
        // the provider's own key in models.json: worth telling the human.
        const empty = !Object.entries(o).some(([k, x]) => k !== 'type' && ((typeof x === 'string' && x.trim() !== '') || typeof x === 'number'));
        return { id, kind: typeof o.type === 'string' ? String(o.type) : 'key', ...(empty ? { empty: true } : {}) };
      });
  } catch { return []; }
}

// ─── your own OpenAI-compatible providers (Ollama, LM Studio, vLLM…) ────────
// Declared once in AI providers, given to every OpenCode and Pi agent. The key
// (optional: local servers usually take none) is never written into a file: it
// reaches the agent as an environment variable both configs point at.

export interface CustomModelProvider {
  /** Slug; the prefix of its model ids (`ollama/llama3.1:8b`). */
  id: string;
  label: string;
  /** OpenAI-compatible base, e.g. http://localhost:11434/v1 */
  baseUrl: string;
  models: string[];
}

/** The env var that carries a provider's key into an agent. */
export const customKeyEnv = (id: string): string => `MD_MODEL_KEY_${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

const SLUG = /^[a-z0-9][a-z0-9-]{0,30}$/;
/** Ids an engine already uses for its own providers: a custom one may not shadow them. */
const RESERVED = new Set(['anthropic', 'openai', 'google', 'gemini', 'openrouter', 'groq', 'mistral', 'deepseek', 'xai', 'together', 'local']);

/** Validate the user's list: a free slug, a label, an http(s) base, model ids. Bad entries are dropped. */
export function cleanCustomProviders(raw: unknown): CustomModelProvider[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomModelProvider[] = [];
  for (const item of raw.slice(0, 30)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id.trim().toLowerCase() : '';
    if (!SLUG.test(id) || RESERVED.has(id) || out.some((p) => p.id === id)) continue;
    const baseUrl = typeof r.baseUrl === 'string' ? r.baseUrl.trim().replace(/\/+$/, '') : '';
    try { const u = new URL(baseUrl); if (u.protocol !== 'http:' && u.protocol !== 'https:') continue; if (u.username || u.password) continue; } catch { continue; }
    const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 40) : id;
    const models = Array.isArray(r.models)
      ? [...new Set(r.models.filter((m): m is string => typeof m === 'string').map((m) => m.trim()).filter((m) => m && m.length <= 200 && !/\s/.test(m)))].slice(0, 200)
      : [];
    out.push({ id, label, baseUrl, models });
  }
  return out;
}

/** OpenCode: `provider` entries for OPENCODE_CONFIG_CONTENT. */
export function opencodeProviders(list: CustomModelProvider[], withKey: (id: string) => boolean): Record<string, unknown> {
  return Object.fromEntries(list.map((p) => [p.id, {
    npm: '@ai-sdk/openai-compatible',
    name: p.label,
    options: { baseURL: p.baseUrl, ...(withKey(p.id) ? { apiKey: `{env:${customKeyEnv(p.id)}}` } : {}) },
    models: Object.fromEntries(p.models.map((m) => [m, { name: m }]))
  }]));
}

/** Pi: your models.json (if any) with these providers added. The key is read
 *  from the agent's environment: Pi only interpolates `$NAME` / `${NAME}`; a
 *  bare name is sent as the key itself (LiteLLM: "Received=MD_M****ELLM"). */
export function piModelsJson(existing: string | null, list: CustomModelProvider[], withKey: (id: string) => boolean): string {
  let base: { providers?: Record<string, unknown> } & Record<string, unknown> = {};
  if (existing) { try { const j = JSON.parse(existing); if (j && typeof j === 'object') base = j; } catch { /* keep ours only */ } }
  const providers = { ...(base.providers && typeof base.providers === 'object' ? base.providers : {}) };
  for (const p of list) {
    providers[p.id] = {
      baseUrl: p.baseUrl,
      api: 'openai-completions',
      // Local servers ignore the key, but the field must be set.
      apiKey: withKey(p.id) ? `${'$'}{${customKeyEnv(p.id)}}` : 'none',
      models: p.models.map((m) => ({ id: m, name: m }))
    };
  }
  return JSON.stringify({ ...base, providers }, null, 2);
}

/** Model ids from an OpenAI-compatible `GET /models` body ({ data: [{ id }] }; Ollama's /api/tags shape too). */
export function modelsFromListing(body: unknown): string[] {
  const b = body as { data?: Array<{ id?: unknown }>; models?: Array<{ name?: unknown; model?: unknown }> } | null;
  const ids = [
    ...(Array.isArray(b?.data) ? b!.data.map((m) => m?.id) : []),
    ...(Array.isArray(b?.models) ? b!.models.map((m) => m?.name ?? m?.model) : [])
  ].filter((x): x is string => typeof x === 'string' && !!x.trim());
  return [...new Set(ids)].slice(0, 500);
}

// ─── which model a BYOK engine runs, and which keys it may get ──────────────
// A restart (standup compaction, resume) used to start the engine without its
// --model, so Pi fell back to its own default (openai/…) and was handed every
// stored key — the OpenAI one went to api.openai.com for a model that was never
// OpenAI's. The model is pinned per agent and re-applied; keys follow it.

/** The model this spawn runs: its --model, else the one pinned for the agent,
 *  else the engine's own default provider (Pi settings.json), else unknown. */
export function effectiveModel(argsModel: string | undefined, pinned: string | undefined, defaultProvider?: string): { model?: string; provider?: string } {
  const m = (argsModel || pinned || '').trim();
  if (m) return { model: m, provider: m.includes('/') ? m.split('/')[0].toLowerCase() : undefined };
  return defaultProvider ? { provider: defaultProvider.toLowerCase() } : {};
}

/**
 * Which stored BYOK keys may go to this engine:
 *   - a known backend (anthropic, openai…) → that one key;
 *   - any other provider (yours, local, one defined in the engine's own
 *     models.json) → none: it brings its own key;
 *   - nothing known at all → every key (the old behaviour; rare now).
 */
export function keyScope(provider: string | undefined, knownBackend: (p: string) => boolean): 'one' | 'none' | 'all' {
  if (!provider) return 'all';
  return knownBackend(provider) ? 'one' : 'none';
}

/** Pi settings.json with this model as its default (so a resumed session keeps it). */
export function piSettingsWithModel(existing: string | null, model: string): string {
  let s: Record<string, unknown> = {};
  if (existing) { try { const j = JSON.parse(existing); if (j && typeof j === 'object') s = j; } catch { /* start clean */ } }
  const i = model.indexOf('/');
  if (i > 0) { s.defaultProvider = model.slice(0, i); s.defaultModel = model.slice(i + 1); }
  else s.defaultModel = model;
  return JSON.stringify(s, null, 2);
}

/** Models declared in a Pi models.json (`providers.<name>.models[].id`), as provider/model. */
export function piOwnModels(json: string): string[] {
  try {
    const j = JSON.parse(json) as { providers?: Record<string, { models?: Array<{ id?: unknown }> }> };
    const out: string[] = [];
    for (const [prov, p] of Object.entries(j.providers ?? {})) {
      for (const m of Array.isArray(p?.models) ? p.models : []) if (typeof m?.id === 'string' && m.id.trim()) out.push(`${prov}/${m.id.trim()}`);
    }
    return [...new Set(out)].slice(0, 500);
  } catch { return []; }
}
