'use strict';
// The qwen/crush proxy sidecar (PROXY_BRIDGE_SHIM in src/main/hive.ts) talks to
// the user's endpoint. With a company/self-signed certificate it must fail by
// default, work once the app's CA bundle is passed (UPSTREAM_CA_FILE), and with
// verification off only when the user chose that (UPSTREAM_INSECURE=1).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { spawn, spawnSync } = require('node:child_process');

const hasOpenssl = spawnSync('openssl', ['version']).status === 0;

test('the proxy trusts the app\'s CA bundle, and skips verification only when told', { skip: !hasOpenssl && 'openssl not installed' }, async (t) => {
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'md-proxy-tls-'));
  t.after(() => fs.rmSync(D, { recursive: true, force: true }));
  spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(D, 'key.pem'), '-out', path.join(D, 'cert.pem'),
    '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1']);
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'hive.ts'), 'utf8');
  const shim = eval('`' + src.match(/const PROXY_BRIDGE_SHIM = `([\s\S]*?)`;\n/)[1] + '`'); // eslint-disable-line no-eval
  fs.writeFileSync(path.join(D, 'shim.cjs'), shim);

  const up = https.createServer({ key: fs.readFileSync(path.join(D, 'key.pem')), cert: fs.readFileSync(path.join(D, 'cert.pem')) },
    (_q, r) => { r.setHeader('content-type', 'text/plain'); r.end('upstream ok'); });
  await new Promise((r) => up.listen(0, '127.0.0.1', r));
  t.after(() => up.close());
  const upUrl = `https://127.0.0.1:${up.address().port}`;

  const through = (env) => new Promise((done) => {
    const p = spawn(process.execPath, [path.join(D, 'shim.cjs')], {
      env: { ...process.env, UPSTREAM_BASE_URL: upUrl, HIVE_SOCK: path.join(D, 'no-sock'), AGENT_ID: 'a', ...env },
      stdio: ['ignore', 'pipe', 'ignore']
    });
    p.stdout.once('data', (d) => {
      const { port } = JSON.parse(String(d).split('\n')[0]);
      http.get(`http://127.0.0.1:${port}/models`, (res) => {
        let b = '';
        res.on('data', (c) => { b += c; });
        res.on('end', () => { p.kill(); done({ status: res.statusCode, body: b }); });
      }).on('error', (e) => { p.kill(); done({ status: 0, body: e.message }); });
    });
  });

  assert.equal((await through({})).status, 502, 'an unknown certificate is refused');
  assert.deepEqual(await through({ UPSTREAM_CA_FILE: path.join(D, 'cert.pem') }), { status: 200, body: 'upstream ok' });
  assert.deepEqual(await through({ UPSTREAM_INSECURE: '1' }), { status: 200, body: 'upstream ok' });
});
