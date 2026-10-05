'use strict';
// An agent's CLI asking a question in its terminal (src/shared/terminalMenu.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { detectMenu } = loadTs('src/shared/terminalMenu.ts');

const trust = [
  '╭──────────────────────────────────────────────╮',
  '│ Do you trust the files in this folder?       │',
  '│                                              │',
  '│ C:\\work\\demo-shop                            │',
  '│                                              │',
  '│ ❯ 1. Yes, proceed                            │',
  '│   2. No, exit                                │',
  '╰──────────────────────────────────────────────╯',
  '   Enter to confirm · Esc to exit'
].join('\r\n');

test("Claude's trust-this-folder menu is a question for you", () => {
  assert.deepEqual(detectMenu(trust), { question: 'Do you trust the files in this folder?' });
});

test('a menu with the cursor and no footer still counts', () => {
  const m = detectMenu(' Remote Control is active. What next?\n ❯ 1. Continue\n   2. Disconnect\n   3. Show QR code\n');
  assert.equal(m.question, 'Remote Control is active. What next?');
});

test('colours and cursor moves do not hide it', () => {
  const m = detectMenu('\x1b[1mProceed with the change?\x1b[0m\r\n\x1b[36m❯ 1. Yes\x1b[0m\r\n  2. No\r\n\x1b[2mEnter to select\x1b[0m');
  assert.equal(m.question, 'Proceed with the change?');
});

test('a numbered list in an answer is not a menu', () => {
  assert.equal(detectMenu('Here is the plan:\n1. Read the repo\n2. Fix the bug\n3. Run the tests\n\n> '), null);
});

test('plain work output is not a menu', () => {
  assert.equal(detectMenu('● Reading 1 file…\n* Crunching… (7s · ↓ 439 tokens)\n> \n  ⏵⏵ bypass permissions on'), null);
});

test("Claude's /model picker: the title, not the last line of its blurb", () => {
  const screen = [
    'This session is on Opus 5.5 (claude-opus-5-5).',
    '',
    '> /model',
    '────────────────────────────────────────',
    ' Select model',
    ' Switch between Claude models. Your pick becomes the default for new sessions. For',
    ' other/previous model names, specify with --model.',
    '',
    '   1. Default (recommended)  Sonnet 5.5 · Efficient for routine tasks',
    ' ❯ 2. Opus 5.5 ✓             For complex work and everyday tasks',
    ' ↓ 3. Fable 5.1              For your toughest challenges',
    '      … +9 models',
    '',
    ' ◐ Medium effort (default) ←/→ to adjust',
    '',
    ' Enter to set as default · s to use this session only · Esc to cancel',
    '', ''
  ].join('\n');
  assert.deepEqual(detectMenu(screen), { question: 'Select model' });
});
