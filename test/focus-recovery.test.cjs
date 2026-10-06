const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { isTextField, needsRefocus } = loadTs('src/shared/focusRecovery.ts');

test('a click on a text box while the page lost focus asks for it back', () => {
  assert.equal(needsRefocus({ tagName: 'INPUT', type: 'text' }, false), true);
  assert.equal(needsRefocus({ tagName: 'TEXTAREA' }, false), true);
  assert.equal(needsRefocus({ tagName: 'DIV', isContentEditable: true }, false), true);
  assert.equal(needsRefocus({ tagName: 'DIV', closest: (s) => s.includes('.xterm') }, false), true);
});

test('nothing happens when the page has focus, or for buttons and disabled fields', () => {
  assert.equal(needsRefocus({ tagName: 'INPUT', type: 'text' }, true), false);
  assert.equal(isTextField({ tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(isTextField({ tagName: 'BUTTON' }), false);
  assert.equal(isTextField({ tagName: 'INPUT', type: 'text', disabled: true }), false);
  assert.equal(isTextField(null), false);
});

test('the renderer never calls window.confirm/alert/prompt (they freeze text boxes on Windows)', () => {
  const root = path.join(__dirname, '..', 'src', 'renderer', 'src');
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?)$/.test(e.name)) {
        fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
          if (/^\s*(\/\/|\*)/.test(line)) return;
          if (/(^|[^.\w])(window\.)?(confirm|alert|prompt)\s*\(/.test(line.replace(/window\.cth\.\w+/g, ''))) hits.push(`${path.relative(root, p)}:${i + 1}`);
        });
      }
    }
  };
  walk(root);
  assert.deepEqual(hits, [], 'use window.cth.confirm instead');
});
