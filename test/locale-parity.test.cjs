'use strict';
// Every locale has en.json's exact key tree and the same {{placeholders}} and
// tags in each string: a missing key falls back to English mid-sentence, and a
// dropped {{godName}} silently loses the user's renamed orchestrator.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LOC = path.join(__dirname, '..', 'src', 'renderer', 'src', 'i18n', 'locales');
const read = (f) => JSON.parse(fs.readFileSync(path.join(LOC, f), 'utf8'));
const en = read('en.json');
const tokens = (s) => [...String(s).matchAll(/\{\{\s*(\w+)\s*\}\}|<\/?[a-z]+>/g)].map((m) => m[0].replace(/\s/g, '')).sort().join(' ');

function diff(e, o, at, out) {
  if (e && typeof e === 'object') {
    if (!o || typeof o !== 'object' || Array.isArray(e) !== Array.isArray(o)) { out.push(`${at}: wrong shape`); return; }
    if (Array.isArray(e)) { if (e.length !== o.length) out.push(`${at}: ${o.length} items, en has ${e.length}`); return; }
    for (const k of Object.keys(e)) diff(e[k], o[k], `${at}.${k}`, out);
    for (const k of Object.keys(o)) if (!(k in e)) out.push(`${at}.${k}: not in en`);
    return;
  }
  if (typeof o !== 'string') { out.push(`${at}: missing`); return; }
  if (tokens(e) !== tokens(o)) out.push(`${at}: placeholders [${tokens(o)}], en [${tokens(e)}]`);
}

for (const file of fs.readdirSync(LOC).filter((f) => f.endsWith('.json') && f !== 'en.json')) {
  test(`${file} matches en.json`, () => {
    const out = [];
    diff(en, read(file), '', out);
    assert.deepEqual(out, []);
  });
}
