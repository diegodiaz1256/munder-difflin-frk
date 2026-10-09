'use strict';
// Now → Right now read as one undifferentiated line per agent: the name twice
// (column and step), the step in mono, a status pill as loud as the task. The
// row now gives each role one weight: who + state | task + last step | when.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const now = read('src/renderer/src/pro/NowView.tsx');
const css = read('src/renderer/src/pro/pro.css');

test('the last step under the task does not repeat the agent name', () => {
  const row = now.slice(now.indexOf('className="pro-now-row"'), now.indexOf('className="pro-now-when"'));
  assert.match(row, /pro-now-step/);
  assert.doesNotMatch(row, /sentence\(step\)\.text\}\{/, 'not the "who · action" sentence');
  assert.match(row, /t\(`pro\.steps\.\$\{step\.key\}`/);
});

test('state is a quiet line under the name; ticket is a chip; no task reads as such', () => {
  assert.match(now, /<StateLine \{\.\.\.agentState/);
  assert.match(now, /pro-ticket pro-ticket-chip/);
  assert.match(now, /pro-now-idle/);
  for (const cls of ['.pro-now-row', '.pro-now-who', '.pro-now-title', '.pro-now-step', '.pro-state-line', '.pro-ticket-chip']) {
    assert.ok(css.includes(cls), cls);
  }
});
