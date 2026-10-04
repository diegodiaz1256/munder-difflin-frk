/**
 * The floor's orchestration, run inside the server process.
 *
 * On a desktop the renderer runs it: useHive (the orchestrator's boot, inbox
 * wake-ups, queue delivery, context rules, revive) and useRestoreTeam. They talk
 * to main only through `window.cth`, the preload's API. Here the very same hooks
 * run under React with no DOM, against the very same preload, whose ipcRenderer
 * is bound straight to main's handler registry (electronShim.rendererBridge).
 * One orchestration, two hosts — nothing is reimplemented for the server.
 */
import { useEffect, useState } from 'react';
import TestRenderer from 'react-test-renderer';
import { bindIpcRenderer, type FakeWebContents } from './electronShim';
import { installBrowserGlobals } from './browserGlobals';

export async function startEngine(wc: FakeWebContents): Promise<void> {
  installBrowserGlobals();
  if (!process.argv.includes('--md-headless')) process.argv.push('--md-headless');
  bindIpcRenderer(wc);
  // Evaluated only now: the preload publishes window.cth on import, and the
  // hooks read the store (which reads localStorage) on import.
  await import('../preload/index');
  const { useHive } = await import('@/hooks/useHive');
  const { useRestoreTeam } = await import('@/hooks/useRestoreTeam');
  const { useStore } = await import('@/store/store');
  const { acquireTerminal } = await import('@/components/terminalPool');
  type Config = Parameters<typeof useHive>[0];

  function Floor(): null {
    const [config, setConfig] = useState<Config>(null);
    useEffect(() => {
      void window.cth.getConfig().then((c) => setConfig(c as Config));
      return window.cth.onConfigChanged((c) => setConfig(c as Config));
    }, []);
    const agents = useStore((s) => s.agents);
    // Keep a screen buffer for every live agent (what a remote view will show).
    useEffect(() => { for (const a of agents) if (a.ptyId) acquireTerminal(a.ptyId); }, [agents]);
    // Same reconcile the desktop does at start: drop agents whose pty is gone.
    useEffect(() => {
      if (!config?.onboardingComplete) return;
      void window.cth.listPtys().then((list) => useStore.getState().reconcileWithLivePtys(list.map((p) => p.id))).catch(() => {});
    }, [config?.onboardingComplete]);
    useHive(config?.onboardingComplete ? config : null);
    useRestoreTeam(config);
    return null;
  }

  TestRenderer.create(<Floor />);
  console.log('[server] floor engine running');
}
