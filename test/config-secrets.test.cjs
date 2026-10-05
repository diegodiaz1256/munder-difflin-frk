'use strict';
// Secrets in the app's settings (Slack signing secret / bot token, Groq key,
// webhook secrets) used to sit in plaintext in config.json, which every agent
// can read. They now live encrypted (OS key store) in config-secrets.json and
// are merged back on read; an old config.json is migrated on first read.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md-config-secrets-'));
const electron = require.resolve('electron');
// A stand-in for safeStorage: reversible, and visibly not the plaintext.
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(`enc:${Buffer.from(s).toString('hex')}`),
  decryptString: (b) => Buffer.from(String(b).slice(4), 'hex').toString()
};
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => userData }, safeStorage } };

const { writeConfig, readConfig } = loadTs('src/main/config.ts');
const { splitSecrets, mergeSecrets } = loadTs('src/main/configSecrets.ts');

test.after(() => fs.rmSync(userData, { recursive: true, force: true }));

const files = () => {
  const dir = fs.readdirSync(userData, { recursive: true }).map(String);
  const cfg = dir.find((f) => f.endsWith('config.json'));
  const sec = dir.find((f) => f.endsWith('config-secrets.json'));
  return {
    cfg: cfg ? fs.readFileSync(path.join(userData, cfg), 'utf8') : '',
    sec: sec ? fs.readFileSync(path.join(userData, sec), 'utf8') : '',
    cfgPath: cfg && path.join(userData, cfg)
  };
};

test('a saved secret is not in config.json, is encrypted beside it, and reads back', () => {
  writeConfig({ slackBotToken: 'xoxb-secret-1', groqApiKey: 'gsk_abc', webhookTriggers: [{ id: 't1', label: 'x', enabled: true, secret: 'whsec-9', to: 'god' }] });
  const { cfg, sec } = files();
  for (const s of ['xoxb-secret-1', 'gsk_abc', 'whsec-9']) {
    assert.ok(!cfg.includes(s), `${s} not in config.json`);
    assert.ok(!sec.includes(s), `${s} not in clear in the secrets file`);
  }
  const c = readConfig();
  assert.equal(c.slackBotToken, 'xoxb-secret-1');
  assert.equal(c.groqApiKey, 'gsk_abc');
  assert.equal(c.webhookTriggers.find((t) => t.id === 't1').secret, 'whsec-9');
});

test('clearing a secret removes it', () => {
  writeConfig({ groqApiKey: undefined });
  assert.equal(readConfig().groqApiKey, undefined);
  assert.equal(readConfig().slackBotToken, 'xoxb-secret-1', 'the others stay');
});

test('an old config.json with plaintext secrets is migrated on read', () => {
  const { cfgPath } = files();
  const old = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  old.slackSigningSecret = 'legacy-signing';
  fs.writeFileSync(cfgPath, JSON.stringify(old));
  assert.equal(readConfig().slackSigningSecret, 'legacy-signing');
  assert.ok(!files().cfg.includes('legacy-signing'), 'moved out of config.json');
  assert.equal(readConfig().slackSigningSecret, 'legacy-signing');
});

test('when the OS cannot encrypt, nothing moves and nothing is lost', () => {
  const codec = { available: () => false, encrypt: () => { throw new Error('no'); }, decrypt: () => undefined };
  const cfg = { slackBotToken: 'x' };
  assert.deepEqual(splitSecrets(cfg, codec), { plain: cfg, secrets: null });
  assert.deepEqual(mergeSecrets(cfg, { slackBotToken: 'c' }, codec), cfg);
});
