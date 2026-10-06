'use strict';
// The Manager sidebar listed twelve pages in a row and read as clutter; the
// daily ones stay visible, the rest fold into "Office" and "Setup".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/src/pro/ProShell.tsx'), 'utf8');

const ids = (block) => [...block.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

test('every sidebar page sits in exactly one group', () => {
  const top = ids(src.slice(src.indexOf('const TOP'), src.indexOf('];', src.indexOf('const TOP')))).filter((x) => x !== 'now' || true);
  const pages = [...src.slice(src.indexOf('const TOP'), src.indexOf('];', src.indexOf('const TOP'))).matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]);
  const groups = src.slice(src.indexOf('const NAV_GROUPS'), src.indexOf('];', src.indexOf('const NAV_GROUPS')));
  const grouped = [...groups.matchAll(/items: \[([^\]]*)\]/g)].flatMap((m) => ids(m[1]));
  assert.ok(top.length);
  assert.deepEqual([...grouped].sort(), [...pages].sort());
  assert.match(groups, /id: 'main', items: \['now', 'tasks', 'inbox', 'deliverables'\]/);
});

test('the group with the open page stays open', () => {
  assert.match(src, /const open = !g\.label \|\| openGroups\[g\.id\] \|\| items\.some\(\(i\) => i\.id === section\);/);
});
