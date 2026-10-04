/**
 * Team crypto — end-to-end sealed messages between paired installs.
 *
 * Each install has two keypairs: X25519 (to be encrypted to) and Ed25519 (to
 * sign with). A message to a peer is sealed with an ephemeral X25519 key:
 * ECDH with the peer's public key → HKDF-SHA256 → AES-256-GCM. The
 * sender signs the whole envelope with its Ed25519 key, and the receiver only
 * accepts envelopes signed by a peer it paired with. The relay in between sees
 * a mailbox name and opaque bytes.
 *
 * Post-quantum (v2): every install also has an ML-KEM-768 keypair (FIPS 203).
 * When two installs pair, one encapsulates to the other's ML-KEM key and both
 * derive a pairwise secret; from then on each message key comes from BOTH the
 * per-message X25519 exchange and that secret (one HKDF over the two). Someone
 * who records the traffic today and breaks X25519 later still has to break
 * ML-KEM. Signatures stay Ed25519: a forged signature only matters at the
 * moment it is checked, so it is not exposed to record-now-decrypt-later.
 * ML-KEM is @noble/post-quantum, vendored as CommonJS (vendor/ml-kem.cjs).
 *
 * Node's `crypto` otherwise. Keys travel as base64url raw bytes.
 * AES-256-GCM rather than ChaCha20-Poly1305: Electron's BoringSSL does not
 * expose the latter through createCipheriv ("Unknown cipher"), so an app built
 * on it could not open what plain Node sealed. With a fresh key per message
 * (ephemeral ECDH) and a random 96-bit nonce, GCM is as safe here.
 */
import {
  createPrivateKey, createPublicKey, createCipheriv, createDecipheriv,
  diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, sign, verify, timingSafeEqual,
  type KeyObject
} from 'node:crypto';

import { ml_kem768 } from './vendor/ml-kem.cjs';

const INFO = Buffer.from('munder-difflin team v1');
const INFO_V2 = Buffer.from('munder-difflin team v2 x25519+mlkem768');
const INFO_PQ = Buffer.from('munder-difflin team pq pairing v1');
/** ML-KEM-768 sizes in bytes. */
const KEM_PUB = 1184;
const KEM_CT = 1088;

export interface PublicCard {
  /** Stable id of the install (base64url, 16 bytes). */
  id: string;
  /** Display name its human chose. */
  name: string;
  /** X25519 public key (base64url). */
  x: string;
  /** Ed25519 public key (base64url). */
  ed: string;
  /** The relay mailbox (topic) this install listens on. */
  topic: string;
  /** ML-KEM-768 public key (base64url). Absent on installs from before
   *  post-quantum pairing. */
  k?: string;
}

export interface Identity extends PublicCard {
  /** X25519 private key (base64url). Secret. */
  xPriv: string;
  /** Ed25519 private key (base64url). Secret. */
  edPriv: string;
  /** ML-KEM-768 secret key (base64url). Secret. */
  kPriv?: string;
}

export interface Envelope {
  /** 1: X25519 only. 2: X25519 + the pair's post-quantum secret. */
  v: 1 | 2;
  /** Sender install id. */
  f: string;
  /** Recipient install id. */
  t: string;
  /** Ephemeral X25519 public key. */
  e: string;
  /** Nonce. */
  n: string;
  /** Ciphertext + 16-byte tag. */
  c: string;
  /** Ed25519 signature over v|f|t|e|n|c. */
  s: string;
}

const b64u = (b: Buffer): string => b.toString('base64url');
const unb64u = (s: string): Buffer => Buffer.from(s, 'base64url');

function xPub(raw: string): KeyObject {
  return createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: raw }, format: 'jwk' });
}
function xPrivKey(id: Pick<Identity, 'x' | 'xPriv'>): KeyObject {
  return createPrivateKey({ key: { kty: 'OKP', crv: 'X25519', x: id.x, d: id.xPriv }, format: 'jwk' });
}
function edPub(raw: string): KeyObject {
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: raw }, format: 'jwk' });
}
function edPrivKey(id: Pick<Identity, 'ed' | 'edPriv'>): KeyObject {
  return createPrivateKey({ key: { kty: 'OKP', crv: 'Ed25519', x: id.ed, d: id.edPriv }, format: 'jwk' });
}

