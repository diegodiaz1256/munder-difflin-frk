'use strict';
// Subagents an agent's Claude starts (Task/Agent tool) are listed in Temps from
// the caller's hook events.
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { SubagentTracker } = loadTs('src/main/subagents.ts');

const task = (extra = {}) => ({ tool_name: 'Task', tool_input: { description: 'Find the signup bug', subagent_type: 'Explore', prompt: 'Look through src/ for…' }, ...extra });

test('a Task call is a running subagent until its tool returns', () => {
  const t = new SubagentTracker();
  assert.equal(t.onHook('jim', 'PreToolUse', task({ tool_use_id: 'tu_1' }), 1000), true);
  let [run] = t.list(1500);
  assert.deepEqual({ ...run }, { id: 'tu_1', parentId: 'jim', type: 'Explore', description: 'Find the signup bug', startedAt: 1000 });
  assert.equal(t.onHook('jim', 'PostToolUse', task({ tool_use_id: 'tu_1' }), 5000), true);
  [run] = t.list(5000);
  assert.equal(run.endedAt, 5000);
  assert.equal(run.ok, true);
});

test('without tool ids, the end goes to the matching open run of that caller', () => {
  const t = new SubagentTracker();
  t.onHook('jim', 'PreToolUse', task(), 1000);
  t.onHook('jim', 'PreToolUse', { tool_name: 'Agent', tool_input: { description: 'Write tests' } }, 1100);
  t.onHook('pam', 'PreToolUse', task(), 1200);
  t.onHook('jim', 'PostToolUseFailure', { tool_name: 'Agent', tool_input: { description: 'Write tests' } }, 2000);
  const runs = t.list(2000);
  const jims = runs.filter((r) => r.parentId === 'jim');
  assert.equal(jims.find((r) => r.description === 'Write tests').ok, false, 'that one failed');
  assert.equal(jims.find((r) => r.description === 'Find the signup bug').endedAt, undefined, 'the other still runs');
  assert.equal(runs.filter((r) => !r.endedAt).length, 2, "pam's is untouched");
  assert.equal(runs.find((r) => r.description === 'Write tests').type, 'general-purpose');
});

test('other tools are ignored, and a leaving caller ends its subagents', () => {
  const t = new SubagentTracker();
  assert.equal(t.onHook('jim', 'PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } }), false);
  t.onHook('jim', 'PreToolUse', task(), 1000);
  assert.equal(t.endFor('jim', 3000), true);
  assert.equal(t.list(3000)[0].ok, false);
});

test('running first; ended ones are kept for a while, then dropped', () => {
  const t = new SubagentTracker();
  t.onHook('a', 'PreToolUse', task({ tool_use_id: 'old' }), 0);
  t.onHook('a', 'PostToolUse', task({ tool_use_id: 'old' }), 10);
  t.onHook('a', 'PreToolUse', task({ tool_use_id: 'now' }), 20);
  assert.deepEqual(t.list(30).map((r) => r.id), ['now', 'old']);
  assert.deepEqual(t.list(3 * 60 * 60_000).map((r) => r.id), ['now'], 'ended over 2 h ago is gone');
});

test('a background subagent runs until its SubagentStop, matched by its own id', () => {
  const t = new SubagentTracker();
  t.onHook('jim', 'PreToolUse', task({ tool_use_id: 'tu_9' }), 1000);
  // What Claude Code returns for a subagent launched in the background.
  t.onHook('jim', 'PostToolUse', task({ tool_use_id: 'tu_9', tool_response: { isAsync: true, status: 'async_launched', agentId: 'a5441b8dec3db251c' } }), 1200);
  assert.equal(t.list(1300)[0].endedAt, undefined, 'still running after the tool returned');
  assert.equal(t.onHook('jim', 'SubagentStop', { subagent_id: 'someone-else' }, 2000), false);
  assert.equal(t.onHook('jim', 'SubagentStop', { subagent_id: 'a5441b8dec3db251c' }, 9000), true);
  const [run] = t.list(9000);
  assert.equal(run.endedAt, 9000);
  assert.equal(run.ok, true);
});
