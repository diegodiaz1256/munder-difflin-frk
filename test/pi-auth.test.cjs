'use strict';
/** A hive Pi agent signs in as you: your ~/.pi/agent/auth.json (Pi's /login and
 *  stored keys) is linked into its own agent dir, settings copied; the status the
 *  UI shows names providers only, never a token. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { HiveManager } = loadTs('src/main/hive.ts');

function withHome(t) {
  const hiveHome = fs.mkdtempSync(path.join(os.tmpdir(), 'md-pi-auth-hive-'));
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'md-pi-auth-user-'));
  t.after(() => { fs.rmSync(hiveHome, { recursive: true, force: true }); fs.rmSync(fakeHome, { recursive: true, force: true }); });
  const prev = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = fakeHome; process.env.USERPROFILE = fakeHome;
  t.after(() => { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  return { hiveHome, fakeHome };
}

test('the agent gets your Pi login (linked) and settings, and sees a token Pi refreshed', async (t) => {
  const { hiveHome, fakeHome } = withHome(t);
  const piDir = path.join(fakeHome, '.pi', 'agent');
  fs.mkdirSync(piDir, { recursive: true });
  fs.writeFileSync(path.join(piDir, 'auth.json'), JSON.stringify({ anthropic: { type: 'oauth', access: 'SECRET-1' } }));
  fs.writeFileSync(path.join(piDir, 'settings.json'), JSON.stringify({ defaultProvider: 'anthropic' }));
  const hive = new HiveManager(() => hiveHome);
  const inj = await hive.ensureAgent({ id: 'pi-1', name: 'Pi', provider: 'pi', cwd: hiveHome });
  const agentPi = inj.env.PI_CODING_AGENT_DIR;
  assert.equal(JSON.parse(fs.readFileSync(path.join(agentPi, 'settings.json'), 'utf8')).defaultProvider, 'anthropic');
  assert.match(fs.readFileSync(path.join(agentPi, 'auth.json'), 'utf8'), /SECRET-1/);
  // Pi refreshes its token in your file: the agent reads the new one.
  fs.writeFileSync(path.join(piDir, 'auth.json'), JSON.stringify({ anthropic: { type: 'oauth', access: 'SECRET-2' } }));
  await hive.ensureAgent({ id: 'pi-1', name: 'Pi', provider: 'pi', cwd: hiveHome });
  assert.match(fs.readFileSync(path.join(agentPi, 'auth.json'), 'utf8'), /SECRET-2/);
});

test('status: provider names and kind only, never the token', (t) => {
  const { hiveHome, fakeHome } = withHome(t);
  const hive = new HiveManager(() => hiveHome);
  assert.deepEqual(hive.piAuthStatus().providers, []);
  const piDir = path.join(fakeHome, '.pi', 'agent');
  fs.mkdirSync(piDir, { recursive: true });
  fs.writeFileSync(path.join(piDir, 'auth.json'), JSON.stringify({ anthropic: { type: 'oauth', access: 'SECRET' }, openai: { type: 'api_key', key: 'sk-x' } }));
  const st = hive.piAuthStatus();
  assert.deepEqual(st.providers, [{ id: 'anthropic', kind: 'oauth' }, { id: 'openai', kind: 'api_key' }]);
  assert.doesNotMatch(JSON.stringify(st), /SECRET|sk-x/);
});

test('no Pi login on the machine: the spawn still works, nothing linked', async (t) => {
  const { hiveHome } = withHome(t);
  const hive = new HiveManager(() => hiveHome);
  const inj = await hive.ensureAgent({ id: 'pi-2', name: 'Pi', provider: 'pi', cwd: hiveHome });
  assert.equal(fs.existsSync(path.join(inj.env.PI_CODING_AGENT_DIR, 'auth.json')), false);
});
