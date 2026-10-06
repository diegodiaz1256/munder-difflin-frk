'use strict';
// The floor redrew at the screen's refresh rate: on a 240 Hz screen an idle
// office cost 61% of a core (renderer) and 23% (GPU). Measured after: 30 fps.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { sceneFps, limitSceneFps } = loadTs('src/renderer/src/scene/office/frameBudget.ts');

test('frames per second by focus and activity', () => {
  assert.equal(sceneFps(true, true), 30);
  assert.equal(sceneFps(true, false), 15);
  assert.equal(sceneFps(false, true), 10);
  assert.equal(sceneFps(false, false), 10);
});

test('the limit follows focus and is removed with the scene', () => {
  const listeners = {};
  global.window = { addEventListener: (e, f) => { listeners[e] = f; }, removeEventListener: (e) => { delete listeners[e]; } };
  let focus = true;
  global.document = { hasFocus: () => focus };
  const ticker = { maxFPS: 0 };
  const stop = limitSceneFps(ticker, () => true);
  assert.equal(ticker.maxFPS, 30);
  focus = false; listeners.blur();
  assert.equal(ticker.maxFPS, 10);
  stop();
  assert.deepEqual(Object.keys(listeners), []);
  delete global.window; delete global.document;
});

test('both pixel scenes use it', () => {
  for (const f of ['OfficeFloor.tsx', 'FactoryScene.tsx']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/src/scene/office', f), 'utf8');
    assert.match(src, /__fps = limitSceneFps\(app\.ticker/, f);
    assert.match(src, /__fps\?\.\(\)/, `${f} removes it on teardown`);
  }
});
