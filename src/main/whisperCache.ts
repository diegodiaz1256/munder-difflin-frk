/**
 * Local Whisper (offline dictation): the model files on disk.
 *
 * Transcription runs in the renderer (transformers.js in a worker, WASM or
 * WebGPU). Its file cache is this: one file per URL it fetched from Hugging
 * Face, under userData/whisper. Files arrive only while the user downloads a
 * model from Settings → Voice; afterwards dictation reads them back from here
 * and never goes online (the renderer turns remote models off).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Only Hugging Face model files are ever stored or served. */
const ALLOWED = /^https:\/\/huggingface\.co\/onnx-community\/whisper-[a-z0-9.-]+\/resolve\/[^\s]+$/;
const MAX_FILE = 3 * 1024 * 1024 * 1024;
export const WHISPER_MODELS = ['small'] as const;
export type WhisperModel = (typeof WHISPER_MODELS)[number];

export function isWhisperModel(v: unknown): v is WhisperModel {
  return typeof v === 'string' && (WHISPER_MODELS as readonly string[]).includes(v);
}

export class WhisperCache {
  constructor(private readonly root: string) {}

  private file(key: string): string {
    return join(this.root, 'cache', createHash('sha256').update(key).digest('hex'));
  }

  /** The cached bytes for a model-file URL, or null. */
  match(key: unknown): Buffer | null {
    if (typeof key !== 'string' || !ALLOWED.test(key)) return null;
    const f = this.file(key);
    return existsSync(f) ? readFileSync(f) : null;
  }

  put(key: unknown, bytes: unknown): boolean {
    if (typeof key !== 'string' || !ALLOWED.test(key)) return false;
    const buf = bytes instanceof Uint8Array ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : bytes instanceof ArrayBuffer ? Buffer.from(bytes) : null;
    if (!buf || buf.byteLength > MAX_FILE) return false;
    mkdirSync(join(this.root, 'cache'), { recursive: true });
    writeFileSync(this.file(key), buf);
    return true;
  }

  /** A model counts as downloaded once its load completed with everything cached. */
  isReady(model: WhisperModel): boolean {
    return existsSync(join(this.root, `${model}.ready`));
  }

  markReady(model: WhisperModel, ready: boolean): void {
    mkdirSync(this.root, { recursive: true });
    const f = join(this.root, `${model}.ready`);
    if (ready) writeFileSync(f, new Date().toISOString());
    else rmSync(f, { force: true });
  }

  /** Delete every downloaded file: local dictation is fully optional. */
  removeAll(): void {
    rmSync(this.root, { recursive: true, force: true });
  }

  /** Bytes on disk, for Settings. */
  size(): number {
    const dir = join(this.root, 'cache');
    if (!existsSync(dir)) return 0;
    return readdirSync(dir).reduce((n, f) => n + statSync(join(dir, f)).size, 0);
  }
}
