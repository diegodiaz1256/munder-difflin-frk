'use strict';
// Licensed tiles live in the repo encrypted; only a build with the key gets
// them in the clear, and a build without it still works.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { pack, unpack, readKey, safeRel, writeFiles } = require('../tools/tiles-bundle.cjs');

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'tiles-')); }

test('pack → unpack gives the same files back, and the bundle hides them', () => {
  const src = tmpDir();
  fs.mkdirSync(path.join(src, 'office dir'), { recursive: true });
  fs.writeFileSync(path.join(src, 'office dir', 'floor.png'), Buffer.from('PNG floor bytes'));
  fs.writeFileSync(path.join(src, 'ui.png'), Buffer.from('PNG ui bytes'));
  const key = crypto.randomBytes(32);
  const bundle = pack(src, key);
  assert.equal(bundle.includes(Buffer.from('PNG floor bytes')), false);
  const files = unpack(bundle, key);
  assert.deepEqual(Object.keys(files).sort(), ['office dir/floor.png', 'ui.png']);
  assert.equal(files['office dir/floor.png'].toString(), 'PNG floor bytes');

  const out = tmpDir();
  writeFiles(files, out);
  assert.equal(fs.readFileSync(path.join(out, 'office dir', 'floor.png'), 'utf8'), 'PNG floor bytes');
});

test('a wrong key or a damaged bundle fails loudly', () => {
  const src = tmpDir();
  fs.writeFileSync(path.join(src, 'a.png'), Buffer.from('x'));
  const bundle = pack(src, crypto.randomBytes(32));
  assert.throws(() => unpack(bundle, crypto.randomBytes(32)));
  assert.throws(() => unpack(Buffer.from('nope'), crypto.randomBytes(32)), /not a tiles bundle/);
});

test('no key on this machine means the free art, not an error', () => {
  assert.equal(readKey({ TILES_KEY_FILE: path.join(tmpDir(), 'missing.key') }), null);
  const k = crypto.randomBytes(32).toString('base64');
  assert.equal(readKey({ TILES_KEY: k }).length, 32);
  assert.throws(() => readKey({ TILES_KEY: 'c2hvcnQ=' }), /32 bytes/);
});

test('bundle paths cannot leave the output folder', () => {
  for (const bad of ['../x.png', 'a/../../x.png', '/etc/x', 'C:/x.png', 'a\\b.png', '', 'a//b.png']) {
    assert.equal(safeRel(bad), null, bad);
  }
  assert.deepEqual(safeRel('office/floor.png'), ['office', 'floor.png']);
});
