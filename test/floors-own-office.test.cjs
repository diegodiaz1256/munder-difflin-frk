'use strict';
// New Floor starts another office in its own process (floorProfile.ts), and an
// office is run by one process at a time (officeLock.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'md-floors-'));
let userData = base;
const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => userData, setPath: (_k, v) => { userData = v; } } } };
const { floorIdFrom, floorArgs, floorConfigFrom, seedFloor } = loadTs('src/main/floorProfile.ts');
const { claimOffice, officeHolder, releaseOffice, OFFICE_LOCK_FILE } = loadTs('src/main/officeLock.ts');
test.after(() => fs.rmSync(base, { recursive: true, force: true }));

test('a floor id is short hex or nothing, since it becomes a folder name', () => {
  assert.equal(floorIdFrom(['electron', '.', '--md-floor=a1b2c3d4e5']), 'a1b2c3d4e5');
  assert.equal(floorIdFrom(['electron', '--md-floor=../../x']), null);
  assert.equal(floorIdFrom(['electron', '.']), null);
});

test('a floor process gets our args with its own id, no taken debug port, no replayed link', () => {
  assert.deepEqual(
    floorArgs(['electron', '.', '--remote-debugging-port=9343', '--md-floor=aaaaaa', 'munderdifflin://hire?x'], 'bbbbbbbbbb'),
    ['.', '--md-floor=bbbbbbbbbb']
  );
});

test('a new floor keeps settings and keys but not the office or its inbound endpoints', () => {
  const cfg = floorConfigFrom({ harnessHome: 'C:/office', language: 'es', onboardingComplete: true, slackEnabled: true, webhookEnabled: true, recentHomes: ['C:/office'] });
  assert.equal('harnessHome' in cfg, false);
  assert.equal(cfg.slackEnabled, false);
  assert.equal(cfg.webhookEnabled, false);
  assert.equal(cfg.onboardingComplete, true, 'opens on the office picker, not first-run setup');
  assert.deepEqual(cfg.recentHomes, ['C:/office']);

  fs.writeFileSync(path.join(base, 'config.json'), JSON.stringify({ harnessHome: 'C:/office', language: 'es' }));
  fs.writeFileSync(path.join(base, 'config-secrets.json'), '{"enc":"x"}');
  const dir = seedFloor('cccccccccc', base);
  assert.equal(dir, path.join(base, 'floors', 'cccccccccc'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')), { language: 'es', slackEnabled: false, webhookEnabled: false });
  assert.equal(fs.readFileSync(path.join(dir, 'config-secrets.json'), 'utf8'), '{"enc":"x"}');
});

test('one office, one process: a live holder keeps it, a dead one does not', () => {
  const home = fs.mkdtempSync(path.join(base, 'office-'));
  const other = process.pid + 1;
  fs.writeFileSync(path.join(home, OFFICE_LOCK_FILE), JSON.stringify({ pid: other }));
  assert.equal(officeHolder(home, () => true), other);
  assert.deepEqual(claimOffice(home, () => true), { ok: false, pid: other });

  assert.equal(officeHolder(home, () => false), null, 'a crashed holder holds nothing');
  assert.deepEqual(claimOffice(home, () => false), { ok: true });
  assert.equal(officeHolder(home), null, 'our own claim is not "another floor"');

  releaseOffice(home);
  assert.equal(fs.existsSync(path.join(home, OFFICE_LOCK_FILE)), false);
});

test('release only removes our own claim', () => {
  const home = fs.mkdtempSync(path.join(base, 'office-'));
  fs.writeFileSync(path.join(home, OFFICE_LOCK_FILE), JSON.stringify({ pid: process.pid + 1 }));
  releaseOffice(home);
  assert.equal(fs.existsSync(path.join(home, OFFICE_LOCK_FILE)), true);
});

test('a null floor id starts the main profile with our args', () => {
  assert.deepEqual(floorArgs(['electron', '.', '--md-floor=aaaaaa'], null), ['.']);
});

const { listFloors, removeFloor } = loadTs('src/main/floors.ts');

test('the floors list: main first, then the others, newest first, with their offices', () => {
  const root = fs.mkdtempSync(path.join(base, 'list-'));
  const write = (dir, cfg, t) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(cfg));
    fs.utimesSync(path.join(dir, 'config.json'), t, t);
  };
  write(root, { harnessHome: path.join(root, 'Dunder') }, 1000);
  write(path.join(root, 'floors', 'aaaaaaaaaa'), { harnessHome: path.join(root, 'Stamford') }, 2000);
  write(path.join(root, 'floors', 'bbbbbbbbbb'), {}, 3000);
  fs.mkdirSync(path.join(root, 'floors', 'not-a-floor'));
  const running = (home) => (home.endsWith('Stamford') ? 4242 : null);
  const list = listFloors(root, 'bbbbbbbbbb', running);
  assert.deepEqual(list.map((f) => [f.id, f.name, f.running, f.current]), [
    [null, 'Dunder', false, false],
    ['bbbbbbbbbb', null, false, true],
    ['aaaaaaaaaa', 'Stamford', true, false]
  ]);

  assert.equal(removeFloor(root, 'aaaaaaaaaa', 'bbbbbbbbbb', running).ok, false, 'an open floor is not forgotten');
  assert.equal(removeFloor(root, 'bbbbbbbbbb', 'bbbbbbbbbb', running).ok, false, 'nor the one you are on');
  assert.equal(removeFloor(root, '../x', 'bbbbbbbbbb', running).ok, false);
  assert.deepEqual(removeFloor(root, 'aaaaaaaaaa', 'bbbbbbbbbb', () => null), { ok: true });
  assert.equal(fs.existsSync(path.join(root, 'floors', 'aaaaaaaaaa')), false);
  assert.equal(fs.existsSync(path.join(root, 'Stamford')), false, 'never created, and never touched');
});
