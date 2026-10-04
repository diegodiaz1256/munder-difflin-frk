'use strict';
// The server's secret-store key (src/server/secretKey.ts): where it comes from,
// that the environment forgets it once read, and that a broken explicit source
// fails closed instead of falling back to a generated key.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { loadSecretKey } = loadTs('src/server/secretKey.ts');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'md-key-'));
const quiet = (fn) => { const e = console.error, l = console.log; console.error = console.log = () => {}; try { return fn(); } finally { console.error = e; console.log = l; } };

test('generates a key once, then reuses it', () => {
  const dir = tmp();
  const a = quiet(() => loadSecretKey(dir));
  assert.equal(a.length, 32);
  const b = quiet(() => loadSecretKey(dir));
  assert.deepEqual(a, b);
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(dir, 'secret.key')).mode & 0o077, 0);
});

test('MD_SECRET_KEY is used and removed from the environment', () => {
  const hex = 'ab'.repeat(32);
  process.env.MD_SECRET_KEY = hex;
  const k = quiet(() => loadSecretKey(tmp()));
  assert.equal(k.toString('hex'), hex);
  assert.equal(process.env.MD_SECRET_KEY, undefined);
});

test('MD_SECRET_KEY_FILE accepts hex and base64, and is forgotten too', () => {
  const dir = tmp();
  const raw = Buffer.alloc(32, 7);
  for (const text of [raw.toString('hex'), raw.toString('base64')]) {
    fs.writeFileSync(path.join(dir, 'k'), text + '\n');
    process.env.MD_SECRET_KEY_FILE = path.join(dir, 'k');
    assert.deepEqual(quiet(() => loadSecretKey(tmp())), raw);
    assert.equal(process.env.MD_SECRET_KEY_FILE, undefined);
  }
});

test('a bad explicit key disables secrets rather than generating one', () => {
  const dir = tmp();
  process.env.MD_SECRET_KEY = 'too-short';
  assert.equal(quiet(() => loadSecretKey(dir)), null);
  assert.equal(fs.existsSync(path.join(dir, 'secret.key')), false);
  process.env.MD_SECRET_KEY_FILE = path.join(dir, 'missing');
  assert.equal(quiet(() => loadSecretKey(dir)), null);
  assert.equal(fs.existsSync(path.join(dir, 'secret.key')), false);
});
