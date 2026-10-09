/**
 * One place that fetches over https.
 *
 * Extracted from skills.ts when the hero payload needed the same thing: two
 * copies of redirect-following, timeout and status handling would drift, and the
 * one that drifted would be the one nobody was looking at.
 *
 * https only, by construction — every caller fetches from raw.githubusercontent
 * or a repo URL, and an http: fallback would silently downgrade content the app
 * then renders. A redirect may not leave https either.
 *
 * Bounded three ways: a deadline for the whole fetch (redirects included, so a
 * server that dribbles bytes cannot hold it open), at most MAX_REDIRECTS hops,
 * and at most `maxBytes` of body.
 */
import { request as httpsRequest } from 'node:https';

const MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

export interface FetchOpts { timeoutMs?: number; maxBytes?: number }

/** The body as raw bytes: what a skill's images, fonts or templates need. */
export function getBytes(url: string, opts: FetchOpts = {}): Promise<Buffer> {
  const timeoutMs = opts.timeoutMs ?? 12000;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  return new Promise((resolve, reject) => {
    let settled = false;
    let current: ReturnType<typeof httpsRequest> | null = null;
    const finish = (err: Error | null, body?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (err) { current?.destroy(); reject(err); } else resolve(body as Buffer);
    };
    const deadline = setTimeout(() => finish(new Error('timed out')), timeoutMs);

    const get = (target: string, hops: number) => {
      let u: URL;
      try { u = new URL(target); } catch { finish(new Error(`invalid URL: ${target}`)); return; }
      if (u.protocol !== 'https:') { finish(new Error(`refusing a non-https URL: ${u.protocol}`)); return; }
      const req = httpsRequest(u, { method: 'GET', headers: { 'user-agent': 'munder-difflin' } }, (res) => {
        const status = res.statusCode ?? 0;
        // raw.githubusercontent redirects branch aliases; follow, relative or not.
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (hops >= MAX_REDIRECTS) { finish(new Error('too many redirects')); return; }
          get(new URL(res.headers.location, u).href, hops + 1);
          return;
        }
        if (status !== 200) { res.resume(); finish(new Error(`HTTP ${status}`)); return; }
        if (Number(res.headers['content-length'] ?? 0) > maxBytes) { finish(new Error('response too large')); return; }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) { finish(new Error('response too large')); return; }
          chunks.push(c);
        });
        res.on('end', () => finish(null, Buffer.concat(chunks)));
        res.on('error', (e) => finish(e));
      });
      current = req;
      req.on('error', (e) => finish(e));
      req.end();
    };
    get(url, 0);
  });
}

export function getText(url: string, opts: FetchOpts = {}): Promise<string> {
  return getBytes(url, opts).then((b) => b.toString('utf8'));
}
