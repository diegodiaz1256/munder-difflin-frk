/**
 * BYOK backend model-providers whose API keys the non-Claude CLI engines
 * (OpenCode / Crush / pi / Qwen) read from standard env vars. One list for the
 * main process (which injects the key at spawn) and the UI (which edits it), so
 * they cannot drift apart. Keys live write-only in the encrypted store under
 * `apikey:<id>`.
 */
export interface ProviderBackend {
  id: string;
  label: string;
  envVar: string;
  /** Extra env vars that carry the same key for some SDKs. */
  alsoEnv?: string[];
  /** Model-slug prefixes (`prefix/model`) that select this backend. */
  prefixes: string[];
}

export const PROVIDER_BACKENDS: ProviderBackend[] = [
  { id: 'anthropic', label: 'Anthropic', envVar: 'ANTHROPIC_API_KEY', prefixes: ['anthropic'] },
  { id: 'openai', label: 'OpenAI', envVar: 'OPENAI_API_KEY', prefixes: ['openai'] },
  // OpenCode / the AI SDK's Google provider reads GOOGLE_GENERATIVE_AI_API_KEY, not GEMINI_API_KEY.
  { id: 'google', label: 'Google · Gemini', envVar: 'GEMINI_API_KEY', alsoEnv: ['GOOGLE_GENERATIVE_AI_API_KEY'], prefixes: ['google', 'gemini'] },
  { id: 'openrouter', label: 'OpenRouter', envVar: 'OPENROUTER_API_KEY', prefixes: ['openrouter'] },
  { id: 'groq', label: 'Groq', envVar: 'GROQ_API_KEY', prefixes: ['groq'] },
  { id: 'mistral', label: 'Mistral', envVar: 'MISTRAL_API_KEY', prefixes: ['mistral'] },
  { id: 'deepseek', label: 'DeepSeek', envVar: 'DEEPSEEK_API_KEY', prefixes: ['deepseek'] },
  { id: 'xai', label: 'xAI · Grok', envVar: 'XAI_API_KEY', prefixes: ['xai'] },
  { id: 'together', label: 'Together AI', envVar: 'TOGETHER_API_KEY', prefixes: ['together', 'togetherai'] }
];

export const backendById = (id: string): ProviderBackend | undefined => PROVIDER_BACKENDS.find((b) => b.id === id);

/** The backend a model slug (`openai/gpt-5`) names, if any. */
export function backendForModel(slug: string): ProviderBackend | undefined {
  const prefix = slug.includes('/') ? slug.split('/')[0].toLowerCase() : '';
  return prefix ? PROVIDER_BACKENDS.find((b) => b.prefixes.includes(prefix)) : undefined;
}

/**
 * The env vars to inject for one spawn, given a way to read stored keys. When
 * the model's backend is known only that key goes in (least privilege); when it
 * is not (default model, custom slug) every stored key does.
 */
export function providerKeyEnv(modelSlug: string, getKey: (backendId: string) => string | undefined): Record<string, string> {
  const scoped = backendForModel(modelSlug);
  const out: Record<string, string> = {};
  for (const b of scoped ? [scoped] : PROVIDER_BACKENDS) {
    const key = getKey(b.id);
    if (!key) continue;
    out[b.envVar] = key;
    for (const extra of b.alsoEnv ?? []) out[extra] = key;
  }
  return out;
}
