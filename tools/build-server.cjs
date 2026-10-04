#!/usr/bin/env node
/**
 * Build the GUI-less server: out/server/
 *   index.cjs      src/server/main.ts bundled — src/main with `electron`
 *                  aliased to src/server/electronShim.ts, plus the floor's
 *                  orchestration hooks from the renderer
 *   resources/     what the desktop app ships as extraResources
 *   package.json   only the native dependencies, installed on the target
 *                  (`npm install --omit=dev` builds them for its Node)
 *
 * Usage: node tools/build-server.cjs
 */
const { build } = require('esbuild');
const { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } = require('node:fs');
const { join, resolve } = require('node:path');

const root = resolve(__dirname, '..');
const out = join(root, 'out', 'server');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// Native or deliberately external: installed on the target, not bundled.
const NATIVE = ['node-pty', 'better-sqlite3'];

/** Renderer modules the server swaps for its own. */
const swaps = {
  name: 'server-swaps',
  setup(b) {
    b.onResolve({ filter: /^electron$/ }, () => ({ path: join(root, 'src/server/electronShim.ts') }));
    b.onResolve({ filter: /^@\/components\/terminalPool$/ }, () => ({ path: join(root, 'src/server/terminalPool.ts') }));
    // Styles and images mean nothing without a page.
    b.onResolve({ filter: /\.(css|png|jpe?g|gif|svg|webp|mp3|wav|woff2?)(\?.*)?$/ }, (a) => ({ path: a.path, namespace: 'empty' }));
    b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: 'export default ""', loader: 'js' }));
  }
};

(async () => {
  // Clean everything but an installed node_modules (rebuilding natives is slow).
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(out)) if (f !== 'node_modules') rmSync(join(out, f), { recursive: true, force: true });
  await build({
    entryPoints: [join(root, 'src/server/main.ts')],
    outfile: join(out, 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    sourcemap: 'linked',
    minify: false,
    jsx: 'automatic',
    external: [...NATIVE, './slack-trigger.cjs', './kg-core.cjs'],
    alias: {
      '@': join(root, 'src/renderer/src'),
      '@shared': join(root, 'src/shared'),
      '@brand': join(root, 'docs')
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      // This fork ships no product analytics (see electron.vite.config.ts).
      __POSTHOG_KEY__: JSON.stringify(''),
      __POSTHOG_HOST__: JSON.stringify(''),
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
      'import.meta.env.MODE': '"production"',
      'import.meta.env': '{}',
      'process.env.NODE_ENV': '"production"'
    },
    plugins: [swaps],
    logLevel: 'warning'
  });

  // Sidecars main require()s from its own directory.
  copyFileSync(join(root, 'src/main/slack-trigger.cjs'), join(out, 'slack-trigger.cjs'));
  copyFileSync(join(root, 'src/main/kg-core.cjs'), join(out, 'kg-core.cjs'));
  // The desktop's extraResources.
  const res = join(out, 'resources');
  mkdirSync(res, { recursive: true });
  copyFileSync(join(root, 'resources/md-slack-reply.cjs'), join(res, 'md-slack-reply.cjs'));
  copyFileSync(join(root, 'resources/kg.cjs'), join(res, 'kg.cjs'));
  copyFileSync(join(root, 'src/main/kg-core.cjs'), join(res, 'kg-core.cjs'));
  cpSync(join(root, 'resources/skills'), join(res, 'skills'), { recursive: true });

  // Deployment: install.sh at the top, its unit and env template beside it.
  copyFileSync(join(root, 'packaging/server/install.sh'), join(out, 'install.sh'));
  mkdirSync(join(out, 'packaging'), { recursive: true });
  for (const f of ['munder-difflin.service', 'server.env.example']) {
    copyFileSync(join(root, 'packaging/server', f), join(out, 'packaging', f));
  }

  const deps = Object.fromEntries(NATIVE.map((n) => [n, pkg.dependencies[n]]));
  writeFileSync(join(out, 'package.json'), JSON.stringify({
    name: 'munder-difflin-server',
    version: pkg.version,
    private: true,
    description: 'Munder Difflin office, headless: no GUI, no Chromium.',
    license: pkg.license,
    main: 'index.cjs',
    bin: { 'munder-difflin-server': 'index.cjs' },
    engines: { node: '>=20' },
    dependencies: deps
  }, null, 2) + '\n');
  console.log(`[build-server] ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });
