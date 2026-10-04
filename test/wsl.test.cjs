'use strict';
// WSL offices (src/main/wsl.ts): where a floor lives decides where it runs, so
// path translation and the wsl.exe command line have to be exactly right.
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { parseWslPath, toWslUnc, toLinuxPath, linuxizeText, wslCommand, parseDistroList } = loadTs('src/main/wsl.ts');

test('a \\\\wsl.localhost or \\\\wsl$ path is a WSL floor, a drive path is not', () => {
  assert.deepEqual(parseWslPath('\\\\wsl.localhost\\Ubuntu\\home\\diego\\offices\\shop'), { distro: 'Ubuntu', linuxPath: '/home/diego/offices/shop' });
  assert.deepEqual(parseWslPath('\\\\wsl$\\Ubuntu-24.04\\home\\d\\'), { distro: 'Ubuntu-24.04', linuxPath: '/home/d' });
  assert.deepEqual(parseWslPath('//wsl.localhost/Debian/srv/x'), { distro: 'Debian', linuxPath: '/srv/x' });
  assert.deepEqual(parseWslPath('\\\\wsl.localhost\\Ubuntu'), { distro: 'Ubuntu', linuxPath: '/' });
  assert.equal(parseWslPath('G:\\Documentos\\office'), null);
  assert.equal(parseWslPath('\\\\server\\share\\x'), null);
  assert.equal(parseWslPath(''), null);
});

test('round trip between the Linux path and the Windows path', () => {
  const unc = toWslUnc('Ubuntu', '/home/diego/offices/shop');
  assert.equal(unc, '\\\\wsl.localhost\\Ubuntu\\home\\diego\\offices\\shop');
  assert.deepEqual(parseWslPath(unc), { distro: 'Ubuntu', linuxPath: '/home/diego/offices/shop' });
});

test('paths as a process inside the distro sees them', () => {
  assert.equal(toLinuxPath('\\\\wsl.localhost\\Ubuntu\\home\\d\\o', 'ubuntu'), '/home/d/o');
  assert.equal(toLinuxPath('G:\\Documentos\\Github\\x', 'Ubuntu'), '/mnt/g/Documentos/Github/x');
  assert.equal(toLinuxPath('C:\\', 'Ubuntu'), '/mnt/c');
  assert.equal(toLinuxPath('\\\\wsl.localhost\\Debian\\x', 'Ubuntu'), null, "another distro's files have no path here");
  assert.equal(toLinuxPath('relative/thing', 'Ubuntu'), 'relative/thing');
});

test('UNC paths inside text (prompts, settings) become Linux paths', () => {
  const text = 'Your inbox is \\\\wsl.localhost\\Ubuntu\\home\\d\\o\\hive\\agents\\god\\inbox; read "\\\\wsl$\\Ubuntu\\home\\d\\o\\hive\\tasks.json".';
  assert.equal(linuxizeText(text, 'Ubuntu'), 'Your inbox is /home/d/o/hive/agents/god/inbox; read "/home/d/o/hive/tasks.json".');
  assert.equal(linuxizeText('\\\\wsl.localhost\\Debian\\x', 'Ubuntu'), '\\\\wsl.localhost\\Debian\\x', 'other distros untouched');
});

test('the wsl.exe command runs through a login shell, in the right folder, with env', () => {
  const c = wslCommand('Ubuntu', '/home/d/o', 'claude', ['--model', 'opus'], { MD_AGENT_ID: 'god', 'BAD-NAME': 'x' });
  assert.equal(c.file, 'wsl.exe');
  assert.deepEqual(c.args, ['-d', 'Ubuntu', '--cd', '/home/d/o', '--', 'bash', '-lc', 'exec "$@"', 'bash', 'env', 'MD_AGENT_ID=god', 'claude', '--model', 'opus']);
});

test('wsl -l -q output (UTF-16LE with a BOM) parses to distro names', () => {
  const raw = Buffer.from('\uFEFFUbuntu\r\nDebian\r\ndocker-desktop\r\n\r\n', 'utf16le');
  assert.deepEqual(parseDistroList(raw), ['Ubuntu', 'Debian']);
  assert.deepEqual(parseDistroList('Ubuntu-24.04\n'), ['Ubuntu-24.04']);
});
