/**
 * Team node — paired installs message each other through public relays, sealed
 * end to end (teamCrypto.ts). No server of our own: a relay is an ntfy server
 * (https://ntfy.sh by default, or a self-hosted one) used as a dumb mailbox.
 * Each install listens on its own unguessable topic; a message to a teammate is
 * POSTed to the teammate's topic on their team's relay as one sealed envelope,
 * and ntfy keeps it for hours, so a teammate who was offline still gets it.
 *
 * Teams: an install belongs to any number of teams, each with its own relay,
 * a default level (what its members may do in OUR office) and a default trust
 * mode (whether their messages reach the orchestrator directly or wait for the
 * human). A member can override both, one to one. The node listens on every
 * relay its teams use.
 *
 * Pairing: an invite carries this install's public card, the team (id, name,
 * relay) and a one-time secret. The joiner files the inviter under that team
 * and sends back a sealed `hello` with its own card and the secret; the inviter
 * accepts it only while the secret is pending and unexpired, then answers
 * `welcome`. Anything else from an unpaired sender is dropped, so learning a
 * topic is not enough to talk.
 *
 * Plaintext kinds: msg {id, subject, body, at} · part {id, i, n, d} (a msg too
 * big for one relay message) · hello {card, relay, secret, team} · welcome {}.
 *
 * Electron-free: state storage, fetch and the inbound handler are injected.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  decodeInvite, encodeInvite, isEnvelope, newInviteSecret, open, openHello, publicCard, sameSecret, seal, verifyEnvelope,
  type Envelope, type Identity, type PublicCard
} from './teamCrypto';

export type TeamLevel = 'message' | 'view' | 'manage';
/** Same values as shared/triggers TriggerMode. */
export type TrustMode = 'strict' | 'communication-only' | 'allow-all';

export interface TeamGroup {
  id: string;
  name: string;
  /** The relay this team's members (us included) listen on. */
  relay: string;
  /** Default for members: what they may do in our office. */
  level: TeamLevel;
  /** Default for members: how their messages enter our office. */
  mode: TrustMode;
}

export interface Peer extends PublicCard {
  teamId: string;
  /** Relay this teammate listens on (their team's relay). */
  relay: string;
  addedAt: number;
  /** True once the teammate acknowledged the pairing (welcome, or any message). */
  confirmed: boolean;
  /** One-to-one overrides of the team defaults; absent = inherit. Set by us,
   *  never by the teammate. */
  level?: TeamLevel;
  mode?: TrustMode;
}

export interface TeamState {
  identity: Identity;
  /** Relay for new teams. */
  relay: string;
  teams: TeamGroup[];
  peers: Peer[];
  /** Pending invites, by sha256 of their secret. */
  invites: Array<{ hash: string; expiresAt: number; teamId: string }>;
  /** Last message id seen on our topic, per relay (resume points). */
  cursors?: Record<string, string>;
  /** Recently delivered message ids (replay guard). */
  seen?: string[];
}

export interface TeamInbound {
  id: string;
  from: Peer;
  team: TeamGroup | undefined;
  /** The member's effective policy: override, else team default. */
  level: TeamLevel;
  mode: TrustMode;
  subject: string;
  body: string;
  sentAt: string;
}

export interface TeamNodeDeps {
  load: () => TeamState;
  save: (s: TeamState) => void;
  onMessage: (m: TeamInbound) => void;
  onChange?: () => void;
  fetch?: typeof fetch;
  log?: (msg: string) => void;
}

/** ntfy rejects bodies over 4096 bytes; stay well under with the envelope overhead. */
const MAX_ENVELOPE = 3600;
const CHUNK = 1800;
const INVITE_TTL_MS = 24 * 3600_000;

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
const now = (): number => Date.now();
const trimRelay = (r: string): string => r.replace(/\/+$/, '');

/** A member's policy: their own setting, else their team's, else the safest. */
export function effectivePolicy(s: Pick<TeamState, 'teams'>, p: Peer): { level: TeamLevel; mode: TrustMode } {
  const team = s.teams.find((t) => t.id === p.teamId);
  return { level: p.level ?? team?.level ?? 'message', mode: p.mode ?? team?.mode ?? 'strict' };
}

