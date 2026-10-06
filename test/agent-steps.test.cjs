'use strict';
/** An agent's steps, readable: tool calls described by what they did, secrets hidden. */
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { summarizeToolInput, describeTool, redact, foldSteps, foldStep, parseMcpTool } = loadTs('src/shared/agentSteps.ts');

test('describes built-in tools and connections in words', () => {
  assert.equal(describeTool('Bash').label, 'Ran a command');
  assert.equal(describeTool('Edit').group, 'files');
  const gh = describeTool('mcp__munder-github-token__create_issue');
  assert.equal(gh.group, 'connections');
  assert.equal(gh.label, 'GitHub · create issue');
  assert.equal(describeTool('mcp__munder-github-token--work__list_prs').label, 'GitHub (work) · list prs');
  assert.deepEqual(parseMcpTool('mcp__munder-git__git_status'), { server: 'git', name: 'git_status' });
});

test('summarises what a tool was asked to do', () => {
  assert.equal(summarizeToolInput('Bash', { command: 'npm   test\n-- --watch' }), 'npm test -- --watch');
  assert.equal(summarizeToolInput('Read', { file_path: '/repo/src/a.ts' }), '/repo/src/a.ts');
  assert.equal(summarizeToolInput('Grep', { pattern: 'TODO', path: 'src' }), 'TODO in src');
  assert.equal(summarizeToolInput('mcp__munder-github-token__create_issue', { owner: 'a', repo: 'b', title: 'x', body: { nested: 1 } }), 'owner=a repo=b title=x');
  assert.equal(summarizeToolInput('Bash', null), '');
});

test('credentials never show up in a step', () => {
  assert.equal(redact('curl -H "Authorization: Bearer abcdefghij1234" https://x'), 'curl -H "Authorization: Bearer ***" https://x');
  assert.equal(redact('GITHUB_TOKEN=ghp_abcdefghijklmnop npm run x'), 'GITHUB_TOKEN=*** npm run x');
  assert.equal(redact('psql postgres://user:hunter2@db/x'), 'psql postgres://user:***@db/x');
  assert.equal(summarizeToolInput('mcp__x__call', { api_key: 'sk-secretsecret123', q: 'hi' }), 'api_key=*** q=hi');
  assert.ok(summarizeToolInput('Bash', { command: 'x'.repeat(2000) }).length <= 400);
});

test('Pre and Post meet in one step with a duration; failures and blocks show', () => {
  let s = foldSteps([
    { event: 'UserPromptSubmit', detail: 'fix the build', ts: 1000 },
    { event: 'PreToolUse', tool: 'Bash', detail: 'npm test', ts: 2000 },
    { event: 'PostToolUse', tool: 'Bash', ts: 5500 }
  ]);
  assert.equal(s.length, 2);
  assert.equal(s[0].kind, 'prompt');
  assert.deepEqual([s[1].status, s[1].durationMs, s[1].detail], ['ok', 3500, 'npm test']);
  s = foldStep(s, { event: 'PreToolUse', tool: 'Edit', detail: 'a.ts', ts: 6000 });
  assert.equal(s[2].status, 'running');
  s = foldStep(s, { event: 'PostToolUseFailure', tool: 'Edit', ts: 6100 });
  assert.equal(s[2].status, 'failed');
  s = foldStep(s, { event: 'PreToolUse', tool: 'Bash', detail: 'rm -rf x', blocked: true, ts: 7000 });
  assert.equal(s[3].status, 'blocked');
});

test('a Post with no Pre still shows; Stop closes anything left running; noise is ignored', () => {
  let s = foldStep([], { event: 'PostToolUse', tool: 'Read', detail: 'f', ts: 10 });
  assert.equal(s.length, 1);
  s = foldStep(s, { event: 'PreToolUse', tool: 'Bash', ts: 20 });
  s = foldStep(s, { event: 'Stop', ts: 30 });
  assert.equal(s[1].status, 'ok');
  assert.equal(s[2].kind, 'stop');
  assert.equal(foldStep(s, { event: 'SessionStart' }), s);
});

