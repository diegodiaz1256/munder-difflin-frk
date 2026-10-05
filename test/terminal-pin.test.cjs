'use strict';
// The prompt stays at the bottom when a TUI leaves blank rows under it.
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { blankRowsBelowContent, shouldFollowTerminalOutput } = loadTs('src/renderer/src/components/terminalAutomation.ts');

const screen = (s) => [...s].map((c) => c === '.');

test('a menu closed and left 4 blank rows: lift the viewport by 4', () => {
  assert.equal(blankRowsBelowContent(screen('xxxxxx....'), 3, 100), 4);
});

test('never hide the cursor row, nor lift past the scrollback', () => {
  assert.equal(blankRowsBelowContent(screen('xxxx......'), 7, 100), 2);
  assert.equal(blankRowsBelowContent(screen('xx........'), 0, 3), 3);
  assert.equal(blankRowsBelowContent(screen('xxxxxxxxxx'), 9, 100), 0);
});

test('a lifted viewport still counts as following the output', () => {
  assert.equal(shouldFollowTerminalOutput(96, 100, 4), true);
  assert.equal(shouldFollowTerminalOutput(80, 100, 4), false);
  assert.equal(shouldFollowTerminalOutput(99, 100), true);
});
