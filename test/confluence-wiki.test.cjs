'use strict';
// A deliverable written in Confluence wiki markup (.wiki) previews as a
// formatted report, like Markdown.
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { confluenceToMarkdown: md } = loadTs('src/shared/confluenceWiki.ts');

test('headings, inline marks and links', () => {
  assert.equal(md('h1. Plan'), '# Plan');
  assert.equal(md('h3. Risks and *open* items'), '### Risks and **open** items');
  assert.equal(md('This is *bold*, _italic_, -gone- and {{npm test}}.'), 'This is **bold**, *italic*, ~~gone~~ and `npm test`.');
  assert.equal(md('See [the spec|https://x.io/spec] or [https://x.io].'), 'See [the spec](https://x.io/spec) or <https://x.io>.');
  assert.equal(md('a-b-c stays, 2*3*4 stays'), 'a-b-c stays, 2*3*4 stays');
});

test('lists, tables, quotes and panels', () => {
  assert.equal(md('* one\n** nested\n# first\n## sub'), '- one\n  - nested\n1. first\n  1. sub');
  assert.equal(md('||Name||Cost||\n|Jim|*3*|\n|Pam|4|'), '| Name | Cost |\n| --- | --- |\n| Jim | **3** |\n| Pam | 4 |');
  assert.equal(md('bq. quoted'), '> quoted');
  assert.equal(md('{warning}\nDo not ship\n{warning}'), '> **Warning**\n> Do not ship\n');
  assert.equal(md('----'), '---');
});

test('code and noformat blocks keep their text untouched', () => {
  assert.equal(md('{code:javascript}\nconst a = *b*;\n{code}'), '```javascript\nconst a = *b*;\n```');
  assert.equal(md('{code:title=x.py|language=python}\nprint(1)\n{code}'), '```\nprint(1)\n```');
  assert.equal(md('{noformat}\nh1. not a heading\n{noformat}'), '```\nh1. not a heading\n```');
  assert.equal(md('{code}unclosed'), '```\nunclosed\n```');
});
