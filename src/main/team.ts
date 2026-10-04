/**
 * Team storage (main process): the install's identity, its paired teammates and
 * the conversation log, for the TeamNode (teamNode.ts).
 *
 * The private keys live ONLY in the encrypted secret store (safeStorage, the
 * same fail-closed store as Connections and integrations). Everything else —
 * public card, peers, relay cursor, replay guard, conversation — is a plain
 * file in userData, kept out of config.json so a busy relay does not rewrite
 * the settings every few seconds. Nothing here is ever given to an agent.
 */
import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { generateIdentity, type Identity } from './teamCrypto';
import { randomBytes } from 'node:crypto';
import type { Peer, TeamGroup, TeamState } from './teamNode';
import { deleteSecret, getSecret, hasSecret, setSecret } from './integrations';

const SECRET_REF = 'team:identity-keys';
export const DEFAULT_RELAY = 'https://ntfy.sh';

interface StoredTeam {
  enabled: boolean;
  identity: Omit<Identity, 'xPriv' | 'edPriv'>;
  relay: string;
  teams: TeamGroup[];
  peers: Peer[];
  invites: TeamState['invites'];
  cursors?: Record<string, string>;
  seen?: string[];
}

export interface TeamLogEntry {
  id: string;
  peerId: string;
  peerName: string;
  direction: 'in' | 'out';
  /** 'you' when the human sent it from the app, 'agent' when the orchestrator did. */
  by?: 'you' | 'agent';
  subject: string;
  body: string;
  at: string;
}

const statePath = (): string => join(app.getPath('userData'), 'team.json');
const logPath = (): string => join(app.getPath('userData'), 'team-messages.json');

function writeAtomic(p: string, value: unknown): void {
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  renameSync(tmp, p);
}

function readStored(): StoredTeam | null {
  try {
    if (!existsSync(statePath())) return null;
    const s = JSON.parse(readFileSync(statePath(), 'utf8')) as StoredTeam;
    return s?.identity?.id ? s : null;
  } catch {
    return null;
  }
}

/** Team is on and its keys are readable. */
export function teamEnabled(): boolean {
  return !!readStored()?.enabled && !!getSecret(SECRET_REF);
}

/** Turn Team on: reuse the identity if there is one, else mint it. */
export function enableTeam(name: string, relay?: string): { ok: boolean; error?: string } {
  const prev = readStored();
  const r = (relay?.trim() || prev?.relay || DEFAULT_RELAY).replace(/\/+$/, '');
  if (!/^https:\/\//.test(r)) return { ok: false, error: 'the relay must be an https:// address' };
  if (prev && getSecret(SECRET_REF)) {
    writeAtomic(statePath(), { ...prev, enabled: true, relay: r, identity: { ...prev.identity, name: name.trim().slice(0, 60) || prev.identity.name } });
    return { ok: true };
  }
  const id = generateIdentity(name);
  const saved = setSecret(SECRET_REF, JSON.stringify({ xPriv: id.xPriv, edPriv: id.edPriv }));
  if (!saved.ok) return { ok: false, error: saved.error ?? 'could not store the team keys securely' };
  const { xPriv: _x, edPriv: _e, ...pub } = id;
  // A first team to invite people into; more can be added, each on its own relay.
  const first: TeamGroup = { id: randomBytes(9).toString('base64url'), name: 'My team', relay: r, level: 'message', mode: 'strict' };
  writeAtomic(statePath(), { enabled: true, identity: pub, relay: r, teams: [first], peers: [], invites: [] } satisfies StoredTeam);
  return { ok: true };
}

export function disableTeam(): void {
  const s = readStored();
  if (s) writeAtomic(statePath(), { ...s, enabled: false });
}

/** Forget the identity and every teammate (a fresh identity next time). */
export function resetTeam(): void {
  deleteSecret(SECRET_REF);
  writeAtomic(statePath(), { enabled: false });
}

/** The TeamNode's view: stored state plus the decrypted private keys. */
export function loadTeamState(): TeamState {
  const s = readStored();
  const keys = JSON.parse(getSecret(SECRET_REF) ?? 'null') as { xPriv: string; edPriv: string } | null;
  if (!s || !keys) throw new Error('team is not set up');
  return { identity: { ...s.identity, ...keys }, relay: s.relay, teams: s.teams ?? [], peers: s.peers ?? [], invites: s.invites ?? [], cursors: s.cursors, seen: s.seen };
}

/** Persist the TeamNode's state, private keys stripped. */
export function saveTeamState(st: TeamState): void {
  const prev = readStored();
  const { xPriv: _x, edPriv: _e, ...pub } = st.identity;
  writeAtomic(statePath(), { enabled: prev?.enabled ?? true, identity: pub, relay: st.relay, teams: st.teams, peers: st.peers, invites: st.invites, cursors: st.cursors, seen: st.seen } satisfies StoredTeam);
}

// ─── relay access tokens ─────────────────────────────────────────────────────
// A relay that needs a token (a paid ntfy.sh plan, a self-hosted ntfy with
// access control) gets one per relay URL, in the encrypted store. Write-only
// from the UI: main uses it in the Authorization header and nothing reads it
// back out. Never given to an agent.

function relayKey(relay: string): string | null {
  try {
    const u = new URL(relay.trim().replace(/\/+$/, ''));
    return u.protocol === 'https:' ? `team:relay-token:${u.origin}${u.pathname === '/' ? '' : u.pathname}` : null;
  } catch { return null; }
}

export function relayToken(relay: string): string | undefined {
  const k = relayKey(relay);
  return k ? getSecret(k) : undefined;
}

export function hasRelayToken(relay: string): boolean {
  const k = relayKey(relay);
  return !!k && hasSecret(k);
}

/** Store (or, with an empty token, forget) a relay's access token. */
export function setRelayToken(relay: unknown, token: unknown): { ok: boolean; error?: string } {
  const k = typeof relay === 'string' ? relayKey(relay) : null;
  if (!k) return { ok: false, error: 'the relay must be an https:// address' };
  const t = typeof token === 'string' ? token.trim() : '';
  if (!t) { deleteSecret(k); return { ok: true }; }
  if (t.length > 512 || /\s/.test(t)) return { ok: false, error: 'that does not look like an access token' };
  return setSecret(k, t);
}

export function teamPublicStatus(): {
  enabled: boolean;
  me: { id: string; name: string; relay: string } | null;
  teams: Array<TeamGroup & { relayAuth: boolean }>;
  peers: Array<Pick<Peer, 'id' | 'name' | 'confirmed' | 'addedAt' | 'teamId' | 'level' | 'mode'>>;
} {
  const s = readStored();
  return {
    enabled: teamEnabled(),
    me: s?.identity?.id ? { id: s.identity.id, name: s.identity.name, relay: s.relay } : null,
    teams: (s?.teams ?? []).map((t) => ({ ...t, relayAuth: hasRelayToken(t.relay) })),
    // Overrides as stored (absent = inherits the team default); never keys or topics.
    peers: (s?.peers ?? []).map((p) => ({ id: p.id, name: p.name, confirmed: p.confirmed, addedAt: p.addedAt, teamId: p.teamId, level: p.level, mode: p.mode }))
  };
}

export function readTeamLog(): TeamLogEntry[] {
  try { return existsSync(logPath()) ? (JSON.parse(readFileSync(logPath(), 'utf8')) as TeamLogEntry[]) : []; } catch { return []; }
}

export function appendTeamLog(e: TeamLogEntry): void {
  writeAtomic(logPath(), [...readTeamLog(), e].slice(-1000));
}
