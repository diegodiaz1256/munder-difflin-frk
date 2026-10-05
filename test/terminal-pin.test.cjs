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

test('a path Claude wrapped over two rows is one link across them', () => {
  const { wrappedSpanRange, continuesRow } = loadTs('src/renderer/src/components/terminalAutomation.ts');
  // 20 columns; Claude ended row 10 at the edge and indented row 11 by two.
  assert.equal(continuesRow('● C:/a/very/long/pa', '  th/report.md', false, 20), true);
  assert.equal(continuesRow('short line', '  indented', false, 20), false, 'a short row ends the line');
  assert.equal(continuesRow('x', 'y', true, 20), true, 'a soft wrap always continues');
  const rows = [{ text: '● C:/a/very/long/pa', row: 10, x0: 0 }, { text: 'th/report.md', row: 11, x0: 2 }];
  // "C:/a/very/long/path/report.md" starts at index 2 and is 29 chars long.
  assert.deepEqual(wrappedSpanRange(rows, 2, 29), { start: { x: 3, y: 10 }, end: { x: 14, y: 11 } });
});
