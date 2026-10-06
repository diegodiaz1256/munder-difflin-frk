import { useEffect, useSyncExternalStore } from 'react';
import { useStore } from '@/store/store';
import { activityFromLog, activityFromStep, mergeActivity, type ActivityItem } from '@shared/officeActivity';

/**
 * The office's activity, shared by the "Now" page and the agent cards: the
 * office log (polled, it is a small file tail) and every agent's tool steps
 * (live from the hook stream, history once at start). Loaded on first use,
 * kept while the app runs.
 */
let items: ActivityItem[] = [];
const listeners = new Set<() => void>();
let started = false;

const nameOf = (id: string): string => {
  if (id === 'human') return 'you';
  const st = useStore.getState();
  return [...st.agents, ...st.archivedAgents].find((a) => a.id === id)?.name ?? id;
};

function set(next: ActivityItem[]): void {
  if (next === items) return;
  items = next;
  for (const l of listeners) l();
}

async function pollLog(): Promise<void> {
  const log = await window.cth.hiveLog(400).catch(() => []);
  const add = (log as Array<Record<string, unknown>>).map((e) => activityFromLog(e, nameOf)).filter((x): x is ActivityItem => !!x);
  set(mergeActivity(items, add));
}

function start(): void {
  if (started) return;
  started = true;
  void pollLog();
  setInterval(() => { void pollLog(); }, 4000);
  for (const a of useStore.getState().agents) {
    void window.cth.hiveSteps(a.id).then((evs) => {
      set(mergeActivity(items, evs.map((e) => activityFromStep(e, nameOf)).filter((x): x is ActivityItem => !!x)));
    }).catch(() => { /* no history */ });
  }
  window.cth.onHiveHookEvent((e) => {
    const it = activityFromStep(e, nameOf);
    if (it) set(mergeActivity(items, [it]));
  });
}

export function useOfficeActivity(): ActivityItem[] {
  useEffect(() => { start(); }, []);
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => items,
    () => items
  );
}
