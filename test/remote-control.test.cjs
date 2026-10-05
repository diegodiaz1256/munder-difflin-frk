'use strict';
// Remote Control's state from the orchestrator's terminal (src/shared/remoteControl.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { detectRemoteControl } = loadTs('src/shared/remoteControl.ts');

test('the session link means on', () => {
  const r = detectRemoteControl('\x1b[1mRemote Control\x1b[0m\r\nThis session is available in the Claude mobile app and at\r\nhttps://claude.ai/code/session_01Aryu8Xz5DmPoujZLjsbAE3.');
  assert.deepEqual(r, { state: 'on', url: 'https://claude.ai/code/session_01Aryu8Xz5DmPoujZLjsbAE3' });
});

test('a disconnect or a failure means off', () => {
  assert.equal(detectRemoteControl('Remote Control disconnected — run /remote-control to reconnect').state, 'off');
  const f = detectRemoteControl('● Remote Control disconnected — Session creation failed (server 400) — see debug log');
  assert.equal(f.state, 'off');
  assert.match(f.reason, /Session creation failed \(server 400\)/);
});

test('the newest notice wins; unrelated output says nothing', () => {
  assert.equal(detectRemoteControl('Remote Control disconnected ... https://claude.ai/code/session_abc').state, 'on');
  assert.equal(detectRemoteControl('https://claude.ai/code/session_abc ... Remote Control disconnected').state, 'off');
  assert.equal(detectRemoteControl('Reading files… done'), null);
});
