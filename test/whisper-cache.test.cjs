'use strict';
// Local Whisper's model files on disk (src/main/whisperCache.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { WhisperCache, isWhisperModel } = loadTs('src/main/whisperCache.ts');

const URL_OK = 'https://huggingface.co/onnx-community/whisper-small/resolve/main/onnx/encoder_model.onnx';

function cache(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-whisper-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { c: new WhisperCache(dir), dir };
}

test('model files round-trip; anything but a Hugging Face whisper file is refused', (t) => {
  const { c } = cache(t);
  assert.equal(c.put(URL_OK, new Uint8Array([1, 2, 3])), true);
  assert.deepEqual([...c.match(URL_OK)], [1, 2, 3]);
  assert.equal(c.put('https://evil.example/x.onnx', new Uint8Array([1])), false);
  assert.equal(c.put('file:///etc/passwd', new Uint8Array([1])), false);
  assert.equal(c.match('https://evil.example/x.onnx'), null);
});

test('ready only once marked; deleting removes files and the mark', (t) => {
  const { c } = cache(t);
  assert.equal(c.isReady('small'), false);
  c.put(URL_OK, new Uint8Array(10));
  c.markReady('small', true);
  assert.equal(c.isReady('small'), true);
  assert.ok(c.size() >= 10);
  c.removeAll();
  assert.equal(c.isReady('small'), false);
  assert.equal(c.size(), 0);
  assert.equal(c.match(URL_OK), null);
});

test('only the small model exists', () => {
  assert.equal(isWhisperModel('small'), true);
  assert.equal(isWhisperModel('turbo'), false);
});