test('keeps only the latest steps', () => {
  const evs = Array.from({ length: 500 }, (_, i) => ({ event: 'PostToolUse', tool: 'Read', ts: i }));
  assert.equal(foldSteps(evs).length, 400);
});

// ─── written files, for every CLI ───────────────────────────────────────────

const { writtenPathsOf, canonicalTool } = loadTs('src/shared/agentSteps.ts');

test('Claude Code, Antigravity, Gemini CLI, OpenCode and Pi: the path of a write', () => {
  assert.deepEqual(writtenPathsOf('Write', { file_path: '/r/a.md', content: 'x' }), ['/r/a.md']);
  assert.deepEqual(writtenPathsOf('write_to_file', { TargetFile: '/r/b.md', CodeContent: 'x' }), ['/r/b.md']);           // Antigravity
  assert.deepEqual(writtenPathsOf('replace_file_content', { TargetFile: '/r/b.md' }), ['/r/b.md']);
  assert.deepEqual(writtenPathsOf('write_file', { file_path: '/r/c.md', content: 'x' }), ['/r/c.md']);                  // Gemini CLI
  assert.deepEqual(writtenPathsOf('write', { filePath: '/r/d.md', content: 'x' }), ['/r/d.md']);                        // OpenCode
  assert.deepEqual(writtenPathsOf('edit', { path: 'notes/e.md', oldText: 'a', newText: 'b' }), ['notes/e.md']);         // Pi
});

test('Codex and OpenCode patches: every file the patch adds, updates or moves to', () => {
  const patch = '*** Begin Patch\n*** Add File: research/q3/report.md\n+# Q3\n*** Update File: src/a.ts\n@@\n-x\n+y\n*** Move to: src/b.ts\n*** End Patch';
  assert.deepEqual(writtenPathsOf('apply_patch', { input: patch }), ['research/q3/report.md', 'src/a.ts', 'src/b.ts']);
  assert.deepEqual(writtenPathsOf('apply_patch', { command: ['apply_patch', patch] }), ['research/q3/report.md', 'src/a.ts', 'src/b.ts']);
  assert.deepEqual(writtenPathsOf('patch', { patchText: patch }), ['research/q3/report.md', 'src/a.ts', 'src/b.ts']);
  // A shell command that runs apply_patch counts too.
  assert.deepEqual(writtenPathsOf('Bash', { command: `apply_patch <<'EOF'\n${patch}\nEOF` }), ['research/q3/report.md', 'src/a.ts', 'src/b.ts']);
});

test('reads, plain commands and connections write nothing', () => {
  assert.deepEqual(writtenPathsOf('Read', { file_path: '/r/a.md' }), []);
  assert.deepEqual(writtenPathsOf('read_file', { path: '/r/a.md' }), []);
  assert.deepEqual(writtenPathsOf('Bash', { command: 'ls -la' }), []);
  assert.deepEqual(writtenPathsOf('mcp__munder-github-token__create_issue', { path: 'x.md' }), []);
  assert.deepEqual(writtenPathsOf('str_replace_editor', { command: 'view', path: '/r/a.md' }), []);
});

test('other CLIs\' tools read like Claude\'s in the steps', () => {
  assert.equal(canonicalTool('write_to_file'), 'Write');
  assert.equal(canonicalTool('apply_patch'), 'Edit');
  assert.equal(canonicalTool('run_shell_command'), 'Bash');
  assert.equal(describeTool('write_file').label, 'Wrote a file');
  assert.equal(describeTool('edit').group, 'files');
  assert.equal(summarizeToolInput('apply_patch', { input: '*** Begin Patch\n*** Add File: r/a.md\n+x\n*** End Patch' }), 'r/a.md');
  assert.equal(summarizeToolInput('write', { filePath: '/r/d.md', content: 'secret stuff' }), '/r/d.md');
  assert.equal(summarizeToolInput('exec_command', { command: ['bash', '-lc', 'npm test'] }), 'bash -lc npm test');
});
