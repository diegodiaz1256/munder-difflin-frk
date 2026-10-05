'use strict';
// Claude Code's own tools as per-agent capabilities (src/shared/nativeTools.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { disallowedTools, cleanToolBlocks } = loadTs('src/shared/nativeTools.ts');

test('an agent without Web loses WebSearch and WebFetch', () => {
  assert.deepEqual(disallowedTools(['web'], false), ['WebSearch', 'WebFetch']);
});

test('nothing taken away → no flag; the orchestrator never gets sub-agents', () => {
  assert.deepEqual(disallowedTools(undefined, false), []);
  assert.deepEqual(disallowedTools(undefined, true), ['Agent', 'Task']);
  assert.deepEqual(disallowedTools(['shell', 'subagents'], true), ['Bash', 'PowerShell', 'Agent', 'Task']);
});

test('unknown groups and junk are dropped (file editing cannot be taken away)', () => {
  assert.deepEqual(cleanToolBlocks(['web', 'edit', 'web', 42, 'Bash; rm -rf /']), ['web']);
  assert.deepEqual(cleanToolBlocks('web'), []);
});
