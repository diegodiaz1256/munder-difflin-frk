/**
 * Secrets that live in the app's settings (Slack signing secret and bot token,
 * the Groq key, webhook secrets) are kept OUT of config.json, which every agent
 * can read (they run as the same user, and sandboxes do not block reads). They
 * go to a sibling file, encrypted with the OS key store (Electron safeStorage),
 * and are merged back on read, so the rest of the app sees the same config.
 *
 * Pure: the cipher is passed in, for tests. When the OS cannot encrypt, nothing
 * changes (the values stay where they were): failing to encrypt must never lose
 * a secret.
 */

export const SECRET_FIELDS = ['slackSigningSecret', 'slackBotToken', 'groqApiKey', 'webhookSecret'] as const;

export interface SecretCodec {
  available(): boolean;
  encrypt(plain: string): string;
  /** undefined when it cannot be decrypted (another machine/user, corrupt). */
  decrypt(cipher: string): string | undefined;
}

type Cfg = Record<string, unknown> & { webhookTriggers?: unknown };

const triggerKey = (id: string): string => `webhookTrigger:${id}`;

/** What config.json keeps, and the encrypted entries for the secrets file
 *  (null: leave the secrets file as it is — the OS cannot encrypt now). */
export function splitSecrets<T extends Cfg>(cfg: T, codec: SecretCodec): { plain: T; secrets: Record<string, string> | null } {
  if (!codec.available()) return { plain: cfg, secrets: null };
  const plain: Cfg = { ...cfg };
  const secrets: Record<string, string> = {};
  for (const f of SECRET_FIELDS) {
    const v = plain[f];
    if (typeof v === 'string' && v) secrets[f] = codec.encrypt(v);
    delete plain[f];
  }
  if (Array.isArray(plain.webhookTriggers)) {
    plain.webhookTriggers = plain.webhookTriggers.map((t: unknown) => {
      const tr = t as { id?: unknown; secret?: unknown };
      if (tr && typeof tr.id === 'string' && typeof tr.secret === 'string' && tr.secret) {
        secrets[triggerKey(tr.id)] = codec.encrypt(tr.secret);
        return { ...tr, secret: '' };
      }
      return t;
    });
  }
  return { plain: plain as T, secrets };
}

/** The config with its secrets filled back in. A value still in the config
 *  (written before this existed, or while the OS could not encrypt) wins. */
export function mergeSecrets<T extends Cfg>(cfg: T, secrets: Record<string, string>, codec: SecretCodec): T {
  if (!Object.keys(secrets).length || !codec.available()) return cfg;
  const out: Cfg = { ...cfg };
  for (const f of SECRET_FIELDS) {
    if (typeof out[f] === 'string' && out[f]) continue;
    const c = secrets[f];
    const v = c ? codec.decrypt(c) : undefined;
    if (v) out[f] = v;
  }
  if (Array.isArray(out.webhookTriggers)) {
    out.webhookTriggers = out.webhookTriggers.map((t: unknown) => {
      const tr = t as { id?: unknown; secret?: unknown };
      if (!tr || typeof tr.id !== 'string' || (typeof tr.secret === 'string' && tr.secret)) return t;
      const c = secrets[triggerKey(tr.id)];
      const v = c ? codec.decrypt(c) : undefined;
      return v ? { ...tr, secret: v } : t;
    });
  }
  return out as T;
}

/** Does this stored config still hold a secret in the clear? */
export function hasPlainSecrets(cfg: Cfg): boolean {
  if (SECRET_FIELDS.some((f) => typeof cfg[f] === 'string' && cfg[f])) return true;
  return Array.isArray(cfg.webhookTriggers)
    && cfg.webhookTriggers.some((t: unknown) => typeof (t as { secret?: unknown })?.secret === 'string' && !!(t as { secret: string }).secret);
}
