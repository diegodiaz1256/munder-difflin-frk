'use strict';
// Environment and secrets (src/main/envVault.ts): agents may USE a secret
// (through a runner) but never SEE its value.
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { EnvVault, maskSecrets } = loadTs('src/main/envVault.ts');

function vault(opts = {}) {
  let vars = []; let runners = [];
  const secrets = new Map();
  const asked = [];
  const v = new EnvVault({
    readVars: () => vars, writeVars: (x) => { vars = x; },
    readRunners: () => runners, writeRunners: (x) => { runners = x; },
    getSecret: (r) => secrets.get(r), setSecret: (r, s) => { secrets.set(r, s); return { ok: true }; }, deleteSecret: (r) => secrets.delete(r),
    approve: async (req) => { asked.push(req); return opts.answer ?? 'once'; },
    opRead: async (ref) => { if (ref === 'op://Dev/Db/url') return 'postgres://u:hunter2-op@db/x'; throw new Error('not found'); }
  });
  return { v, secrets, asked, get vars() { return vars; } };
}

test('masking catches the value and its encodings', () => {
  const s = 'sk_live_ABC123xyz';
  const text = `key=${s} b64=${Buffer.from(s).toString('base64')} url=${encodeURIComponent('a b/' + s)}`;
  const out = maskSecrets(text, [s]);
  assert.ok(!out.includes(s) && !out.includes(Buffer.from(s).toString('base64')), out);
});

test('secret values never come back out of the vault, and never reach agents', () => {
  const { v, vars } = vault();
  assert.equal(v.setVar({ name: 'STRIPE_KEY', kind: 'secret' }, 'sk_live_ABC123xyz').ok, true);
  assert.equal(v.setVar({ name: 'NODE_ENV', kind: 'plain', value: 'development' }).ok, true);
  assert.equal(v.setVar({ name: 'DATABASE_URL', kind: 'op', value: 'op://Dev/Db/url' }).ok, true);
  const listed = JSON.stringify(v.listVars());
  assert.ok(!listed.includes('sk_live'), 'the UI listing has no secret value');
  assert.ok(/"stored":true/.test(listed));
  assert.deepEqual(v.plainEnvFor('god'), { NODE_ENV: 'development' }, 'agents get plain variables only');
  assert.ok(!JSON.stringify(vars).includes('sk_live'), 'config has no secret value');
});

test('validation: names, op references, a secret needs a value', () => {
  const { v } = vault();
  assert.equal(v.setVar({ name: '1BAD', kind: 'plain', value: 'x' }).ok, false);
  assert.equal(v.setVar({ name: 'X', kind: 'op', value: 'vault/item' }).ok, false);
  assert.equal(v.setVar({ name: 'X', kind: 'secret' }).ok, false);
});

test('a runner uses secrets; its output comes back masked', async () => {
  const { v } = vault();
  v.setVar({ name: 'STRIPE_KEY', kind: 'secret' }, 'sk_live_ABC123xyz');
  v.setVar({ name: 'DATABASE_URL', kind: 'op', value: 'op://Dev/Db/url' });
  const r = v.setRunner({ name: 'leak test', command: 'node -e "console.log(process.env.STRIPE_KEY, Buffer.from(process.env.STRIPE_KEY).toString(\'base64\'), process.env.DATABASE_URL)"', secrets: ['STRIPE_KEY', 'DATABASE_URL'], approval: 'never' });
  assert.equal(r.ok, true);
  const out = await v.run(r.id, { agentName: 'Dwight', cwd: process.cwd(), fingerprint: 'a' });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.exitCode, 0);
  assert.ok(!out.output.includes('sk_live_ABC123xyz') && !out.output.includes('hunter2-op'), out.output);
  assert.match(out.output, /\*\*\* \*\*\* \*\*\*/);
});

