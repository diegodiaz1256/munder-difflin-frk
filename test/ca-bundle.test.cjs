'use strict';
// Settings → AI Engines → Certificates (src/main/caBundle.ts): one bundle with
// Node's roots + the user's CA + the Windows / WSL stores, de-duplicated, and
// the env that points every agent's TLS stack at it.
const test = require('node:test');
const assert = require('node:assert/strict');
const tls = require('node:tls');
const loadTs = require('./load-ts.cjs');

const { splitPem, combinePem, buildCaBundle, tlsEnv, tlsActive } = loadTs('src/main/caBundle.ts');

const [rootA, rootB] = tls.rootCertificates;
const corp = tls.rootCertificates[5];

test('PEM blocks are found, normalized and de-duplicated', () => {
  const messy = `junk\r\n${rootA.replace(/\n/g, '\r\n')}\nmore junk\n${rootA}`;
  assert.equal(splitPem(messy).length, 2);
  assert.equal(combinePem([splitPem(messy)]).match(/BEGIN CERTIFICATE/g).length, 1, 'same cert once');
  assert.deepEqual(splitPem('no certs here'), []);
});

test('the bundle keeps Node\'s roots and adds every chosen source', async () => {
  const r = await buildCaBundle({ caFile: '/x/corp.pem', trustWindows: true, trustWsl: true }, {
    nodeRoots: [rootA],
    readCaFile: () => corp,
    windowsStore: async () => `${rootB}\n${rootA}`,
    wslStore: async () => rootB
  });
  assert.equal(r.count, 3, 'A + corp + B, duplicates dropped');
  assert.deepEqual(r.errors, []);
});

test('a source that fails is reported, the rest still builds', async () => {
  const r = await buildCaBundle({ caFile: '/missing.pem', trustWindows: true }, {
    nodeRoots: [rootA],
    readCaFile: () => { throw new Error('ENOENT'); },
    windowsStore: async () => { throw new Error('blocked by policy'); },
    wslStore: async () => ''
  });
  assert.equal(r.count, 1);
  assert.equal(r.errors.length, 2);
  assert.match(r.errors.join(' '), /missing\.pem/);
  assert.match(r.errors.join(' '), /blocked by policy/);
});

test('agents get the bundle for Node, OpenSSL/Go and Python; "don\'t verify" only when chosen', () => {
  assert.deepEqual(tlsEnv(undefined, '/b.pem'), {});
  assert.equal(tlsActive({ verify: true }), false);
  const on = tlsEnv({ trustWindows: true }, '/b.pem');
  assert.deepEqual(on, { NODE_EXTRA_CA_CERTS: '/b.pem', SSL_CERT_FILE: '/b.pem', REQUESTS_CA_BUNDLE: '/b.pem', CURL_CA_BUNDLE: '/b.pem' });
  assert.equal(on.NODE_TLS_REJECT_UNAUTHORIZED, undefined);
  assert.equal(tlsEnv({ verify: false }, null).NODE_TLS_REJECT_UNAUTHORIZED, '0');
});
