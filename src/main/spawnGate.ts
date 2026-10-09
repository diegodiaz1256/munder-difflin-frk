/**
 * Agents start one after another, not all at once.
 *
 * A spawn does ~60-70 ms of synchronous work (the agent's settings, skills and
 * MCP files) before its terminal starts. Six at once, as when a team comes
 * back on launch, ran those stretches back to back and blocked the main thread
 * for ~0.4 s (seen in the freeze log). Through this gate each spawn waits for
 * the previous one and lets the event loop run in between, so the app stays
 * responsive while the team comes up. A spawn that waits on something slow
 * (a WSL bridge, a worktree, a download) gives up its turn after `holdMaxMs`
 * so it does not hold the others back.
 */
export function makeSpawnGate(holdMaxMs = 2000): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<void> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const turn = tail.then(() => new Promise<void>((r) => setImmediate(r)));
    const result = turn.then(fn);
    tail = Promise.race([
      result.then(() => undefined, () => undefined),
      turn.then(() => new Promise<void>((r) => { setTimeout(r, holdMaxMs).unref?.(); }))
    ]);
    return result;
  };
}
