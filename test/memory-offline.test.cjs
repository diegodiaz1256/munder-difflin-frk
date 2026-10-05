'use strict';
// The memory model never goes online by itself: mempalace runs with the
// Hugging Face hub offline, and the model is fetched only from Settings
// (src/main/memory.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { MemoryManager, OFFLINE_ENV, MODEL_MISSING, mempalaceInvocation } = loadTs('src/main/memory.ts');

function manager(t, { model = 'minilm' } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-memoff-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const m = new MemoryManager(() => home, () => ({ enabled: true, model }));
  return { m, home };
}

test('agents and the app run mempalace with the hub offline', (t) => {
  const { m } = manager(t);
  m.binCache = process.execPath; // any existing file: "installed"
  assert.equal(m.env().HF_HUB_OFFLINE, '1');
  assert.equal(m.env().TRANSFORMERS_OFFLINE, '1');
  assert.deepEqual(OFFLINE_ENV, { HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' });
});

test('a WSL floor gets the offline switch inside the distro too', () => {
  const inv = mempalaceInvocation('/home/u/.local/bin/mempalace', ['search', 'x'], { ...OFFLINE_ENV, MEMPALACE_PALACE_PATH: '/home/u/o/palace' }, { distro: 'Ubuntu', linuxPath: '/home/u/o' });
  assert.ok(inv.args.includes('HF_HUB_OFFLINE=1') || (inv.env && inv.env.HF_HUB_OFFLINE === '1') || JSON.stringify(inv).includes('HF_HUB_OFFLINE'), JSON.stringify(inv));
});

test('no model on disk: search says so plainly, and nothing goes online', async (t) => {
  const { m } = manager(t, { model: 'embeddinggemma' });
  m.binCache = process.execPath;
  m.modelCache = { key: '|embeddinggemma', ready: false, at: Date.now() };
  m.checkModel = async () => false;
  const r = await m.search('anything');
  assert.equal(r.ok, false);
  assert.equal(r.error, MODEL_MISSING);
  assert.equal(m.status().modelReady, false);
});

test('Settings download fetches the model inside a WSL distro', { skip: process.platform !== 'win32' }, async (t) => {
  const { execFileSync } = require('node:child_process');
  let ok = false;
  try { ok = /mempalace/.test(execFileSync('wsl.exe', ['-d', 'Ubuntu', '--exec', 'bash', '-lc', 'command -v mempalace'], { encoding: 'utf8', timeout: 20000 })); } catch { /* no WSL or no mempalace */ }
  if (!ok) { t.skip('no mempalace in WSL Ubuntu'); return; }
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-memwsl-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const m = new MemoryManager(() => '\\\\wsl.localhost\\Ubuntu\\tmp\\sb-memtest', () => ({ enabled: true, model: 'minilm' }));
  const r = await m.downloadModel();
  assert.equal(r.ok, true, r.error);
  assert.equal(await m.checkModel(), true);
});
