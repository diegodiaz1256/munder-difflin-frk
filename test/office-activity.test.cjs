'use strict';
// "Now": the office log and the agents' steps as one readable list. Before, it
// was hard to tell what the office was doing (each agent's steps inside its own
// page, messages in the inbox, crashes in a log file) and a dead agent's card
// said "idle".
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const A = loadTs('src/shared/officeActivity.ts');
const name = (id) => ({ god: 'Michael', 'worker-x': 'Oscar' }[id] ?? id);

test('log entries become sentences; scheduler noise does not', () => {
  assert.deepEqual(A.activityFromLog({ ts: 1, kind: 'message', from: 'god', to: 'worker-x', act: 'request', subject: 'Review demo-shop' }, name),
    { id: 'log:1:message:', ts: 1, kind: 'message', agentId: 'god', key: 'msgAsk', params: { from: 'Michael', to: 'Oscar', subject: 'Review demo-shop' } });
  assert.equal(A.activityFromLog({ ts: 2, kind: 'message', from: 'worker-x', to: 'god', act: 'done', subject: 'x' }, name).key, 'msgDone');
  assert.equal(A.activityFromLog({ ts: 3, kind: 'message', from: 'scheduler', to: 'god', act: 'request', subject: 'Hourly ops standup' }, name), null);
  assert.equal(A.activityFromLog({ ts: 4, kind: 'spawn', agentId: 'worker-x', name: 'Oscar' }, name).key, 'joined');
  assert.equal(A.activityFromLog({ ts: 5, kind: 'archive', agentId: 'worker-x', archived: true }, name).key, 'left');
  const crash = A.activityFromLog({ ts: 6, kind: 'agent-exit', agentId: 'worker-x', exitCode: 1 }, name);
  assert.equal(crash.kind, 'problem'); assert.equal(crash.params.code, '1');
  assert.equal(A.activityFromLog({ ts: 7, kind: 'session', agentId: 'god' }, name), null, 'bookkeeping is left out');
});

test('a tool step says who did what to what', () => {
  const s = A.activityFromStep({ agentId: 'worker-x', event: 'PreToolUse', tool: 'Bash', detail: 'npm test', ts: 10 }, name);
  assert.equal(s.key, 'tool_Bash'); assert.equal(s.params.who, 'Oscar'); assert.equal(s.params.detail, 'npm test');
  assert.equal(A.activityFromStep({ agentId: 'worker-x', event: 'PostToolUse', tool: 'Bash', ts: 11 }, name), null, 'one line per step');
});

test('merging keeps newest first without duplicates; current step is recent only', () => {
  const s1 = A.activityFromStep({ agentId: 'worker-x', event: 'PreToolUse', tool: 'Read', detail: 'a.md', ts: 100 }, name);
  const s2 = A.activityFromStep({ agentId: 'worker-x', event: 'PreToolUse', tool: 'Bash', detail: 'ls', ts: 200 }, name);
  const list = A.mergeActivity(A.mergeActivity([], [s1]), [s2, s1]);
  assert.deepEqual(list.map((i) => i.ts), [200, 100]);
  assert.equal(A.currentStep(list, 'worker-x', 250).params.detail, 'ls');
  assert.equal(A.currentStep(list, 'worker-x', 200 + 121_000), null, 'stale');
});

test('a terminal that ended is read as stopped', () => {
  assert.equal(A.exitedCode('La línea de comandos es demasiado larga.\n— process exited (code 1) —'), '1');
  assert.equal(A.exitedCode('> working on it'), null);
});

test('a command reads without its leading cd into a long path', () => {
  assert.equal(A.tidyDetail('cd "C:/Users/x/a long path"; ls -la agents'), 'ls -la agents');
  assert.equal(A.tidyDetail('cd /home/z/office && npm test'), 'npm test');
  assert.equal(A.tidyDetail('npm test'), 'npm test');
});

test('archived agents keep their names in Now (from the log\'s spawn entries)', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src/renderer/src/pro/activityStore.ts'), 'utf8');
  assert.match(src, /e\.kind === 'spawn' && typeof e\.agentId === 'string' && typeof e\.name === 'string'\) logNames\.set/);
  assert.match(src, /\?\? logNames\.get\(id\) \?\? id/);
});
