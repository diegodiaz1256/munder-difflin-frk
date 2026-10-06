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
export function authProviders(json: string): Array<{ id: string; kind: string }> {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    return Object.entries(raw)
      .filter(([, v]) => !!v && typeof v === 'object')
      .map(([id, v]) => ({ id, kind: typeof (v as { type?: unknown }).type === 'string' ? String((v as { type?: unknown }).type) : 'key' }));
  } catch { return []; }
}
