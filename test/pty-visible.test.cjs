'use strict';
// WSL floors: wsl.exe paints escape sequences before the agent starts, so
// "ready to type into" waits for visible text (src/main/pty.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { hasVisibleText } = loadTs('src/main/pty.ts');

const E = '\x1b';

test('escape sequences, titles and whitespace alone are not a frame', () => {
  assert.equal(hasVisibleText(`${E}[?25l${E}[2J${E}[H${E}]0;wsl.exe\x07`), false);
  assert.equal(hasVisibleText(`${E}[?1049h\r\n  \t`), false);
});

test('any visible character is', () => {
  assert.equal(hasVisibleText(`${E}[1mWelcome to Claude Code${E}[0m`), true);
  assert.equal(hasVisibleText('❯'), true);
});
