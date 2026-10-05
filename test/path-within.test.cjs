'use strict';
// A clicked file must land in the IDE of the agent that holds it (src/shared/pathWithin.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { pathWithin, ownerOf } = loadTs('src/shared/pathWithin.ts');
const w = String.raw;

test('Windows paths: either separator, any case', () => {
  assert.equal(pathWithin(w`C:\Users\me\office\hive\research\w40k.md`, w`C:\Users\me\office`), 'hive/research/w40k.md');
  assert.equal(pathWithin(w`C:\Users\me\office/hive/board.md`, w`c:\users\me\office\ `.trim()), 'hive/board.md');
  assert.equal(pathWithin(w`C:\Users\me\officeX\a.md`, w`C:\Users\me\office`), null);
  assert.equal(pathWithin(w`C:\Users\me\office`, w`C:\Users\me\office`), '');
});

test('WSL shares and POSIX paths', () => {
  assert.equal(pathWithin(w`\\wsl.localhost\Ubuntu\home\u\offices\w40k\hive\research\r.md`, w`\\wsl.localhost\Ubuntu\home\u\offices\w40k`), 'hive/research/r.md');
  assert.equal(pathWithin('/home/u/repo/src/App.tsx', '/home/u/repo'), 'src/App.tsx');
  assert.equal(pathWithin('/home/u/Repo/a', '/home/u/repo'), null, 'POSIX stays case-sensitive');
});

test('the deepest folder owns the file (a worker repo inside the office)', () => {
  const agents = [{ id: 'god', cwd: w`C:\o` }, { id: 'oscar', cwd: w`C:\o\demo-shop` }];
  assert.equal(ownerOf(w`C:\o\demo-shop\src\a.ts`, agents).id, 'oscar');
  assert.equal(ownerOf(w`C:\o\hive\research\x.md`, agents).id, 'god');
  assert.equal(ownerOf(w`D:\elsewhere\x.md`, agents), undefined);
});
