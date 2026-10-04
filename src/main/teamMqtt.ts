/**
 * MQTT relays for Team: any MQTT broker — a public one included — as the
 * mailbox between offices, instead of ntfy.
 *
 * Envelopes are sealed and signed end to end before they get here
 * (teamCrypto.ts), so the broker is no more trusted than ntfy: it sees a
 * random topic and opaque bytes. Only TLS brokers are accepted (mqtts://,
 * wss://) so an access token never travels in clear.
 *
 * Offline delivery: QoS 1 with a persistent session (MQTT 3.1.1, clean:
 * false) and a stable client id per install and broker, so
 * a broker that honours sessions keeps what arrives while we are away. Public
 * brokers may expire sessions early; ntfy (12 h cache) is the reliable choice
 * when a teammate is often offline. Duplicates from QoS 1 are harmless: the
 * node drops replays.
 */
import { connect, type IClientOptions, type MqttClient } from 'mqtt';
import { createHash } from 'node:crypto';

export const isMqttRelay = (relay: string): boolean => /^(mqtts|wss):\/\//i.test(relay);

const TOPIC_PREFIX = 'md-team/';
const PUBLISH_TIMEOUT_MS = 15_000;

export interface MqttRelayDeps {
  /** Our install id: with the relay it makes the stable client id. */
  installId: () => string;
  /** "user:password" (or a bare token, sent as the user name) for brokers
   *  that require credentials. */
  token?: (relay: string) => string | undefined;
  onMessage: (relay: string, payload: string) => void;
  log?: (msg: string) => void;
  /** Tests: where to actually connect for a relay URL. */
  connectUrl?: (relay: string) => string;
}

export class MqttRelays {
  private clients = new Map<string, MqttClient>();
  private subs = new Map<string, string>(); // relay -> our topic

  constructor(private readonly deps: MqttRelayDeps) {}

  private client(relay: string): MqttClient {
    const existing = this.clients.get(relay);
    if (existing) return existing;
    const tok = this.deps.token?.(relay);
    const i = tok?.indexOf(':') ?? -1;
    const opts: IClientOptions = {
      // 3.1.1: what every public broker speaks. clean:false keeps the session.
      protocolVersion: 4,
      clean: false,
      clientId: `md-${createHash('sha256').update(`${this.deps.installId()}|${relay}`).digest('hex').slice(0, 20)}`,
      keepalive: 60,
      reconnectPeriod: 5_000,
      connectTimeout: 15_000,
      ...(tok ? (i > 0 ? { username: tok.slice(0, i), password: tok.slice(i + 1) } : { username: tok }) : {})
    };
    const c = connect(this.deps.connectUrl?.(relay) ?? relay, opts);
    c.on('message', (topic, payload) => {
      if (topic.startsWith(TOPIC_PREFIX)) this.deps.onMessage(relay, payload.toString('utf8'));
    });
    c.on('connect', (ack) => {
      // A broker that kept our session already has the subscription; one that
      // did not needs it again.
      const topic = this.subs.get(relay);
      if (topic && !ack.sessionPresent) c.subscribe(TOPIC_PREFIX + topic, { qos: 1 });
    });
    c.on('error', (e) => this.deps.log?.(`relay ${relay}: ${e.message}`));
    this.clients.set(relay, c);
    return c;
  }

  /** Listen on our mailbox at this relay. */
  listen(relay: string, topic: string): void {
    this.subs.set(relay, topic);
    const c = this.client(relay);
    if (c.connected) c.subscribe(TOPIC_PREFIX + topic, { qos: 1 });
  }

  /** Stop listening at a relay (no team uses it any more). */
  close(relay: string): void {
    this.subs.delete(relay);
    const c = this.clients.get(relay);
    this.clients.delete(relay);
    c?.end(true);
  }

  /** Deliver one sealed envelope to a teammate's mailbox; resolves once the
   *  broker has it (PUBACK). */
  publish(relay: string, topic: string, body: string): Promise<void> {
    const c = this.client(relay);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`relay ${relay} did not answer`)), PUBLISH_TIMEOUT_MS);
      c.publish(TOPIC_PREFIX + topic, body, { qos: 1 }, (err) => {
        clearTimeout(timer);
        if (err) reject(new Error(/not authori[sz]ed|bad user/i.test(err.message)
          ? 'the relay refused access: it needs an access token (Manager → Team → the team → Relay token)'
          : `relay ${relay}: ${err.message}`));
        else resolve();
      });
    });
  }

  /** Reconnect with fresh credentials (a token changed). */
  reconnectAll(): void {
    const subs = [...this.subs];
    for (const relay of [...this.clients.keys()]) this.close(relay);
    for (const [relay, topic] of subs) this.listen(relay, topic);
  }

  stopAll(): void {
    for (const relay of [...this.clients.keys()]) this.close(relay);
  }
}
