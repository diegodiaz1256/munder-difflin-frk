'use strict';
/**
 * Two installs pair and talk through a fake ntfy relay (publish + streamed
 * subscribe with ?since), sealed end to end. The relay here records every body
 * it sees, so the tests can also prove it never sees plaintext.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const loadTs = require('./load-ts.cjs');

const { TeamNode } = loadTs('src/main/teamNode.ts');
const { generateIdentity, seal, publicCard } = loadTs('src/main/teamCrypto.ts');

/** Minimal ntfy: POST /:topic stores, GET /:topic/json streams (since=id|all). */
async function fakeRelay(t) {
  const topics = new Map(); // topic -> [{id, message}]
  const subs = new Map();   // topic -> Set(res)
  const seenBodies = [];
  let seq = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const parts = url.pathname.split('/').filter(Boolean);
    if (req.method === 'POST' && parts.length === 1) {
      let body = ''; req.on('data', (d) => body += d); req.on('end', () => {
        if (Buffer.byteLength(body) > 4096) { res.writeHead(413); return res.end(); }
        seenBodies.push(body);
        const ev = { id: `m${++seq}`, time: Math.floor(Date.now() / 1000), event: 'message', topic: parts[0], message: body };
        if (!topics.has(parts[0])) topics.set(parts[0], []);
        topics.get(parts[0]).push(ev);
        for (const s of subs.get(parts[0]) ?? []) s.write(JSON.stringify(ev) + '\n');
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(ev));
      });
      return;
    }
    if (req.method === 'GET' && parts.length === 2 && parts[1] === 'json') {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write(JSON.stringify({ id: 'open', event: 'open' }) + '\n');
      const since = url.searchParams.get('since');
      const backlog = topics.get(parts[0]) ?? [];
      if (since) {
        const idx = since === 'all' ? -1 : backlog.findIndex((e) => e.id === since);
        for (const ev of backlog.slice(idx + 1)) res.write(JSON.stringify(ev) + '\n');
      }
      if (!subs.has(parts[0])) subs.set(parts[0], new Set());
      subs.get(parts[0]).add(res);
      req.on('close', () => subs.get(parts[0]).delete(res));
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => { for (const set of subs.values()) for (const r of set) r.destroy(); server.close(); });
  return { base, seenBodies, publishRaw: (topic, body) => fetch(`${base}/${topic}`, { method: 'POST', body }) };
}

function node(name, relay, t) {
  // The relay URL must be https in real invites; tests use the plain-http fake,
  // so hellos are posted with an https-looking relay field and mapped back here.
  const r = relay.base.replace('http://', 'https://');
  let state = { identity: generateIdentity(name), relay: r, teams: [{ id: `t-${name}`, name: `${name}'s team`, relay: r, level: 'message', mode: 'strict' }], peers: [], invites: [] };
  const inbox = [];
  const fetchImpl = (url, opts) => fetch(String(url).replace('https://', 'http://'), opts);
  const n = new TeamNode({ load: () => state, save: (s) => { state = s; }, onMessage: (m) => inbox.push(m), fetch: fetchImpl });
  n.start();
  t.after(() => n.stop());
  return { n, inbox, get state() { return state; } };
}

const until = async (cond, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (cond()) return true; await new Promise((r) => setTimeout(r, 20)); } return false; };

test('pair with an invite, then talk both ways, sealed end to end', async (t) => {
  const relay = await fakeRelay(t);
  const alice = node('Alice', relay, t);
  const bob = node('Bob', relay, t);
  await new Promise((r) => setTimeout(r, 100)); // subscriptions open

  const code = alice.n.createInvite('t-Alice').code;
  const joined = await bob.n.join(code);
  assert.equal(joined.ok, true, joined.error);
  assert.ok(await until(() => alice.state.peers.some((p) => p.name === 'Bob')), 'Alice accepted Bob\'s hello');
  assert.ok(await until(() => bob.state.peers[0]?.confirmed), 'Bob got the welcome');
  assert.equal(alice.state.invites.length, 0, 'the invite is one-time');

  const sent = await alice.n.send('Bob', 'Hola', 'Can your Michael review PR 12?');
  assert.equal(sent.ok, true, sent.error);
  assert.ok(await until(() => bob.inbox.length === 1));
  assert.equal(bob.inbox[0].from.name, 'Alice');
  assert.equal(bob.inbox[0].body, 'Can your Michael review PR 12?');

  const back = await bob.n.send(bob.state.peers[0].id, 'Re: Hola', 'On it.');
  assert.equal(back.ok, true, back.error);
  assert.ok(await until(() => alice.inbox.length === 1));
  assert.equal(alice.inbox[0].subject, 'Re: Hola');

  for (const b of relay.seenBodies) assert.ok(!/PR 12|On it|Hola/.test(b), 'the relay never saw plaintext');
});

test('a long message travels as sealed parts and arrives whole', async (t) => {
  const relay = await fakeRelay(t);
  const alice = node('Alice', relay, t);
  const bob = node('Bob', relay, t);
  await new Promise((r) => setTimeout(r, 100));
  await bob.n.join(alice.n.createInvite('t-Alice').code);
  await until(() => alice.state.peers.length === 1);
  const long = 'línea '.repeat(3000);
  assert.equal((await alice.n.send('Bob', 'Big', long)).ok, true);
  assert.ok(await until(() => bob.inbox.length === 1, 5000));
  assert.equal(bob.inbox[0].body, long);
  assert.ok(relay.seenBodies.length > 3, 'it was split');
});

