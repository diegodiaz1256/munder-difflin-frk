'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { generateIdentity, publicCard, seal, open, encodeInvite, decodeInvite, newInviteSecret, pqEncapsulate } = loadTs('src/main/teamCrypto.ts');

const alice = generateIdentity('Alice');
const bob = generateIdentity('Bob');
const eve = generateIdentity('Eve');

test('a sealed message opens only for its recipient, signed by its sender', () => {
  const env = seal('hola Bob 👋', alice, publicCard(bob));
  assert.equal(open(env, bob, alice.ed), 'hola Bob 👋');
  assert.ok(!JSON.stringify(env).includes('hola'), 'the relay never sees plaintext');
  assert.throws(() => open(env, eve, alice.ed), /not addressed/);
  assert.throws(() => open({ ...env, t: eve.id }, eve, alice.ed), /bad signature/, 're-addressing breaks the signature');
});

test('tampering or a forged sender is rejected', () => {
  const env = seal('pay 10', alice, publicCard(bob));
  const c = Buffer.from(env.c, 'base64url'); c[0] ^= 1;
  assert.throws(() => open({ ...env, c: c.toString('base64url') }, bob, alice.ed), /bad signature/);
  // Eve seals to Bob claiming to be Alice: signature is Eve's, Bob checks Alice's key.
  const forged = { ...seal('pay 1000', eve, publicCard(bob)), f: alice.id };
  assert.throws(() => open(forged, bob, alice.ed), /bad signature/);
});

test('two seals of the same text differ (fresh ephemeral key and nonce)', () => {
  const a = seal('same', alice, publicCard(bob));
  const b = seal('same', alice, publicCard(bob));
  assert.notEqual(a.c, b.c);
  assert.notEqual(a.e, b.e);
});

test('invites round-trip, carry no private key, and reject junk', () => {
  const inv = { card: publicCard(alice), secret: newInviteSecret(), relay: 'https://ntfy.sh', expiresAt: Date.now() + 1000 };
  const code = encodeInvite(inv);
  assert.match(code, /^mdteam1\./);
  assert.deepEqual(decodeInvite(`  ${code}\n`), inv);
  assert.ok(!code.includes(alice.xPriv) && !Buffer.from(code.slice(8), 'base64url').toString().includes(alice.edPriv));
  assert.equal(decodeInvite('mdteam1.bm90LWpzb24'), null);
  assert.equal(decodeInvite('hello'), null);
  assert.equal(decodeInvite(encodeInvite({ ...inv, relay: 'http://evil' })), null, 'relay must be https');
});

// The app runs this code inside Electron, whose BoringSSL differs from Node's
// OpenSSL (it has no chacha20-poly1305 through createCipheriv, which broke the
// first version in the app while every Node test passed). Seal in Node, open in
// Electron's runtime, and back.
test('hybrid (post-quantum) envelopes open across Node and the Electron runtime the app ships', () => {
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  const fs = require('node:fs');
  const electron = require('electron'); // path to the binary
  const script = path.join(require('node:os').tmpdir(), `md-team-xrt-${process.pid}.cjs`);
  fs.writeFileSync(script, `
    const loadTs = require(${JSON.stringify(path.join(__dirname, 'load-ts.cjs'))});
    const { open, seal, publicCard, pqDecapsulate } = loadTs('src/main/teamCrypto.ts');
    const [me, peer, env, ct] = JSON.parse(process.argv[2]);
    const pq = pqDecapsulate(me, peer.id, ct);
    const got = open(env, me, peer.ed, pq);
    process.stdout.write(JSON.stringify({ got, back: seal('from electron', me, publicCard(peer), pq) }));
  `);
  try {
    const { ct, secret } = pqEncapsulate(alice, publicCard(bob));
    const env = seal('from node', alice, publicCard(bob), secret);
    assert.equal(env.v, 2);
    const out = execFileSync(electron, [script, JSON.stringify([bob, alice, env, ct])], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, cwd: path.join(__dirname, '..'), encoding: 'utf8'
    });
    const { got, back } = JSON.parse(out);
    assert.equal(got, 'from node');
    assert.equal(back.v, 2);
    assert.equal(open(back, alice, bob.ed, secret), 'from electron');
  } finally {
    fs.rmSync(script, { force: true });
  }
});

test('hybrid envelopes: right pair secret opens, wrong or missing one does not, and v cannot be stripped', () => {
  const { ct, secret } = pqEncapsulate(alice, publicCard(bob));
  const { pqDecapsulate } = loadTs('src/main/teamCrypto.ts');
  assert.equal(pqDecapsulate(bob, alice.id, ct), secret);
  const env = seal('hybrid', alice, publicCard(bob), secret);
  assert.equal(env.v, 2);
  assert.equal(open(env, bob, alice.ed, secret), 'hybrid');
  assert.throws(() => open(env, bob, alice.ed));
  assert.throws(() => open(env, bob, alice.ed, pqEncapsulate(alice, publicCard(bob)).secret));
  assert.throws(() => open({ ...env, v: 1 }, bob, alice.ed, secret), /signature/);
  assert.throws(() => pqDecapsulate(bob, alice.id, 'short'));
});
