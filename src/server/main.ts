/**
 * Scranton Branch as a server: the office with no GUI and no Chromium.
 *
 *   node server/index.cjs --office /srv/office [--name "Build server"]
 *                         [--team-join <invite code>]
 *
 * Built by tools/build-server.cjs: src/main runs unchanged against
 * electronShim (aliased as `electron`), and the floor's orchestration runs in
 * engine.tsx. Deploying: SERVER.md.
 */
import './serverEnv';
import { onWindowLoad } from './electronShim';
import { startEngine } from './engine';

onWindowLoad((wc) => {
  startEngine(wc).catch((e) => {
    console.error('[server] the floor engine failed to start:', e);
    process.exit(1);
  });
});

process.on('unhandledRejection', (e) => console.error('[server] unhandled rejection:', e));

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('../main/index');