/** A fresh install identity with an unguessable relay mailbox. */
export function generateIdentity(name: string): Identity {
  const x = generateKeyPairSync('x25519');
  const ed = generateKeyPairSync('ed25519');
  const xj = x.privateKey.export({ format: 'jwk' }) as { x: string; d: string };
  const ej = ed.privateKey.export({ format: 'jwk' }) as { x: string; d: string };
  return {
    ...generateKem(),
    id: b64u(randomBytes(16)),
    name: name.trim().slice(0, 60) || 'Me',
    x: xj.x, xPriv: xj.d,
    ed: ej.x, edPriv: ej.d,
    // ntfy topics: letters, digits, - and _, up to 64 chars. 24 random bytes.
    topic: `md-${b64u(randomBytes(24))}`
  };
}

export function publicCard(id: Identity): PublicCard {
  return { id: id.id, name: id.name, x: id.x, ed: id.ed, topic: id.topic, ...(id.k ? { k: id.k } : {}) };
}

// ─── post-quantum pairing ────────────────────────────────────────────────────

/** A fresh ML-KEM-768 keypair (also how an older identity is upgraded). */
export function generateKem(): { k: string; kPriv: string } {
  const kp = ml_kem768.keygen();
  return { k: b64u(Buffer.from(kp.publicKey)), kPriv: b64u(Buffer.from(kp.secretKey)) };
}

export function isKemPublicKey(k: unknown): k is string {
  return typeof k === 'string' && /^[A-Za-z0-9_-]+$/.test(k) && unb64u(k).length === KEM_PUB;
}

/** The pair's secret from an ML-KEM shared secret, bound to both installs. */
function pairSecret(ss: Uint8Array, a: string, b: string): string {
  const ids = [a, b].sort().join('|');
  return b64u(Buffer.from(hkdfSync('sha256', Buffer.from(ss), Buffer.from(ids), INFO_PQ, 32)));
}

/** Start a post-quantum pairing with `to`: the ciphertext goes to them, the
 *  secret stays here. */
export function pqEncapsulate(me: Pick<Identity, 'id'>, to: Pick<PublicCard, 'id' | 'k'>): { ct: string; secret: string } {
  if (!isKemPublicKey(to.k)) throw new Error('no post-quantum key');
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(unb64u(to.k));
  return { ct: b64u(Buffer.from(cipherText)), secret: pairSecret(sharedSecret, me.id, to.id) };
}

/** Finish a pairing someone started with us. */
export function pqDecapsulate(me: Pick<Identity, 'id' | 'kPriv'>, from: string, ct: unknown): string {
  if (!me.kPriv) throw new Error('this install has no post-quantum key');
  const c = typeof ct === 'string' ? unb64u(ct) : Buffer.alloc(0);
  if (c.length !== KEM_CT) throw new Error('bad post-quantum ciphertext');
  return pairSecret(ml_kem768.decapsulate(c, unb64u(me.kPriv)), me.id, from);
}

function signed(e: Omit<Envelope, 's'>): Buffer {
  return Buffer.from([e.v, e.f, e.t, e.e, e.n, e.c].join('|'));
}

function keyFor(shared: Buffer, eph: string, recipient: string, pq?: string): Buffer {
  const salt = Buffer.from(`${eph}|${recipient}`);
  // v2: both secrets feed one HKDF, so the key stands while EITHER holds.
  return pq
    ? Buffer.from(hkdfSync('sha256', Buffer.concat([shared, unb64u(pq)]), salt, INFO_V2, 32))
    : Buffer.from(hkdfSync('sha256', shared, salt, INFO, 32));
}

/** Seal `plaintext` for `to`, signed by `from`. Given the pair's
 *  post-quantum secret it is a v2 (hybrid) envelope. */
export function seal(plaintext: string, from: Identity, to: Pick<PublicCard, 'id' | 'x'>, pq?: string): Envelope {
  const v: 1 | 2 = pq ? 2 : 1;
  const eph = generateKeyPairSync('x25519');
  const ephRaw = (eph.publicKey.export({ format: 'jwk' }) as { x: string }).x;
  const shared = diffieHellman({ privateKey: eph.privateKey, publicKey: xPub(to.x) });
  const key = keyFor(shared, ephRaw, to.id, pq);
  const nonce = randomBytes(12);
  const aad = Buffer.from(`${v}|${from.id}|${to.id}|${ephRaw}`);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
  cipher.setAAD(aad);
  const c = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  const unsigned = { v, f: from.id, t: to.id, e: ephRaw, n: b64u(nonce), c: b64u(c) };
  return { ...unsigned, s: b64u(sign(null, signed(unsigned), edPrivKey(from))) };
}

