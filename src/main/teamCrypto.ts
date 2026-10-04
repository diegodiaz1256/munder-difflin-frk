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
 * Node's `crypto` only; no dependencies. Keys travel as base64url raw bytes.
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

const INFO = Buffer.from('munder-difflin team v1');

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
}

export interface Identity extends PublicCard {
  /** X25519 private key (base64url). Secret. */
  xPriv: string;
  /** Ed25519 private key (base64url). Secret. */
  edPriv: string;
}

export interface Envelope {
  v: 1;
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
    id: b64u(randomBytes(16)),
    name: name.trim().slice(0, 60) || 'Me',
    x: xj.x, xPriv: xj.d,
    ed: ej.x, edPriv: ej.d,
    // ntfy topics: letters, digits, - and _, up to 64 chars. 24 random bytes.
    topic: `md-${b64u(randomBytes(24))}`
  };
}

export function publicCard(id: Identity): PublicCard {
  return { id: id.id, name: id.name, x: id.x, ed: id.ed, topic: id.topic };
}

function signed(e: Omit<Envelope, 's'>): Buffer {
  return Buffer.from([e.v, e.f, e.t, e.e, e.n, e.c].join('|'));
}

function keyFor(shared: Buffer, eph: string, recipient: string): Buffer {
  return Buffer.from(hkdfSync('sha256', shared, Buffer.from(`${eph}|${recipient}`), INFO, 32));
}

/** Seal `plaintext` for `to`, signed by `from`. */
export function seal(plaintext: string, from: Identity, to: Pick<PublicCard, 'id' | 'x'>): Envelope {
  const eph = generateKeyPairSync('x25519');
  const ephRaw = (eph.publicKey.export({ format: 'jwk' }) as { x: string }).x;
  const shared = diffieHellman({ privateKey: eph.privateKey, publicKey: xPub(to.x) });
  const key = keyFor(shared, ephRaw, to.id);
  const nonce = randomBytes(12);
  const aad = Buffer.from(`1|${from.id}|${to.id}|${ephRaw}`);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
  cipher.setAAD(aad);
  const c = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  const unsigned = { v: 1 as const, f: from.id, t: to.id, e: ephRaw, n: b64u(nonce), c: b64u(c) };
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
 *  tampered with, or is not signed by `senderEd`. */
export function open(env: Envelope, me: Identity, senderEd: string): string {
  if (!isEnvelope(env)) throw new Error('not an envelope');
  if (env.t !== me.id) throw new Error('not addressed to this install');
  if (!verifyEnvelope(env, senderEd)) throw new Error('bad signature');
  return decrypt(env, me);
}

/** Decrypt WITHOUT checking who signed it. Only for a pairing hello, whose
 *  sender key is inside the ciphertext: the caller must verify the envelope
 *  against that key (and the invite secret) before trusting anything in it.
 *  The AEAD still rejects any tampering with the ciphertext. */
export function openHello(env: Envelope, me: Identity): string {
  if (!isEnvelope(env)) throw new Error('not an envelope');
  if (env.t !== me.id) throw new Error('not addressed to this install');
  return decrypt(env, me);
}

function decrypt(env: Envelope, me: Identity): string {
  const shared = diffieHellman({ privateKey: xPrivKey(me), publicKey: xPub(env.e) });
  const key = keyFor(shared, env.e, me.id);
  const raw = unb64u(env.c);
  if (raw.length < 16) throw new Error('truncated');
  const body = raw.subarray(0, raw.length - 16);
  const tag = raw.subarray(raw.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, unb64u(env.n), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(`1|${env.f}|${env.t}|${env.e}`));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

export function isEnvelope(v: unknown): v is Envelope {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return e.v === 1 && ['f', 't', 'e', 'n', 'c', 's'].every((k) => typeof e[k] === 'string' && (e[k] as string).length < 20_000);
}

// ─── invites ────────────────────────────────────────────────────────────────

const INVITE_PREFIX = 'mdteam1.';

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
      && typeof inv.secret === 'string' && typeof inv.relay === 'string' && /^https:\/\//.test(inv.relay)
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
