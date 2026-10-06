'use strict';
/** Deliverables: which files a task names, how each kind previews, what agents wrote. */
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { deliverablePaths, previewKind, parseDelimited, writtenFiles, splitPath } = loadTs('src/shared/deliverables.ts');

test('a task names its deliverables relative to the hive or absolute', () => {
  assert.deepEqual(deliverablePaths('research/q3/report.md', '/h/hive'), ['/h/hive/research/q3/report.md']);
  assert.deepEqual(deliverablePaths('see research/a.md, /tmp/b.csv', '/h/hive'), ['/h/hive/research/a.md', '/tmp/b.csv']);
  assert.deepEqual(deliverablePaths('research/my report.md', '/h/hive'), ['/h/hive/research/my report.md']);
  assert.deepEqual(deliverablePaths('`research/x.json`.', '/h/hive'), ['/h/hive/research/x.json']);
  assert.deepEqual(deliverablePaths('research\\r.md', 'C:\\Users\\me\\hive'), ['C:\\Users\\me\\hive\\research\\r.md']);
  assert.deepEqual(deliverablePaths('C:\\out\\r.pdf', '/h'), ['C:\\out\\r.pdf']);
  assert.deepEqual(deliverablePaths('done, PR opened https://github.com/a/b/pull/1', '/h'), []);
  assert.deepEqual(deliverablePaths(undefined, '/h'), []);
});

test('preview kinds by extension', () => {
  assert.equal(previewKind('a.md'), 'markdown');
  assert.equal(previewKind('A.PNG'), 'image');
  assert.equal(previewKind('t.tsv'), 'csv');
  assert.equal(previewKind('x.pdf'), 'pdf');
  assert.equal(previewKind('x.zip'), 'binary');
  assert.equal(previewKind('Makefile'), 'binary');
});

test('CSV with quotes, commas and new lines inside fields', () => {
  assert.deepEqual(parseDelimited('a,b\n"x, y","he said ""hi"""\r\n1,2', ','), [['a', 'b'], ['x, y', 'he said "hi"'], ['1', '2']]);
  assert.deepEqual(parseDelimited('a\tb\n1\t2\n', '\t'), [['a', 'b'], ['1', '2']]);
  assert.equal(parseDelimited('x\n'.repeat(500), ',', 200).length, 200);
});

test('files an agent wrote, newest first, once each', () => {
  const w = writtenFiles([
    { event: 'PreToolUse', tool: 'Write', detail: '/r/a.md', ts: 1 },
    { event: 'PreToolUse', tool: 'Edit', detail: '/r/a.md', ts: 5 },
    { event: 'PreToolUse', tool: 'Edit', detail: '/r/b.ts', ts: 3 },
    { event: 'PreToolUse', tool: 'Read', detail: '/r/c.md', ts: 9 },
    { event: 'PreToolUse', tool: 'Write', detail: '/r/d.md', ts: 9, blocked: true },
    { event: 'PostToolUse', tool: 'Write', detail: '/r/e.md', ts: 9 }
  ]);
  assert.deepEqual(w, [{ path: '/r/a.md', ts: 5, created: true }, { path: '/r/b.ts', ts: 3, created: false }]);
});

test('splitPath handles both separators', () => {
  assert.deepEqual(splitPath('/h/research/a.md'), { dir: '/h/research', name: 'a.md' });
  assert.deepEqual(splitPath('C:\\h\\a.md'), { dir: 'C:\\h', name: 'a.md' });
});

// ─── a WSL floor: agents write Linux paths, the app opens them from Windows ──

const { hostPath } = loadTs('src/shared/deliverables.ts');
const { fromLinuxPath } = loadTs('src/main/wsl.ts');

test('WSL: Linux paths become \\\\wsl.localhost or drive paths; others stay', () => {
  assert.equal(hostPath('/home/me/office/hive/research/a.md', 'Ubuntu'), '\\\\wsl.localhost\\Ubuntu\\home\\me\\office\\hive\\research\\a.md');
  assert.equal(hostPath('/mnt/c/Users/me/out.csv', 'Ubuntu'), 'C:\\Users\\me\\out.csv');
  assert.equal(hostPath('/home/me/a.md', null), '/home/me/a.md');
  assert.equal(hostPath('C:\\x\\a.md', 'Ubuntu'), 'C:\\x\\a.md');
  // Same answer as main's own converter.
  for (const p of ['/home/me/a b/c.md', '/mnt/d/x.md', '/']) assert.equal(hostPath(p, 'Ubuntu'), fromLinuxPath(p, 'Ubuntu'));
});

test('WSL: a task naming an absolute Linux path opens through the distro; relative stays under the UNC hive', () => {
  const root = '\\\\wsl.localhost\\Ubuntu\\home\\me\\office\\hive';
  assert.deepEqual(deliverablePaths('/home/me/office/hive/research/r.md', root, 'Ubuntu'), ['\\\\wsl.localhost\\Ubuntu\\home\\me\\office\\hive\\research\\r.md']);
  assert.deepEqual(deliverablePaths('research/r.md', root, 'Ubuntu'), [`${root}\\research/r.md`]);
  assert.deepEqual(splitPath(`${root}\\research/r.md`), { dir: `${root}\\research`, name: 'r.md' });
});