export class TeamNode {
  private stopped = true;
  private listeners = new Map<string, AbortController>();
  private parts = new Map<string, { n: number; got: Map<number, string>; at: number }>();
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly deps: TeamNodeDeps) {
    this.fetchImpl = deps.fetch ?? fetch;
  }

  private state(): TeamState { return this.deps.load(); }
  private persist(s: TeamState): void { this.deps.save(s); this.syncListeners(); this.deps.onChange?.(); }
  private log(m: string): void { this.deps.log?.(m); }

  // ─── lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.syncListeners();
  }

  stop(): void {
    this.stopped = true;
    for (const c of this.listeners.values()) c.abort();
    this.listeners.clear();
  }

  /** One listener per relay our teams use; started and stopped as teams change. */
  private syncListeners(): void {
    if (this.stopped) return;
    const want = new Set(this.state().teams.map((t) => trimRelay(t.relay)));
    for (const [relay, c] of this.listeners) if (!want.has(relay)) { c.abort(); this.listeners.delete(relay); }
    for (const relay of want) {
      if (this.listeners.has(relay)) continue;
      const c = new AbortController();
      this.listeners.set(relay, c);
      void this.listen(relay, c);
    }
  }

  private async listen(relay: string, ctl: AbortController): Promise<void> {
    let backoff = 2000;
    while (!this.stopped && !ctl.signal.aborted) {
      const s = this.state();
      const cursor = s.cursors?.[relay];
      const url = `${relay}/${s.identity.topic}/json${cursor ? `?since=${encodeURIComponent(cursor)}` : ''}`;
      try {
        const res = await this.fetchImpl(url, { signal: ctl.signal, headers: { 'User-Agent': 'munder-difflin-team' } });
        if (!res.ok || !res.body) throw new Error(`relay answered ${res.status}`);
        backoff = 2000;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (line) this.onRelayLine(relay, line);
          }
        }
      } catch (e) {
        if (this.stopped || ctl.signal.aborted) return;
        this.log(`relay ${relay} dropped: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (this.stopped || ctl.signal.aborted) return;
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 60_000);
    }
  }

  private onRelayLine(relay: string, line: string): void {
    let ev: { id?: string; event?: string; message?: string };
    try { ev = JSON.parse(line); } catch { return; }
    if (ev.event !== 'message' || typeof ev.message !== 'string') return;
    try { this.receive(ev.message); } catch (e) { this.log(`dropped a relay message: ${e instanceof Error ? e.message : String(e)}`); }
    if (ev.id) { const s = this.state(); s.cursors = { ...(s.cursors ?? {}), [relay]: ev.id }; this.deps.save(s); }
  }

  // ─── inbound ───────────────────────────────────────────────────────────────

  /** Handle one raw relay message (an envelope as JSON). Exposed for tests. */
  receive(raw: string): void {
    let env: Envelope;
    try { env = JSON.parse(raw); } catch { return; }
    if (!isEnvelope(env)) return;
    const s = this.state();
    if (env.t !== s.identity.id) return;
    const peer = s.peers.find((p) => p.id === env.f);
    if (!peer) { this.receiveHello(env, s); return; }
    const plain = JSON.parse(open(env, s.identity, peer.ed)) as Record<string, unknown>;
    if (!peer.confirmed) { peer.confirmed = true; this.persist(s); }
    if (plain.k === 'msg') this.deliver(peer, plain);
    else if (plain.k === 'part') this.collect(peer, plain);
  }

  /** The one thing an unpaired sender may send: a hello carrying a pending invite secret. */
  private receiveHello(env: Envelope, s: TeamState): void {
    let plain: Record<string, unknown>;
    // Decrypting needs only our key; the signature is checked against the card
    // the hello itself carries, and the invite secret is what proves the right
    // to pair. Without a live secret, nothing from a stranger gets through.
    try { plain = JSON.parse(openHello(env, s.identity)); } catch { this.log('ignored a message from an unknown sender (cannot open)'); return; }
    const card = plain.card as PublicCard | undefined;
    if (plain.k !== 'hello' || !card || card.id !== env.f || typeof plain.secret !== 'string' || typeof plain.relay !== 'string') { this.log('ignored a message from an unknown sender (not a hello)'); return; }
    if (!verifyEnvelope(env, card.ed)) { this.log('ignored a hello with a bad signature'); return; }
    const live = s.invites.filter((i) => i.expiresAt > now());
    const match = live.find((i) => sameSecret(i.hash, sha(plain.secret as string)));
    if (!match || !/^https:\/\//.test(plain.relay)) { this.log(`ignored a hello from "${String(card.name).slice(0, 60)}": no matching live invite`); return; }
    if (!s.teams.some((t) => t.id === match.teamId)) { this.log('ignored a hello for a team that no longer exists'); return; }
    s.invites = live.filter((i) => i !== match); // one-time
    s.peers = s.peers.filter((p) => p.id !== card.id);
    const peer: Peer = {
      id: card.id, name: String(card.name).slice(0, 60), x: card.x, ed: card.ed, topic: card.topic,
      teamId: match.teamId, relay: trimRelay(plain.relay), addedAt: now(), confirmed: true
    };
    s.peers.push(peer);
    this.persist(s);
    void this.publish(peer, { k: 'welcome', at: new Date().toISOString() }).catch((e) => this.log(`welcome to ${peer.name} failed: ${e instanceof Error ? e.message : e}`));
  }

  private deliver(peer: Peer, m: Record<string, unknown>): void {
    const id = typeof m.id === 'string' ? m.id : '';
    if (!id) return;
    const s = this.state();
    const seen = s.seen ?? [];
    if (seen.includes(id)) return; // relay replay or a resend
    s.seen = [...seen, id].slice(-500);
    this.deps.save(s);
    const policy = effectivePolicy(s, peer);
    this.deps.onMessage({
      id,
      from: peer,
      team: s.teams.find((t) => t.id === peer.teamId),
      level: policy.level,
      mode: policy.mode,
      subject: String(m.subject ?? '').slice(0, 200),
      body: String(m.body ?? '').slice(0, 100_000),
      sentAt: typeof m.at === 'string' ? m.at : new Date().toISOString()
    });
  }

  private collect(peer: Peer, p: Record<string, unknown>): void {
    const id = String(p.id ?? ''); const i = Number(p.i); const n = Number(p.n);
    if (!id || !Number.isInteger(i) || !Number.isInteger(n) || n < 1 || n > 200 || i < 0 || i >= n || typeof p.d !== 'string') return;
    for (const [k, v] of this.parts) if (now() - v.at > 30 * 60_000) this.parts.delete(k);
    const key = `${peer.id}:${id}`;
    const entry = this.parts.get(key) ?? { n, got: new Map(), at: now() };
    entry.got.set(i, p.d);
    this.parts.set(key, entry);
    if (entry.got.size < entry.n) return;
    this.parts.delete(key);
    const json = Array.from({ length: entry.n }, (_, k) => entry.got.get(k) ?? '').join('');
    try { this.deliver(peer, JSON.parse(json)); } catch { /* corrupt reassembly: drop */ }
  }

  // ─── outbound ──────────────────────────────────────────────────────────────

  private async publish(peer: Peer, plain: Record<string, unknown>): Promise<void> {
    const env = seal(JSON.stringify(plain), this.state().identity, peer);
    const res = await this.fetchImpl(`${trimRelay(peer.relay)}/${peer.topic}`, {
      method: 'POST',
      body: JSON.stringify(env),
      headers: { 'Content-Type': 'text/plain', 'User-Agent': 'munder-difflin-team' }
    });
    if (!res.ok) throw new Error(res.status === 429 ? 'the relay is rate-limiting this connection; try again shortly' : `relay answered ${res.status}`);
  }

  /** Send a message to a teammate (by id, or by name). Long ones go as several sealed parts. */
  async send(peerRef: string, subject: string, body: string): Promise<{ ok: boolean; id?: string; error?: string }> {
    const peers = this.state().peers;
    const peer = peers.find((p) => p.id === peerRef) ?? peers.find((p) => p.name.toLowerCase() === peerRef.toLowerCase());
    if (!peer) return { ok: false, error: 'no such teammate' };
    const msg = { k: 'msg', id: randomBytes(12).toString('base64url'), subject: subject.slice(0, 200), body: body.slice(0, 100_000), at: new Date().toISOString() };
    try {
      const json = JSON.stringify(msg);
      const whole = JSON.stringify(seal(json, this.state().identity, peer));
      if (whole.length <= MAX_ENVELOPE) {
        await this.publish(peer, msg);
      } else {
        const chunks: string[] = [];
        for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK));
        if (chunks.length > 200) return { ok: false, error: 'message too long' };
        for (let i = 0; i < chunks.length; i++) await this.publish(peer, { k: 'part', id: msg.id, i, n: chunks.length, d: chunks[i] });
      }
      return { ok: true, id: msg.id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // ─── teams and members ─────────────────────────────────────────────────────

  createTeam(name: string, relay?: string): { ok: boolean; team?: TeamGroup; error?: string } {
    const s = this.state();
    const r = trimRelay((relay ?? '').trim() || s.relay);
    if (!/^https:\/\//.test(r)) return { ok: false, error: 'the relay must be an https:// address' };
    const team: TeamGroup = { id: randomBytes(9).toString('base64url'), name: name.trim().slice(0, 60) || 'Team', relay: r, level: 'message', mode: 'strict' };
    s.teams = [...s.teams, team];
    this.persist(s);
    return { ok: true, team };
  }

  /** Change a team's name, relay or defaults. A relay change reaches members
   *  who are paired after it; existing ones keep the relay they paired on. */
  updateTeam(teamId: string, patch: Partial<Pick<TeamGroup, 'name' | 'relay' | 'level' | 'mode'>>): { ok: boolean; error?: string } {
    const s = this.state();
    const t = s.teams.find((x) => x.id === teamId);
    if (!t) return { ok: false, error: 'no such team' };
    if (patch.relay !== undefined) {
      const r = trimRelay(patch.relay.trim());
      if (!/^https:\/\//.test(r)) return { ok: false, error: 'the relay must be an https:// address' };
      t.relay = r;
    }
    if (patch.name !== undefined) t.name = patch.name.trim().slice(0, 60) || t.name;
    if (patch.level) t.level = patch.level;
    if (patch.mode) t.mode = patch.mode;
    this.persist(s);
    return { ok: true };
  }

  /** Delete a team and forget its members. */
  removeTeam(teamId: string): void {
    const s = this.state();
    s.teams = s.teams.filter((t) => t.id !== teamId);
    s.peers = s.peers.filter((p) => p.teamId !== teamId);
    s.invites = s.invites.filter((i) => i.teamId !== teamId);
    this.persist(s);
  }

  /** One-to-one overrides; `null` puts that setting back to the team default. */
  setMember(peerId: string, patch: { level?: TeamLevel | null; mode?: TrustMode | null }): void {
    const s = this.state();
    const p = s.peers.find((x) => x.id === peerId);
    if (!p) return;
    if (patch.level !== undefined) { if (patch.level === null) delete p.level; else p.level = patch.level; }
    if (patch.mode !== undefined) { if (patch.mode === null) delete p.mode; else p.mode = patch.mode; }
    this.persist(s);
  }

  removePeer(peerId: string): void {
    const s = this.state();
    s.peers = s.peers.filter((p) => p.id !== peerId);
    this.persist(s);
  }

  /** A one-time invite to a team, valid for a day. */
  createInvite(teamId: string): { ok: boolean; code?: string; error?: string } {
    const s = this.state();
    const team = s.teams.find((t) => t.id === teamId);
    if (!team) return { ok: false, error: 'no such team' };
    const secret = newInviteSecret();
    const expiresAt = now() + INVITE_TTL_MS;
    s.invites = [...s.invites.filter((i) => i.expiresAt > now()), { hash: sha(secret), expiresAt, teamId }];
    this.persist(s);
    return { ok: true, code: encodeInvite({ card: publicCard(s.identity), secret, relay: team.relay, expiresAt, team: { id: team.id, name: team.name } }) };
  }

  /** Accept someone's invite: join (or create) their team here, add them, and
   *  send the hello that adds us on their side. */
  async join(code: string): Promise<{ ok: boolean; peer?: Peer; error?: string }> {
    const inv = decodeInvite(code);
    if (!inv) return { ok: false, error: 'that is not a valid invite code' };
    if (inv.expiresAt < now()) return { ok: false, error: 'that invite has expired; ask for a new one' };
    const s = this.state();
    if (inv.card.id === s.identity.id) return { ok: false, error: 'that is your own invite' };
    const relay = trimRelay(inv.relay);
    const teamId = inv.team?.id ?? `t-${inv.card.id}`;
    if (!s.teams.some((t) => t.id === teamId)) {
      s.teams = [...s.teams, { id: teamId, name: (inv.team?.name ?? `${inv.card.name}'s team`).slice(0, 60), relay, level: 'message', mode: 'strict' }];
    }
    const peer: Peer = { ...inv.card, name: inv.card.name.slice(0, 60), teamId, relay, addedAt: now(), confirmed: false };
    s.peers = [...s.peers.filter((p) => p.id !== peer.id), peer];
    this.persist(s);
    try {
      await this.publish(peer, { k: 'hello', card: publicCard(s.identity), relay, secret: inv.secret, team: teamId, at: new Date().toISOString() });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    return { ok: true, peer };
  }
}
