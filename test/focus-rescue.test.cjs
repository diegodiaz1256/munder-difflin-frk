'use strict';
// Text boxes that "lock" on Windows: a native dialog can leave the page without
// keyboard focus. Every dialog in main must hand focus back, and a click on a
// text box while the page has no focus must ask main for it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { isEditable, installFocusRescue } = loadTs('src/renderer/src/focusRescue.ts');

test('only things a person types into count as editable', () => {
  assert.ok(isEditable({ tagName: 'TEXTAREA' }));
  assert.ok(isEditable({ tagName: 'INPUT', type: 'text' }));
  assert.ok(isEditable({ tagName: 'input', type: 'search' }));
  assert.ok(isEditable({ tagName: 'DIV', isContentEditable: true }));
  assert.ok(!isEditable({ tagName: 'INPUT', type: 'checkbox' }));
  assert.ok(!isEditable({ tagName: 'BUTTON' }));
  assert.ok(!isEditable({ tagName: 'TEXTAREA', disabled: true }));
  assert.ok(!isEditable({ tagName: 'INPUT', readOnly: true }));
  assert.ok(!isEditable(null));
});

function fakeDoc(hasFocus) {
  let handler = null;
  return {
    hasFocus: () => hasFocus,
    addEventListener: (_t, h) => { handler = h; },
    removeEventListener: () => { handler = null; },
    click: (target) => handler && handler({ target }),
    get installed() { return handler !== null; }
  };
}

test('a click on a text box while the page has no focus asks for it back', async () => {
  const doc = fakeDoc(false);
  let asked = 0, focused = 0;
  const box = { tagName: 'TEXTAREA', focus: () => { focused++; } };
  const off = installFocusRescue(doc, async () => { asked++; });
  doc.click(box);
  await new Promise((r) => setImmediate(r));
  assert.equal(asked, 1);
  assert.equal(focused, 1);
  doc.click({ tagName: 'BUTTON', closest: () => null });
  assert.equal(asked, 1, 'a button click is left alone');
  off();
  assert.ok(!doc.installed);
});

test('a focused page is left alone', () => {
  const doc = fakeDoc(true);
  let asked = 0;
  installFocusRescue(doc, async () => { asked++; });
  doc.click({ tagName: 'TEXTAREA', focus() {} });
  assert.equal(asked, 0);
});

test('every native dialog in main gives focus back to the page', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
  const lines = src.split('\n');
  const calls = [];
  lines.forEach((l, i) => { if (/await dialog\.show(OpenDialog|MessageBox)\(/.test(l)) calls.push(i); });
  assert.ok(calls.length >= 7, `found ${calls.length} dialog calls`);
  for (const i of calls) {
    const after = lines.slice(i, i + 12).join('\n');
    assert.match(after, /refocusPage\(win\)/, `dialog at src/main/index.ts:${i + 1} does not refocus the page`);
  }
});
