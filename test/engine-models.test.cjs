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