/** Verify an envelope's signature against a claimed sender key. */
export function verifyEnvelope(env: Envelope, senderEd: string): boolean {
  try {
    const { s, ...unsigned } = env;
    return verify(null, signed(unsigned), edPub(senderEd), unb64u(s));
  } catch {
    return false;
  }
}

/** Open an envelope addressed to `me`. Throws when it is not for us, was
 *  tampered with, or is not signed by `senderEd`. A v2 envelope needs the
 *  pair's post-quantum secret. Whether a v1 one is still acceptable from this
 *  sender is the caller's call (TeamNode: not once the pair is post-quantum). */
export function open(env: Envelope, me: Identity, senderEd: string, pq?: string): string {
  if (!isEnvelope(env)) throw new Error('not an envelope');
  if (env.t !== me.id) throw new Error('not addressed to this install');
  if (!verifyEnvelope(env, senderEd)) throw new Error('bad signature');
  if (env.v === 2 && !pq) throw new Error('a post-quantum envelope from a sender we share no post-quantum secret with');
  return decrypt(env, me, env.v === 2 ? pq : undefined);
}

/** Decrypt WITHOUT checking who signed it. Only for a pairing hello, whose
 *  sender key is inside the ciphertext: the caller must verify the envelope
 *  against that key (and the invite secret) before trusting anything in it.
 *  The AEAD still rejects any tampering with the ciphertext. */
export function openHello(env: Envelope, me: Identity): string {
  if (!isEnvelope(env)) throw new Error('not an envelope');
  if (env.v !== 1) throw new Error('a hello is never post-quantum');
  if (env.t !== me.id) throw new Error('not addressed to this install');
  return decrypt(env, me);
}

function decrypt(env: Envelope, me: Identity, pq?: string): string {
  const shared = diffieHellman({ privateKey: xPrivKey(me), publicKey: xPub(env.e) });
  const key = keyFor(shared, env.e, me.id, pq);
  const raw = unb64u(env.c);
  if (raw.length < 16) throw new Error('truncated');
  const body = raw.subarray(0, raw.length - 16);
  const tag = raw.subarray(raw.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, unb64u(env.n), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(`${env.v}|${env.f}|${env.t}|${env.e}`));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

export function isEnvelope(v: unknown): v is Envelope {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return (e.v === 1 || e.v === 2) && ['f', 't', 'e', 'n', 'c', 's'].every((k) => typeof e[k] === 'string' && (e[k] as string).length < 20_000);
}

// ─── invites ────────────────────────────────────────────────────────────────

const INVITE_PREFIX = 'mdteam1.';

/** A relay address: an ntfy server (https://) or an MQTT broker over TLS
 *  (mqtts://, wss://). Plain-text transports are refused so a relay token never
 *  travels in clear. */
export function isRelayUrl(r: unknown): r is string {
  return typeof r === 'string' && /^(https|mqtts|wss):\/\/[^\s/]+/i.test(r) && r.length <= 300;
}

export interface Invite {
  card: PublicCard;
  /** One-time secret proving the joiner got this code from us. */
  secret: string;
  /** Relay base URL the team uses. */
  relay: string;
  expiresAt: number;
  /** The team being joined (both installs file the pairing under it). */
  team?: { id: string; name: string };
}

export function encodeInvite(inv: Invite): string {
  return INVITE_PREFIX + b64u(Buffer.from(JSON.stringify(inv)));
}

export function decodeInvite(code: string): Invite | null {
  const s = code.trim().replace(/\s+/g, '');
  if (!s.startsWith(INVITE_PREFIX)) return null;
  try {
    const inv = JSON.parse(unb64u(s.slice(INVITE_PREFIX.length)).toString('utf8')) as Invite;
    const c = inv?.card;
    const ok = c && ['id', 'name', 'x', 'ed', 'topic'].every((k) => typeof (c as unknown as Record<string, unknown>)[k] === 'string')
      && typeof inv.secret === 'string' && isRelayUrl(inv.relay)
      && typeof inv.expiresAt === 'number' && /^[A-Za-z0-9_-]{1,64}$/.test(c.topic)
      && (inv.team === undefined || (typeof inv.team?.id === 'string' && typeof inv.team?.name === 'string'));
    return ok ? inv : null;
  } catch {
    return null;
  }
}

/** Constant-time compare of two base64url secrets. */
export function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function newInviteSecret(): string {
  return b64u(randomBytes(24));
}
