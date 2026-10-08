/**
 * Your own skill marketplaces: GitHub repositories (or a folder in one) whose
 * skills join the catalog, next to the public list.
 *
 * A marketplace is read with one GitHub API call (the repo's tree, which lists
 * every SKILL.md at once; the unauthenticated API allows 60 calls an hour) and
 * one raw file per skill for its name and description. Each one is cached for
 * a day in userData, so opening the Skills tab does not touch the network.
 * Installing goes through installSkill, the same hardened path as the catalog.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getText } from './fetchText';
import { parseGitHubSourceUrl, parseSkillFrontmatter, type CatalogSkill } from './skills';

export interface Marketplace { url: string; label?: string }
export interface MarketplaceSkill extends CatalogSkill { marketplace: string }
export interface MarketplaceState { url: string; label: string; skills: MarketplaceSkill[]; fetchedAt: number; error?: string }

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SKILLS = 200;

/** A marketplace URL we accept: https://github.com/owner/repo[/tree/ref/path]. */
export function marketplaceProblem(url: string): string | null {
  if (!/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+/i.test(url.trim())) return 'Use a GitHub address: https://github.com/owner/repo (or a folder in it).';
  return parseGitHubSourceUrl(url.trim()) ? null : 'That is not a GitHub repository or folder address.';
}

/** The paths of the skill folders in a tree listing, under `base`. */
export function skillDirsFromTree(paths: readonly string[], base: string): string[] {
  const prefix = base ? `${base.replace(/\/+$/, '')}/` : '';
  return paths
    .filter((p) => p.endsWith('/SKILL.md') || p === 'SKILL.md')
    .map((p) => (p === 'SKILL.md' ? '' : p.slice(0, -'/SKILL.md'.length)))
    .filter((d) => !prefix || d === base || d.startsWith(prefix))
    .slice(0, MAX_SKILLS);
}

const cacheFile = (dir: string, url: string) => join(dir, `${createHash('sha1').update(url).digest('hex').slice(0, 16)}.json`);

async function fetchMarketplace(m: Marketplace): Promise<MarketplaceState> {
  const gh = parseGitHubSourceUrl(m.url.trim());
  if (!gh) throw new Error('not a GitHub address');
  const label = m.label?.trim() || `${gh.owner}/${gh.repo}${gh.path ? `/${gh.path}` : ''}`;
  const ref = gh.ref || (JSON.parse(await getText(`https://api.github.com/repos/${gh.owner}/${gh.repo}`)) as { default_branch?: string }).default_branch || 'main';
  const tree = JSON.parse(await getText(`https://api.github.com/repos/${gh.owner}/${gh.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`)) as { tree?: Array<{ path: string; type: string }> };
  const dirs = skillDirsFromTree((tree.tree ?? []).filter((t) => t.type === 'blob').map((t) => t.path), gh.path);
  const skills: MarketplaceSkill[] = [];
  for (const d of dirs) {
    let fm: { name?: string; description?: string } = {};
    try { fm = parseSkillFrontmatter(await getText(`https://raw.githubusercontent.com/${gh.owner}/${gh.repo}/${ref}/${d ? `${d}/` : ''}SKILL.md`)); } catch { /* listed by folder name */ }
    const name = (fm.name || d.split('/').pop() || gh.repo).trim();
    skills.push({
      name,
      description: (fm.description ?? '').trim().slice(0, 400),
      url: `https://github.com/${gh.owner}/${gh.repo}${d ? `/tree/${ref}/${d}` : ''}`,
      category: label,
      owner: gh.owner,
      marketplace: m.url.trim()
    });
  }
  return { url: m.url.trim(), label, skills, fetchedAt: Date.now() };
}

/** One marketplace, from cache when fresh. A failed refresh keeps the cache. */
export async function loadMarketplace(m: Marketplace, dir: string, force = false): Promise<MarketplaceState> {
  const file = cacheFile(dir, m.url.trim());
  let cached: MarketplaceState | null = null;
  try { if (existsSync(file)) cached = JSON.parse(readFileSync(file, 'utf8')) as MarketplaceState; } catch { cached = null; }
  if (cached && !force && Date.now() - cached.fetchedAt < TTL_MS) return cached;
  try {
    const fresh = await fetchMarketplace(m);
    try { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify(fresh)); } catch { /* cache is optional */ }
    return fresh;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return cached ? { ...cached, error } : { url: m.url.trim(), label: m.label ?? m.url, skills: [], fetchedAt: 0, error };
  }
}

export async function loadMarketplaces(list: readonly Marketplace[], dir: string, force = false): Promise<MarketplaceState[]> {
  const out: MarketplaceState[] = [];
  for (const m of list) out.push(await loadMarketplace(m, dir, force));
  return out;
}

/** The public catalog plus every marketplace's skills (a marketplace skill
 *  with the same name and owner as a catalog one replaces it). */
export function mergeCatalog(catalog: readonly CatalogSkill[], markets: readonly MarketplaceState[]): Array<CatalogSkill & { marketplace?: string }> {
  const own = markets.flatMap((m) => m.skills);
  const key = (s: CatalogSkill) => `${s.owner.toLowerCase()}/${s.name.toLowerCase()}`;
  const taken = new Set(own.map(key));
  return [...own, ...catalog.filter((s) => !taken.has(key(s)))];
}

export function cleanMarketplaces(v: unknown): Marketplace[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: Marketplace[] = [];
  for (const x of v) {
    const url = typeof (x as Marketplace)?.url === 'string' ? (x as Marketplace).url.trim() : '';
    if (!url || seen.has(url) || marketplaceProblem(url)) continue;
    seen.add(url);
    const label = typeof (x as Marketplace).label === 'string' ? (x as Marketplace).label!.trim().slice(0, 60) : undefined;
    out.push(label ? { url, label } : { url });
  }
  return out;
}
