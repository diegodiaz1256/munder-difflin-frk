'use strict';
// The app writes the orchestrator's work log: asked to in its prompt, a live
// orchestrator still left its memory empty after a delegated job.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { workLogLine, appendWorkLog } = loadTs('src/main/workLog.ts');
const { parseMemory } = loadTs('src/shared/memorySections.ts');

const date = new Date('2026-10-09T14:15:27Z');

test('a finished job: who, what, and its report', () => {
  assert.equal(
    workLogLine({ who: 'line-counter', objective: 'Count the lines of ./project/src/invoices.js', outcome: 'done', result: 'invoices.js has 4 lines', date }),
    '- 2026-10-09: line-counter finished "Count the lines of ./project/src/invoices.js" → invoices.js has 4 lines'
  );
  assert.match(workLogLine({ who: 'w', objective: 'x', outcome: 'done', date }), /\(no report\)$/);
});

test('a job that ended badly says how', () => {
  assert.equal(workLogLine({ who: 'cache-code-reviewer', objective: 'Audit ./project', outcome: 'exited', exitCode: 1, date }),
    '- 2026-10-09: cache-code-reviewer stopped before reporting done (exit 1) on "Audit ./project"');
  assert.match(workLogLine({ who: 'w', outcome: 'idle', date }), /stopped after going idle on its job/);
  assert.match(workLogLine({ who: 'w', outcome: 'tokens', date }), /token cap/);
});

test('long text is kept to one short line', () => {
  const line = workLogLine({ who: 'w', objective: 'a '.repeat(200), outcome: 'done', result: 'b\n'.repeat(300), date });
  assert.ok(!line.includes('\n'));
  assert.ok(line.length < 320, String(line.length));
});

test('the log file gets a heading once and reads as Memory notes', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-worklog-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  appendWorkLog(dir, 'Michael', workLogLine({ who: 'a', objective: 'one', outcome: 'done', result: 'ok', date }));
  appendWorkLog(dir, 'Michael', workLogLine({ who: 'b', objective: 'two', outcome: 'exited', exitCode: 1, date }));
  const text = fs.readFileSync(path.join(dir, 'worklog.md'), 'utf8');
  assert.equal(text.match(/^# Work log — Michael$/gm).length, 1);
  const notes = parseMemory(text);
  assert.equal(notes.length, 2);
  assert.equal(notes[0].date, '2026-10-09');
});
