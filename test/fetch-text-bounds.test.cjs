'use strict';
// getText/getBytes (src/main/fetchText.ts) fetch the skill catalog, skill
// files, the model catalog and the hero payload. Each fetch is bounded: a
// relative redirect is followed (it used to throw inside the response
// callback, an uncaught exception in main), redirects stop after five hops and
// may not leave https, a body past the cap is refused, a server that dribbles
// bytes hits the deadline, and binary files come back byte for byte.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const loadTs = require('./load-ts.cjs');

const { getText, getBytes } = loadTs('src/main/fetchText.ts');

// The self-signed localhost pair the Slack timeout test already embeds.
const src = fs.readFileSync(path.join(__dirname, 'slack-timeout.test.cjs'), 'utf8');
const pem = (name) => {
  const m = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\]\\.join`).exec(src);
  return m[1].split('\n').map((l) => l.trim().replace(/^'|',?$/g, '')).filter(Boolean).join('\n');
};

async function server(t, handler) {
  const s = https.createServer({ key: pem('STALL_KEY'), cert: pem('STALL_CERT') }, handler);
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const prev = https.globalAgent.options.rejectUnauthorized;
  https.globalAgent.options.rejectUnauthorized = false;
  t.after(() => {
    https.globalAgent.options.rejectUnauthorized = prev;
    https.globalAgent.destroy();
    s.closeAllConnections?.();
    s.close();
  });
  return `https://127.0.0.1:${s.address().port}`;
}

test('follows a relative redirect and returns binary bytes intact', async (t) => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00, 0xfe]);
  const base = await server(t, (req, res) => {
    if (req.url === '/alias') { res.writeHead(302, { location: '/real.png' }); res.end(); return; }
    res.writeHead(200); res.end(png);
  });
  assert.deepEqual(await getBytes(`${base}/alias`), png);
});

test('stops a redirect loop, and never follows a redirect to http', async (t) => {
  const base = await server(t, (req, res) => {
    if (req.url === '/http') { res.writeHead(302, { location: 'http://127.0.0.1:1/x' }); res.end(); return; }
    res.writeHead(302, { location: '/loop' }); res.end();
  });
  await assert.rejects(getText(`${base}/loop`), /too many redirects/);
  await assert.rejects(getText(`${base}/http`), /non-https/);
});

test('refuses a body past the cap, declared or streamed', async (t) => {
  const base = await server(t, (req, res) => {
    if (req.url === '/declared') { res.writeHead(200, { 'content-length': 2000 }); res.end('x'.repeat(2000)); return; }
    res.writeHead(200); // chunked: no length up front
    res.write('y'.repeat(1500)); res.end('y'.repeat(1500));
  });
  await assert.rejects(getText(`${base}/declared`, { maxBytes: 1000 }), /too large/);
  await assert.rejects(getText(`${base}/chunked`, { maxBytes: 1000 }), /too large/);
});

test('a server that dribbles bytes hits the deadline', async (t) => {
  const base = await server(t, (_req, res) => {
    res.writeHead(200);
    const tick = setInterval(() => res.write('.'), 100);
    res.on('close', () => clearInterval(tick));
  });
  const started = Date.now();
  await assert.rejects(getText(base, { timeoutMs: 800 }), /timed out/);
  assert.ok(Date.now() - started < 3000);
});
