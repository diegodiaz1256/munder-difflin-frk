'use strict';
// The orchestrator can be renamed, so nothing it is told and nothing the human
// reads may hardcode "Michael" (the default name). Comments may; strings may not.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
// Code only: drop // and /* */ comments, keep strings.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/).map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');

test('agent prompts and boot screens use the real orchestrator name', () => {
  for (const f of ['src/renderer/src/hooks/useHive.ts', 'src/renderer/src/components/MichaelBooting.tsx', 'src/shared/engineAvailability.ts']) {
    const hits = code(read(f)).split('\n').filter((l) => /Michael/.test(l) && /['"`]/.test(l) && !/import |Michael[A-Z]\w*|function Michael/.test(l));
    assert.deepEqual(hits, [], `${f} still says Michael in a string`);
  }
  assert.match(read('src/renderer/src/hooks/useHive.ts'), /You're online as \$\{name\}/);
});

test('the voice speaks as the orchestrator\'s name', () => {
  const s = read('src/renderer/src/realtime/session.ts');
  assert.match(s, /name: godName/);
  assert.match(s, /You are \$\{godName\}/);
  assert.doesNotMatch(code(s), /Michael here|talk to Michael/);
});

test('the orchestrator badge and boot text exist in both languages', () => {
  for (const lang of ['en', 'es']) {
    const l = JSON.parse(read(`src/renderer/src/i18n/locales/${lang}.json`));
    assert.ok(l.pro.god.badge && /\{\{godName\}\}/.test(l.pro.god.tip), lang);
    assert.ok(l.app.clockingIn && /\{\{godName\}\}/.test(l.app.clockingInBody), lang);
  }
});
