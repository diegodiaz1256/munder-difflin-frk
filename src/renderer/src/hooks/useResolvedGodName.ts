import { useEffect, useState } from 'react';
import { resolveGodName, DEFAULT_GOD_NAME } from '@shared/godIdentity';

const GOD_ID = 'god';

/**
 * God's persisted display name, for the boot screens shown BEFORE the store
 * has god's live agent object (so before `agent.name` exists anywhere to
 * read). Reads the registry directly, the same way useHive.ts's spawn effect
 * does, rather than assuming the default — otherwise a renamed god's own
 * "clocking in" screen would flash the wrong name every launch.
 */
/** The last name read, so a boot screen does not flash the default first. */
const LAST_KEY = 'cth.godName';

export function useResolvedGodName(): string {
  const [godName, setGodName] = useState(() => {
    try { return localStorage.getItem(LAST_KEY) || DEFAULT_GOD_NAME; } catch { return DEFAULT_GOD_NAME; }
  });
  useEffect(() => {
    let cancelled = false;
    void window.cth.hiveRegistry().then((reg) => {
      if (cancelled) return;
      const name = resolveGodName(reg?.agents?.[GOD_ID]?.name);
      setGodName(name);
      try { localStorage.setItem(LAST_KEY, name); } catch { /* best-effort */ }
    }).catch(() => { /* keep the last known while unknown */ });
    return () => { cancelled = true; };
  }, []);
  return godName;
}
