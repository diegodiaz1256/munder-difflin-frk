'use strict';
// cdpRead (src/main/cdpBrowse.ts) holds one of the office browser's few slots.
// If the engine drops the connection mid-page, the command in flight must fail
// at once; before, it stayed pending forever and the slot was never returned.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { WebSocketServer } = require('ws');
const loadTs = require('./load-ts.cjs');

const { cdpRead } = loadTs('src/main/cdpBrowse.ts');

test('an engine that closes the tab mid-command fails the read instead of hanging', async (t) => {
  const srv = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url.startsWith('/json/new')) {
      res.end(JSON.stringify({ id: 't1', webSocketDebuggerUrl: `ws://127.0.0.1:${srv.address().port}/devtools/page/t1` }));
    } else res.end('{}');
  });
  const wss = new WebSocketServer({ server: srv });
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      const { id, method } = JSON.parse(String(raw));
      // Answer the setup, then die on navigation like a crashed engine.
      if (method === 'Page.navigate') { ws.terminate(); return; }
      ws.send(JSON.stringify({ id, result: {} }));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(() => { wss.close(); srv.closeAllConnections?.(); srv.close(); });

  const started = Date.now();
  await assert.rejects(cdpRead(srv.address().port, 'https://example.com/', '1'), /closed|failed/);
  assert.ok(Date.now() - started < 5000, 'failed promptly, not after a timeout');
});
