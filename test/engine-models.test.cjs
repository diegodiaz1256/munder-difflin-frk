'use strict';
/** Pi and OpenCode list their models in their own formats; both become provider/model ids. */
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { parseModelList, authProviders } = loadTs('src/shared/engineModels.ts');

test('OpenCode: one provider/model per line', () => {
  assert.deepEqual(parseModelList('anthropic/claude-sonnet-4-5\nopenai/gpt-5\n\nopenrouter/meta-llama/llama-4:free\n'), ['anthropic/claude-sonnet-4-5', 'openai/gpt-5', 'openrouter/meta-llama/llama-4:free']);
});

test('Pi: a table with provider and model columns (header, separators and colours skipped)', () => {
  const out = '\x1b[1mprovider   model                 context  max-out\x1b[0m\n──────────────────────────────\nanthropic  claude-sonnet-4-5     200K     64K\nopenai     gpt-5                 400K     128K\nanthropic  claude-sonnet-4-5     200K     64K\n';
  assert.deepEqual(parseModelList(out), ['anthropic/claude-sonnet-4-5', 'openai/gpt-5']);
});

test('nothing usable → empty', () => {
  assert.deepEqual(parseModelList('No models available. Set an API key.\n'), []);
  assert.deepEqual(parseModelList(''), []);
});

test('auth file: provider names and kind, never the token', () => {
  const p = authProviders(JSON.stringify({ anthropic: { type: 'oauth', refresh: 'R', access: 'A' }, openai: { type: 'api', key: 'sk-x' }, junk: 3 }));
  assert.deepEqual(p, [{ id: 'anthropic', kind: 'oauth' }, { id: 'openai', kind: 'api' }]);
  assert.doesNotMatch(JSON.stringify(p), /sk-x|"R"|"A"/);
  assert.deepEqual(authProviders('not json'), []);
});

// ─── your own OpenAI-compatible providers ───────────────────────────────────

const { cleanCustomProviders, opencodeProviders, piModelsJson, modelsFromListing, customKeyEnv } = loadTs('src/shared/engineModels.ts');

test('custom providers: valid slug, http(s) base, models; bad entries and shadowed ids dropped', () => {
  const list = cleanCustomProviders([
    { id: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1/', models: ['llama3.1:8b', 'llama3.1:8b', 'bad id', ''] },
    { id: 'openai', label: 'x', baseUrl: 'http://a/v1', models: [] },          // would shadow a built-in provider
    { id: 'x', label: 'x', baseUrl: 'file:///etc', models: [] },
    { id: 'y', label: 'y', baseUrl: 'http://user:pw@host/v1', models: [] },
    { id: 'ollama', label: 'dup', baseUrl: 'http://b/v1', models: [] }
  ]);
  assert.deepEqual(list, [{ id: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1', models: ['llama3.1:8b'] }]);
});

const lm = [{ id: 'lmstudio', label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', models: ['qwen2.5-coder'] }, { id: 'gw', label: 'Gateway', baseUrl: 'https://gw.example/v1', models: ['m1'] }];

test('OpenCode: openai-compatible providers, the key by env reference only', () => {
  const p = opencodeProviders(lm, (id) => id === 'gw');
  assert.deepEqual(p.lmstudio, { npm: '@ai-sdk/openai-compatible', name: 'LM Studio', options: { baseURL: 'http://localhost:1234/v1' }, models: { 'qwen2.5-coder': { name: 'qwen2.5-coder' } } });
  assert.equal(p.gw.options.apiKey, `{env:${customKeyEnv('gw')}}`);
  assert.equal(customKeyEnv('my-gw'), 'MD_MODEL_KEY_MY_GW');
});

test('Pi: your models.json kept, our providers added, the key by env var name', () => {
  const mine = JSON.stringify({ providers: { mine: { baseUrl: 'http://x', models: [] } }, other: 1 });
  const out = JSON.parse(piModelsJson(mine, lm, (id) => id === 'gw'));
  assert.ok(out.providers.mine);
  assert.equal(out.other, 1);
  assert.deepEqual(out.providers.lmstudio, { baseUrl: 'http://localhost:1234/v1', api: 'openai-completions', apiKey: 'none', models: [{ id: 'qwen2.5-coder', name: 'qwen2.5-coder' }] });
  // Pi only reads `$NAME` / `${NAME}` from the environment; a bare name would be sent as the key.
  assert.equal(out.providers.gw.apiKey, '${MD_MODEL_KEY_GW}');
  assert.doesNotThrow(() => JSON.parse(piModelsJson('not json', lm, () => false)));
});

test('model listings: OpenAI /models and Ollama /api/tags', () => {
  assert.deepEqual(modelsFromListing({ data: [{ id: 'a' }, { id: 'b' }, { id: 'a' }] }), ['a', 'b']);
  assert.deepEqual(modelsFromListing({ models: [{ name: 'llama3.1:8b' }, { model: 'qwen' }] }), ['llama3.1:8b', 'qwen']);
  assert.deepEqual(modelsFromListing(null), []);
});

test('resume: the pinned model comes back, and keys only go to the provider in use', () => {
  const { effectiveModel, keyScope, piSettingsWithModel, piOwnModels, authProviders } = loadTs('src/shared/engineModels.ts');
  assert.equal(effectiveModel(undefined, 'wanda/qwen3', undefined).model, 'wanda/qwen3');
  assert.equal(effectiveModel('openai/gpt-5.5', 'wanda/qwen3').model, 'openai/gpt-5.5');
  const known = (p) => p === 'openai' || p === 'anthropic';
  assert.equal(keyScope('wanda', known), 'none');
  assert.equal(keyScope('openai', known), 'one');
  const s = JSON.parse(piSettingsWithModel('{"theme":"dark"}', 'wanda/qwen3'));
  assert.deepEqual([s.theme, s.defaultProvider, s.defaultModel], ['dark', 'wanda', 'qwen3']);
  assert.deepEqual(piOwnModels('{"providers":{"wanda":{"models":[{"id":"qwen3"},{"id":""}]}}}'), ['wanda/qwen3']);
  const a = authProviders('{"wanda":{"type":"api_key","key":""},"openai":{"type":"api_key","key":"sk-1"}}');
  assert.equal(a.find((x) => x.id === 'wanda').empty, true);
  assert.equal(a.find((x) => x.id === 'openai').empty, undefined);
});
