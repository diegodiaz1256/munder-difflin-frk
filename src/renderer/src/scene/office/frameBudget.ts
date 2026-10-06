import type { Ticker } from 'pixi.js';

/**
 * Frame budget for the pixel-art scenes (the office floor, a factory). Left at
 * Pixi's default they redraw at the screen's refresh rate: on a 240 Hz screen an
 * idle office cost 61% of a core in the renderer and 23% in the GPU process,
 * which a laptop pays for in heat and battery. Pixel art at 30 fps looks the
 * same; with nobody working there is little to animate, and behind another
 * window (still visible) even less. Hidden or covered by a terminal, the floor
 * stops altogether (OfficeFloor `paused`).
 */
export const FOCUSED_FPS = 30;
export const QUIET_FPS = 15;
export const BACKGROUND_FPS = 10;

export function sceneFps(hasFocus: boolean, busy: boolean): number {
  if (!hasFocus) return BACKGROUND_FPS;
  return busy ? FOCUSED_FPS : QUIET_FPS;
}

/** Apply the budget now, on focus changes and every 2 s (for `busy`). Returns the cleanup. */
export function limitSceneFps(ticker: Ticker, busy: () => boolean = () => true): () => void {
  const apply = (): void => {
    let b = true;
    try { b = busy(); } catch { /* keep the full rate */ }
    ticker.maxFPS = sceneFps(document.hasFocus(), b);
  };
  apply();
  window.addEventListener('focus', apply);
  window.addEventListener('blur', apply);
  const timer = setInterval(apply, 2000);
  return () => {
    clearInterval(timer);
    window.removeEventListener('focus', apply);
    window.removeEventListener('blur', apply);
  };
}
