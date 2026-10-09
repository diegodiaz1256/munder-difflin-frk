'use strict';
// Claude Code sends its own agent_id on tool calls made inside a subagent. The
// hook shim used to keep it, so the office looked up the limits (folders, git)
// of an agent it did not know and checked nothing: a contained agent could get
// past its guard by handing the work to a subagent.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const loadTs = require('./load-ts.cjs');
const { HiveManager } = loadTs('src/main/hive.ts');

async function runShim(t, payload) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-subagent-id-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  const shim = path.join(home, 'hive', 'bin', 'cth-hook.cjs');
  const sock = hive.sockPath();
  const got = [];
  const server = net.createServer((conn) => {
    let buf = '';
    conn.on('error', () => {});
    conn.on('data', (d) => { buf += d; if (buf.includes('\n')) conn.end(JSON.stringify({}) + '\n'); });
    conn.on('close', () => { if (buf) got.push(JSON.parse(buf.split('\n')[0])); });
  });
  await new Promise((r) => server.listen(sock, r));
  t.after(() => server.close());
  await new Promise((resolve) => {
    const child = spawn(process.execPath, [shim], { env: { ...process.env, AGENT_ID: 'jim', HIVE_SOCK: sock }, stdio: ['pipe', 'ignore', 'ignore'] });
    child.stdin.end(JSON.stringify(payload));
    child.on('close', resolve);
  });
  await new Promise((r) => setTimeout(r, 200));
  return got[0];
}

test('a call made inside a subagent is reported as the agent, with the subagent alongside', async (t) => {
  const p = await runShim(t, { hook_event_name: 'PreToolUse', tool_name: 'Read', agent_id: 'af48f5f85f52aac0e', agent_type: 'general-purpose' });
  assert.equal(p.agent_id, 'jim', 'the office checks the limits of the agent that owns this process');
  assert.equal(p.subagent_id, 'af48f5f85f52aac0e');
});

test('an ordinary call is unchanged', async (t) => {
  const p = await runShim(t, { hook_event_name: 'PreToolUse', tool_name: 'Read' });
  assert.equal(p.agent_id, 'jim');
  assert.equal(p.subagent_id, undefined);
});
