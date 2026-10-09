'use strict';
// An office inside a project's repo: its files never show up in that
// project's git (src/main/gitExclude.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');
const { excludeOfficeFromRepo, missingExcludeText, excludeLines, EXCLUDE_HEADER } = loadTs('src/main/gitExclude.ts');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function repo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-exclude-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q');
  fs.writeFileSync(path.join(dir, 'app.js'), 'console.log(1)\n');
  return dir;
}

function fillOffice(office) {
  fs.mkdirSync(path.join(office, 'hive', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(office, 'hive', 'board.md'), '# board\n');
  fs.mkdirSync(path.join(office, 'palace'), { recursive: true });
  fs.writeFileSync(path.join(office, 'palace', 'x.db'), 'x');
  fs.mkdirSync(path.join(office, 'worktrees', 'pam'), { recursive: true });
  fs.writeFileSync(path.join(office, 'worktrees', 'pam', 'f'), 'x');
  fs.writeFileSync(path.join(office, 'roster.json'), '{}');
  fs.mkdirSync(path.join(office, 'roster-backups'), { recursive: true });
  fs.writeFileSync(path.join(office, 'roster-backups', 'a.json'), '{}');
}

test('an office at the root of a project repo: git status shows only the project', async (t) => {
  const dir = repo(t);
  fillOffice(dir);
  assert.ok(await excludeOfficeFromRepo(dir));
  assert.equal(git(dir, 'status', '--porcelain', '--untracked-files=all'), '?? app.js');
  assert.equal(fs.existsSync(path.join(dir, '.gitignore')), false, 'the project .gitignore is not touched');
});

test('an office in a subfolder of the repo, written once however often it runs', async (t) => {
  const dir = repo(t);
  const office = path.join(dir, 'tools', 'office');
  fillOffice(office);
  await excludeOfficeFromRepo(office);
  await excludeOfficeFromRepo(office);
  assert.equal(git(dir, 'status', '--porcelain', '--untracked-files=all'), '?? app.js');
  const exclude = fs.readFileSync(path.join(dir, '.git', 'info', 'exclude'), 'utf8');
  assert.equal(exclude.split(EXCLUDE_HEADER).length, 2, 'one block');
  assert.ok(exclude.includes('/tools/office/hive/'));
});

test('not a repo: nothing happens', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-exclude-norepo-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(await excludeOfficeFromRepo(dir), null);
});

test('appending keeps what was there', () => {
  const lines = excludeLines('');
  const add = missingExcludeText('# mine\n*.log', lines);
  assert.ok(add.startsWith('\n' + EXCLUDE_HEADER));
  assert.equal(missingExcludeText('# mine\n*.log' + add, lines), '');
});