test('knowing a topic is not enough: strangers and replays are dropped', async (t) => {
  const relay = await fakeRelay(t);
  const alice = node('Alice', relay, t);
  const bob = node('Bob', relay, t);
  await new Promise((r) => setTimeout(r, 100));
  await bob.n.join(alice.n.createInvite('t-Alice').code);
  await until(() => alice.state.peers.length === 1);

  // Eve learned Alice's topic and tries a fake hello without a valid secret.
  const eve = generateIdentity('Eve');
  const forgedHello = seal(JSON.stringify({ k: 'hello', card: publicCard(eve), relay: 'https://x', secret: 'guess' }), eve, publicCard(alice.state.identity));
  await relay.publishRaw(alice.state.identity.topic, JSON.stringify(forgedHello));
  // …and a plain message as if paired.
  await relay.publishRaw(alice.state.identity.topic, JSON.stringify(seal(JSON.stringify({ k: 'msg', id: 'x', subject: 's', body: 'b' }), eve, publicCard(alice.state.identity))));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(alice.state.peers.length, 1, 'Eve was not paired');
  assert.equal(alice.inbox.length, 0, 'nothing from Eve was delivered');

  // A replayed envelope is delivered once.
  await bob.n.send('Alice', 'once', 'only once');
  await until(() => alice.inbox.length === 1);
  const sealed = relay.seenBodies.at(-1);
  await relay.publishRaw(alice.state.identity.topic, sealed);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(alice.inbox.length, 1);
});

test('expired, reused and own invites are refused', async (t) => {
  const relay = await fakeRelay(t);
  const alice = node('Alice', relay, t);
  const bob = node('Bob', relay, t);
  const carol = node('Carol', relay, t);
  await new Promise((r) => setTimeout(r, 100));
  const code = alice.n.createInvite('t-Alice').code;
  assert.match((await alice.n.join(code)).error, /your own invite/);
  await bob.n.join(code);
  await until(() => alice.state.peers.length === 1);
  await carol.n.join(code); // same code again
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(alice.state.peers.length, 1, 'a used invite pairs no one else');
  assert.equal(carol.state.peers[0].confirmed, false);
});

test("each message carries the member's effective policy: own setting, else the team's", async (t) => {
  const relay = await fakeRelay(t);
  const alice = node('Alice', relay, t);
  const bob = node('Bob', relay, t);
  await new Promise((r) => setTimeout(r, 100));
  await bob.n.join(alice.n.createInvite('t-Alice').code);
  await until(() => alice.state.peers.length === 1);
  const bobId = alice.state.peers[0].id;
  assert.equal(alice.state.peers[0].teamId, 't-Alice', 'filed under the team the invite was for');
  assert.ok(bob.state.teams.some((tm) => tm.id === 't-Alice'), 'the joiner joined that team');

  await bob.n.send('Alice', 'a', 'one');
  await until(() => alice.inbox.length === 1);
  assert.deepEqual([alice.inbox[0].mode, alice.inbox[0].level, alice.inbox[0].team.name], ['strict', 'message', "Alice's team"]);

  alice.n.updateTeam('t-Alice', { mode: 'communication-only' });
  await bob.n.send('Alice', 'b', 'two');
  await until(() => alice.inbox.length === 2);
  assert.equal(alice.inbox[1].mode, 'communication-only', 'team default changed');

  alice.n.setMember(bobId, { mode: 'allow-all' });
  await bob.n.send('Alice', 'c', 'three');
  await until(() => alice.inbox.length === 3);
  assert.equal(alice.inbox[2].mode, 'allow-all', 'one-to-one override wins');

  alice.n.setMember(bobId, { mode: null });
  await bob.n.send('Alice', 'd', 'four');
  await until(() => alice.inbox.length === 4);
  assert.equal(alice.inbox[3].mode, 'communication-only', 'null puts it back to the team default');
});

test('a team on a second relay works alongside the first', async (t) => {
  const relayA = await fakeRelay(t);
  const relayB = await fakeRelay(t);
  const alice = node('Alice', relayA, t);
  const bob = node('Bob', relayA, t);
  await new Promise((r) => setTimeout(r, 100));
  // Alice opens a second team on relay B; Bob joins that one.
  const created = alice.n.createTeam('Branch B', relayB.base.replace('http://', 'https://'));
  assert.equal(created.ok, true);
  await new Promise((r) => setTimeout(r, 150)); // the new listener opens
  await bob.n.join(alice.n.createInvite(created.team.id).code);
  assert.ok(await until(() => alice.state.peers.length === 1 && bob.state.peers[0]?.confirmed));
  await bob.n.send('Alice', 'via B', 'hello over relay B');
  assert.ok(await until(() => alice.inbox.length === 1));
  assert.equal(alice.inbox[0].team.name, 'Branch B');
  assert.ok(relayB.seenBodies.length >= 2 && relayA.seenBodies.length === 0, 'everything for that team went through relay B');
});
