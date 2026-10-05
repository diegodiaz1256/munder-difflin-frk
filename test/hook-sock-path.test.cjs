'use strict';
// A Unix socket path is limited (104 bytes on macOS, 108 on Linux). The hook
// socket used to be <hive root>/hooks.sock whatever the length, so an office
// in a deep folder never bound it: every hook was allowed and no cost was
// recorded. Too long → a short per-user path, unique per office.
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { hookSockPath } = loadTs('src/main/hive.ts');

test('a short hive root keeps its socket inside the hive', () => {
  assert.equal(hookSockPath('/home/me/office/hive', { tmp: '/tmp', uid: 1000 }), '/home/me/office/hive/hooks.sock');
});

test('a root too long for a socket gets a short private path, one per office', () => {
  const deep = '/Users/someone.with.a.long.name/Library/Mobile Documents/com~apple~CloudDocs/Projects/office/hive';
  const a = hookSockPath(deep, { tmp: '/tmp', uid: 1000 });
  assert.ok(Buffer.byteLength(a) <= 100, a);
  assert.match(a, /^\/tmp\/scranton-branch-1000\/md-hooks-[0-9a-f]{12}\.sock$/);
  assert.notEqual(a, hookSockPath(deep + '2', { tmp: '/tmp', uid: 1000 }), 'two offices never share a socket');
  assert.equal(a, hookSockPath(deep, { tmp: '/tmp', uid: 1000 }), 'stable for the same office');
  assert.match(hookSockPath(deep, { runtimeDir: '/run/user/1000', tmp: '/tmp', uid: 1000 }), /^\/run\/user\/1000\/md-hooks-/);
});
