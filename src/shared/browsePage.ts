/**
 * The office browser (main/browser.ts): agents read pages through the app's
 * own Chromium instead of a plain HTTP client. Many sites answer a bare client
 * (curl, an HTTP library, a fetch tool's user agent) with 403 or an empty
 * shell that only JavaScript fills; a real browser gets the page. It does NOT
 * solve captchas, pass bot challenges or fake a fingerprint: a page that asks
 * for one comes back as it is.
 *
 * Pure helpers here so they can be tested without Electron.
 */

export const BROWSE_DEFAULT_CHARS = 20_000;
export const BROWSE_MAX_CHARS = 100_000;

/** Why an agent may not open this URL, or null. http(s) only; never the cloud
 *  metadata address (169.254.169.254 and its link-local range). Local dev
 *  servers (localhost) are allowed: checking one's own site is a real use. */
export function browseUrlProblem(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return 'a URL is required';
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return 'not a valid URL'; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'only http and https pages can be opened';
  if (u.username || u.password) return 'URLs with credentials are not allowed';
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (/^169\.254\./.test(host) || host === 'metadata.google.internal' || host.startsWith('fe80:')) return 'link-local and cloud metadata addresses are not allowed';
  return null;
}

/** Chromium's user agent without the tokens Electron and the app add, i.e.
 *  what the same Chrome would send. */
export function chromeUserAgent(electronUa: string): string {
  return electronUa
    .replace(/\s(?!Chrome\/|Safari\/|AppleWebKit\/|Mozilla\/)[A-Za-z][\w.-]*\/\S+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Characters to return: default, capped. */
export function browseChars(requested: unknown): number {
  const n = typeof requested === 'number' && Number.isFinite(requested) ? Math.floor(requested) : BROWSE_DEFAULT_CHARS;
  return Math.max(500, Math.min(BROWSE_MAX_CHARS, n));
}

/** Runs in the page: its title, final URL, readable text and (optionally) links. */
export const EXTRACT_PAGE_SCRIPT = `(() => {
  const links = [];
  const seen = new Set();
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.href;
    if (!/^https?:/.test(href) || seen.has(href)) continue;
    seen.add(href);
    const text = (a.innerText || a.textContent || '').replace(/\\s+/g, ' ').trim();
    if (text) links.push({ text: text.slice(0, 120), href });
    if (links.length >= 200) break;
  }
  for (const el of document.querySelectorAll('script, style, noscript, svg, iframe, template')) el.remove();
  const text = document.body ? document.body.innerText : '';
  return { title: document.title || '', url: location.href, text, links };
})()`;

/** Runs on DuckDuckGo's HTML results page: title, URL and snippet per result. */
export const EXTRACT_SEARCH_SCRIPT = `(() => {
  const out = [];
  for (const r of document.querySelectorAll('.result')) {
    const a = r.querySelector('a.result__a');
    if (!a) continue;
    const snippet = r.querySelector('.result__snippet');
    out.push({ title: (a.innerText || '').trim(), href: a.href, snippet: snippet ? snippet.innerText.trim() : '' });
    if (out.length >= 15) break;
  }
  return { results: out, text: out.length ? '' : (document.body ? document.body.innerText.slice(0, 2000) : '') };
})()`;

/** DuckDuckGo wraps result links in its redirect (/l/?uddg=<url>): the real URL. */
export function unwrapSearchHref(href: string): string {
  try {
    const u = new URL(href, 'https://duckduckgo.com');
    const target = u.searchParams.get('uddg');
    return target ? decodeURIComponent(target) : u.toString();
  } catch { return href; }
}

export interface BrowsedPage { title: string; url: string; text: string; links?: Array<{ text: string; href: string }>; status?: number }

/** What the agent gets back: a short header, the text (cut to `max`), links on request. */
export function formatBrowsed(p: BrowsedPage, max: number, withLinks: boolean): string {
  const text = p.text.replace(/\n{3,}/g, '\n\n').trim();
  const cut = text.length > max;
  const head = [`# ${p.title || '(no title)'}`, `URL: ${p.url}${p.status && p.status >= 400 ? ` (HTTP ${p.status})` : ''}`, ''];
  const body = cut ? `${text.slice(0, max)}\n\n[… cut at ${max} of ${text.length} characters; ask for more with max_chars]` : text;
  const links = withLinks && p.links?.length ? ['', '## Links', ...p.links.map((l) => `- [${l.text}](${l.href})`)] : [];
  return [...head, body || '(the page has no readable text)', ...links].join('\n');
}

export function formatSearch(query: string, results: Array<{ title: string; href: string; snippet: string }>, fallbackText: string): string {
  if (!results.length) return `No results parsed for "${query}".${fallbackText ? `\n\n${fallbackText}` : ''}`;
  return [`# Web results for "${query}"`, '', ...results.map((r, i) => `${i + 1}. [${r.title}](${unwrapSearchHref(r.href)})${r.snippet ? `\n   ${r.snippet}` : ''}`)].join('\n');
}
