const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { connectionsPromptLine, envPromptLine } = loadTs('src/shared/agentConnections.ts');
const { PROVIDER_BACKENDS, backendForModel, providerKeyEnv } = loadTs('src/shared/providerBackends.ts');

const gh = { id: 'github-token', label: 'GitHub', serviceLabel: 'GitHub', description: 'Read/write GitHub issues.', examples: [] };

test('no connections → no prompt line', () => {
  assert.equal(connectionsPromptLine(undefined), '');
  assert.equal(connectionsPromptLine([]), '');
});

test('the prompt names each connection, its MCP server, and says to use it by default', () => {
  const line = connectionsPromptLine([gh]);
  assert.match(line, /munder-github-token/);
  assert.match(line, /USE THEM BY DEFAULT/);
  assert.match(line, /never see them/);
});

test('several connections of one service are told apart by name', () => {
  const work = { ...gh, id: 'github-token--work', label: 'Work' };
  const line = connectionsPromptLine([gh, work]);
  assert.match(line, /GitHub "GitHub" \(MCP server `munder-github-token`/);
  assert.match(line, /GitHub "Work" \(MCP server `munder-github-token--work`/);
});

test('env line lists names only', () => {
  assert.equal(envPromptLine([]), '');
  const line = envPromptLine(['NODE_ENV', 'API_BASE_URL']);
  assert.match(line, /NODE_ENV, API_BASE_URL/);
});

test('provider backends: ids and env vars are unique', () => {
  assert.equal(new Set(PROVIDER_BACKENDS.map((b) => b.id)).size, PROVIDER_BACKENDS.length);
  assert.equal(new Set(PROVIDER_BACKENDS.map((b) => b.envVar)).size, PROVIDER_BACKENDS.length);
});

test('model slug selects its backend (aliases included)', () => {
  assert.equal(backendForModel('gemini/gemini-2.5-pro').id, 'google');
  assert.equal(backendForModel('Mistral/large').id, 'mistral');
  assert.equal(backendForModel('local/llama3'), undefined);
  assert.equal(backendForModel('gpt-5'), undefined);
});

test('providerKeyEnv: least privilege when the model is known, all keys otherwise', () => {
  const keys = { openai: 'sk-o', anthropic: 'sk-a', google: 'g-key' };
  const get = (id) => keys[id];
  assert.deepEqual(providerKeyEnv('openai/gpt-5', get), { OPENAI_API_KEY: 'sk-o' });
  assert.deepEqual(providerKeyEnv('', get), { ANTHROPIC_API_KEY: 'sk-a', OPENAI_API_KEY: 'sk-o', GEMINI_API_KEY: 'g-key', GOOGLE_GENERATIVE_AI_API_KEY: 'g-key' });
  assert.deepEqual(providerKeyEnv('google/gemini-2.5-pro', get), { GEMINI_API_KEY: 'g-key', GOOGLE_GENERATIVE_AI_API_KEY: 'g-key' });
});
