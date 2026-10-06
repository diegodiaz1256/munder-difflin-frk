/**
 * Local Whisper from the page's side: owns the worker (whisper.worker.ts),
 * answers its cache requests through main (the model files on disk), decodes
 * a recorded clip to 16 kHz mono and asks for its transcript.
 *
 * Dictation never downloads: if the model is not on disk it fails with a
 * clear message. Only downloadWhisper() — the Settings → Voice button — may
 * fetch the files from Hugging Face.
 */

export type WhisperModel = 'small';
type Reply = { type: 'loaded' | 'text' | 'error' | 'progress' | 'cache-match' | 'cache-put'; ref?: number; text?: string; error?: string; file?: string; loaded?: number; total?: number };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: Reply) => void }>();
let onProgress: ((p: { file?: string; loaded: number; total: number }) => void) | null = null;

// Loaded when dictation first needs it, not with the module: the store pulls
// this file in everywhere, and Vite's `?worker` import is something only Vite
// understands (the renderer test harness could not load the store at all).
async function get(): Promise<Worker> {
  if (worker) return worker;
  const { default: WhisperWorker } = await import('./whisper.worker?worker');
  if (worker) return worker;
  worker = new WhisperWorker();
  worker.onmessage = async (ev: MessageEvent) => {
    const m = ev.data as Reply & { id?: number; key?: string; bytes?: Uint8Array };
    if (m.type === 'cache-match' && m.id !== undefined) {
      const value = await window.cth.whisperCacheMatch(m.key ?? '').catch(() => null);
      worker!.postMessage({ type: 'reply', id: m.id, value });
      return;
    }
    if (m.type === 'cache-put' && m.id !== undefined) {
      const value = await window.cth.whisperCachePut(m.key ?? '', m.bytes ?? new Uint8Array()).catch(() => false);
      worker!.postMessage({ type: 'reply', id: m.id, value });
      return;
    }
    if (m.type === 'progress') { onProgress?.({ file: m.file, loaded: m.loaded ?? 0, total: m.total ?? 0 }); return; }
    if (m.ref !== undefined) { pending.get(m.ref)?.resolve(m); pending.delete(m.ref); }
  };
  return worker;
}

function call(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<Reply> {
  const id = ++seq;
  return new Promise((resolve) => { pending.set(id, { resolve }); void get().then((w) => w.postMessage({ ...msg, id }, transfer)); });
}

/** Fetch a model from Hugging Face into the local store. The one online step. */
export async function downloadWhisper(model: WhisperModel, progress?: (p: { file?: string; loaded: number; total: number }) => void): Promise<{ ok: boolean; error?: string }> {
  onProgress = progress ?? null;
  const r = await call({ type: 'load', model, download: true });
  onProgress = null;
  if (r.type === 'error') return { ok: false, error: r.error };
  await window.cth.whisperMarkReady(model, true);
  return { ok: true };
}

/** Delete the downloaded model: local dictation is fully optional. */
export async function removeWhisper(): Promise<void> {
  worker?.terminate();
  worker = null;
  await window.cth.whisperRemove();
}

/** A recorded clip (webm/ogg) as 16 kHz mono samples, which Whisper expects. */
async function decode(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    if (audio.numberOfChannels === 1) return audio.getChannelData(0);
    const out = new Float32Array(audio.length);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const ch = audio.getChannelData(c);
      for (let i = 0; i < ch.length; i++) out[i] += ch[i] / audio.numberOfChannels;
    }
    return out;
  } finally {
    void ctx.close();
  }
}

export async function transcribeLocal(blob: Blob, model: WhisperModel, language?: string): Promise<{ ok: boolean; text?: string; error?: string }> {
  const status = await window.cth.whisperStatus().catch(() => null);
  if (!status?.[model]) return { ok: false, error: 'The local Whisper model is not downloaded. Settings → Voice → Download.' };
  const audio = await decode(blob);
  const r = await call({ type: 'transcribe', model, audio, language }, [audio.buffer]);
  releaseLater();
  if (r.type === 'error') return { ok: false, error: r.error };
  return { ok: true, text: r.text ?? '' };
}

/** The loaded model holds 1–1.5 GB; give it back after a while without
 *  dictation (the next one then reloads it, 20–30 s). */
const IDLE_RELEASE_MS = 5 * 60_000;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
function releaseLater(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { worker?.terminate(); worker = null; idleTimer = null; }, IDLE_RELEASE_MS);
}