test('on-change approval asks when the worktree changed, not again otherwise; deny stops it', async () => {
  const a = vault();
  a.v.setVar({ name: 'K', kind: 'secret' }, 'value-1234');
  const { id } = a.v.setRunner({ name: 'ok', command: 'node -e "process.exit(0)"', secrets: ['K'] });
  await a.v.run(id, { agentName: 'Jim', cwd: process.cwd(), fingerprint: 'v1' });
  await a.v.run(id, { agentName: 'Jim', cwd: process.cwd(), fingerprint: 'v1' });
  assert.equal(a.asked.length, 1, 'same state: asked once');
  await a.v.run(id, { agentName: 'Jim', cwd: process.cwd(), fingerprint: 'v2' });
  assert.equal(a.asked.length, 2, 'files changed: asked again');
  assert.equal(a.asked[1].changed, true);

  const d = vault({ answer: 'deny' });
  d.v.setVar({ name: 'K', kind: 'secret' }, 'value-1234');
  const r = d.v.setRunner({ name: 'x', command: 'node -e "1"', secrets: ['K'], approval: 'always' });
  const out = await d.v.run(r.id, { agentName: 'Jim', cwd: process.cwd(), fingerprint: 'v1' });
  assert.equal(out.ok, false);
  assert.match(out.error, /declined/);
});

test('a 1Password failure is reported, not run without the secret', async () => {
  const { v } = vault();
  v.setVar({ name: 'MISSING', kind: 'op', value: 'op://Dev/Nope/x' });
  const { id } = v.setRunner({ name: 'x', command: 'node -e "1"', secrets: ['MISSING'], approval: 'never' });
  const out = await v.run(id, { agentName: 'Jim', cwd: process.cwd(), fingerprint: 'v1' });
  assert.equal(out.ok, false);
  assert.match(out.error, /1Password could not read MISSING/);
});

test('the key broker serves runners to a token holder only, masked output and all', async (t) => {
  const { IntegrationBroker } = loadTs('src/main/integrationBroker.ts');
  const { v } = vault();
  v.setVar({ name: 'TOKEN', kind: 'secret' }, 'tok_super_secret_99');
  const { id } = v.setRunner({ name: 'echo', command: 'node -e "console.log(\'value=\' + process.env.TOKEN)"', secrets: ['TOKEN'], approval: 'never', description: 'prints it' });
  const broker = new IntegrationBroker({
    getRecord: () => undefined, getSecret: () => undefined,
    runners: { describe: () => v.describeRunners(), run: (_w, rid) => v.run(rid, { agentName: 'Pam', cwd: process.cwd(), fingerprint: 'x' }) }
  });
  const started = await broker.start(0);
  t.after(() => broker.stop());
  const token = broker.grant('pty-pam', []);
  const base = `http://127.0.0.1:${started.port}`;
  const list = await (await fetch(`${base}/run`, { headers: { Authorization: `Bearer ${token}` } })).json();
  assert.deepEqual(list.runners.map((r) => r.id), [id]);
  assert.ok(!JSON.stringify(list).includes('tok_super'), 'listing carries names, not values');
  const ran = await (await fetch(`${base}/run/${id}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).json();
  assert.equal(ran.ok, true, ran.error);
  assert.match(ran.output, /value=\*\*\*/);
  assert.ok(!ran.output.includes('tok_super_secret_99'));
  const anon = await fetch(`${base}/run/${id}`, { method: 'POST' });
  assert.equal(anon.status, 401, 'no token, no run');
});

test('on a WSL floor a runner runs inside the distro, secrets over stdin, output masked', { skip: process.platform !== 'win32' }, async (t) => {
  const { execFileSync } = require('node:child_process');
  let distro = null;
  try {
    const raw = execFileSync('wsl.exe', ['-l', '-q'], { timeout: 15000 });
    distro = raw.toString('utf16le').replace(/\0/g, '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] ?? null;
  } catch { /* no WSL */ }
  if (!distro) { t.skip('no WSL distribution'); return; }
  const { v } = vault();
  v.setVar({ name: 'TOKEN', kind: 'secret' }, 'wsl_secret_value=with spaces & "quotes"');
  const { id } = v.setRunner({ name: 'where', command: 'echo "kernel=$(uname -s) pwd=$PWD"; echo "value=$TOKEN"; env | grep -c wsl_secret_value', secrets: ['TOKEN'], approval: 'never' });
  const out = await v.run(id, { agentName: 'Pam', cwd: `\\\\wsl.localhost\\${distro}\\tmp`, fingerprint: 'x' });
  assert.equal(out.ok, true, out.error);
  assert.match(out.output, /kernel=Linux pwd=\/tmp/);
  assert.match(out.output, /value=\*\*\*/);
  assert.ok(!out.output.includes('wsl_secret_value'), out.output);
});
