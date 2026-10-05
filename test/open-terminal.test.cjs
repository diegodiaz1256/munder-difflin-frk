'use strict';
// "Open a terminal here" on every platform (src/main/openTerminal.ts). It only
// knew macOS, so Windows and Linux failed with "spawn open ENOENT".
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { terminalLaunches } = loadTs('src/main/openTerminal.ts');

test('a WSL folder opens inside its distribution, at the Linux path', () => {
  const [wt, cmd] = terminalLaunches('\\\\wsl.localhost\\Ubuntu\\home\\pam\\shop', 'win32');
  assert.deepEqual(wt, { file: 'wt.exe', args: ['-w', '0', 'nt', 'wsl.exe', '-d', 'Ubuntu', '--cd', '/home/pam/shop'] });
  assert.equal(cmd.file, 'cmd.exe');
  assert.match(cmd.args.join(' '), /wsl\.exe -d "Ubuntu" --cd "\/home\/pam\/shop"/);
});

test('a Windows folder: Windows Terminal, then a console; paths with spaces quoted', () => {
  const [wt, cmd] = terminalLaunches('C:\\Users\\Pam\\My Project', 'win32');
  assert.deepEqual(wt.args, ['-w', '0', 'nt', '-d', 'C:\\Users\\Pam\\My Project']);
  assert.match(cmd.args.join(' '), /start "" \/D "C:\\Users\\Pam\\My Project" cmd\.exe/);
  assert.equal(cmd.verbatim, true);
});

test('macOS keeps Terminal.app; Linux tries the usual terminals', () => {
  assert.deepEqual(terminalLaunches('/Users/pam/shop', 'darwin'), [{ file: 'open', args: ['-a', 'Terminal', '/Users/pam/shop'] }]);
  const linux = terminalLaunches('/home/pam/shop', 'linux').map((t) => t.file);
  assert.deepEqual(linux.slice(0, 2), ['x-terminal-emulator', 'gnome-terminal']);
});
