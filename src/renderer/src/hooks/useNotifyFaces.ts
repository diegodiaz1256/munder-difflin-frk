import { useEffect } from 'react';
import { useStore } from '@/store/store';
import { paintCastPortrait } from '@/scene/office/cast';
import { PORTRAIT_W, PORTRAIT_H } from '@/scene/office/portraitArt';

const SCALE = 4;
const SIZE = PORTRAIT_H * SCALE;

/** One cast portrait on a round badge, as a PNG data URL. */
async function faceUrl(character: Parameters<typeof paintCastPortrait>[1]): Promise<string | null> {
  const face = document.createElement('canvas');
  face.width = PORTRAIT_W * SCALE;
  face.height = PORTRAIT_H * SCALE;
  const fctx = face.getContext('2d');
  if (!fctx) return null;
  fctx.imageSmoothingEnabled = false;
  await paintCastPortrait(fctx, character, SCALE);
  const out = document.createElement('canvas');
  out.width = SIZE;
  out.height = SIZE;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--cth-cream-200').trim() || '#EDE3CF';
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.drawImage(face, Math.round((SIZE - face.width) / 2), 0);
  ctx.restore();
  return out.toDataURL('image/png');
}

/**
 * Hands every agent's face to main, so its desktop notifications (finished,
 * waiting for you, asking you, breaker) carry the face of who sent them.
 * Re-sent when the roster or anyone's character changes.
 */
export function useNotifyFaces(): void {
  const key = useStore((s) => s.agents.map((a) => `${a.id}:${a.name}:${a.character}`).join('|'));
  useEffect(() => {
    let alive = true;
    void (async () => {
      const faces: Record<string, string> = {};
      for (const a of useStore.getState().agents) {
        try {
          const url = await faceUrl(a.character);
          if (!url) continue;
          faces[a.id] = url;
          faces[a.name.trim().toLowerCase()] = url;
        } catch { /* sprite not loaded yet: next change retries */ }
      }
      if (alive && Object.keys(faces).length) void window.cth.setNotifyFaces?.(faces);
    })();
    return () => { alive = false; };
  }, [key]);
}
