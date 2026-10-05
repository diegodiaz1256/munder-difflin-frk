/**
 * Certificates for agents that talk to a custom endpoint (a company gateway,
 * a local model server behind TLS). Settings → AI Engines → Certificates.
 *
 * The app writes ONE combined PEM bundle — Node's own roots, plus the user's CA
 * file, plus the certificates installed in Windows and/or in WSL — and points
 * every agent's TLS stacks at it: NODE_EXTRA_CA_CERTS (Node CLIs), SSL_CERT_FILE
 * (Go/Rust/OpenSSL, which REPLACE their roots with it — hence Node's roots in
 * the bundle, or public HTTPS would break), REQUESTS_CA_BUNDLE / CURL_CA_BUNDLE.
 * The qwen/crush proxy sidecar uses it for its upstream too.
 *
 * Turning verification off is a separate, loud choice: it sets
 * NODE_TLS_REJECT_UNAUTHORIZED=0, which affects ALL of an agent's Node HTTPS
 * traffic (not only the model), so it stays off unless the user picks it.
 *
 * Electron-free; the Windows/WSL readers are passed in, for tests.
 */

export interface TlsSettings {
  /** false = do not verify certificates (default true). */
  verify?: boolean;
  /** A PEM file with the user's own CA(s). */
  caFile?: string;
  /** Trust the certificates installed in Windows (root + intermediate stores). */
  trustWindows?: boolean;
  /** Trust the WSL distribution's system bundle (/etc/ssl/certs). */
  trustWsl?: boolean;
}

/** Does any setting change TLS for agents? */
export function tlsActive(t: TlsSettings | undefined): boolean {
  return !!t && (t.verify === false || !!t.caFile?.trim() || !!t.trustWindows || !!t.trustWsl);
}

const PEM_RE = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;

/** Every certificate in a PEM text, normalized (one base64 line per 64 chars). */
export function splitPem(text: string): string[] {
  return (text.match(PEM_RE) ?? []).map((block) => {
    const body = block.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '');
    return `-----BEGIN CERTIFICATE-----\n${body.replace(/(.{64})/g, '$1\n').replace(/\n$/, '')}\n-----END CERTIFICATE-----`;
  }).filter((c) => /BEGIN CERTIFICATE-----\n[A-Za-z0-9+/=\n]{40,}\n-----END/.test(c));
}

/** All certificates, de-duplicated, as one bundle. */
export function combinePem(groups: string[][]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of groups) for (const c of g) if (!seen.has(c)) { seen.add(c); out.push(c); }
  return out.join('\n') + (out.length ? '\n' : '');
}

/** PowerShell that prints the Windows root and intermediate stores as PEM. */
export const WINDOWS_STORE_SCRIPT = [
  "$ErrorActionPreference='SilentlyContinue'",
  "foreach($s in 'Cert:\\LocalMachine\\Root','Cert:\\CurrentUser\\Root','Cert:\\LocalMachine\\CA','Cert:\\CurrentUser\\CA'){",
  "Get-ChildItem $s | ForEach-Object {",
  "'-----BEGIN CERTIFICATE-----'; [Convert]::ToBase64String($_.RawData,'InsertLineBreaks'); '-----END CERTIFICATE-----' } }"
].join('\n');

export interface BundleSources {
  /** Node's built-in roots (tls.rootCertificates). */
  nodeRoots: readonly string[];
  readCaFile: (path: string) => string;
  windowsStore: () => Promise<string>;
  wslStore: () => Promise<string>;
}

/** Build the bundle text for `t`. Sources that fail are reported, not fatal. */
export async function buildCaBundle(t: TlsSettings, src: BundleSources): Promise<{ pem: string; count: number; errors: string[] }> {
  const errors: string[] = [];
  const groups: string[][] = [splitPem(src.nodeRoots.join('\n'))];
  if (t.caFile?.trim()) {
    try {
      const own = splitPem(src.readCaFile(t.caFile.trim()));
      if (!own.length) errors.push(`no certificate found in ${t.caFile}`);
      groups.push(own);
    } catch (e) { errors.push(`could not read ${t.caFile}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (t.trustWindows) {
    try { groups.push(splitPem(await src.windowsStore())); }
    catch (e) { errors.push(`Windows certificate store: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (t.trustWsl) {
    try { groups.push(splitPem(await src.wslStore())); }
    catch (e) { errors.push(`WSL certificate store: ${e instanceof Error ? e.message : String(e)}`); }
  }
  const pem = combinePem(groups);
  return { pem, count: (pem.match(/BEGIN CERTIFICATE/g) ?? []).length, errors };
}

/** The env every agent gets for `t` (empty when nothing is set). */
export function tlsEnv(t: TlsSettings | undefined, bundlePath: string | null): Record<string, string> {
  if (!tlsActive(t)) return {};
  const env: Record<string, string> = {};
  if (bundlePath) {
    env.NODE_EXTRA_CA_CERTS = bundlePath;
    env.SSL_CERT_FILE = bundlePath;
    env.REQUESTS_CA_BUNDLE = bundlePath;
    env.CURL_CA_BUNDLE = bundlePath;
  }
  if (t?.verify === false) env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  return env;
}
