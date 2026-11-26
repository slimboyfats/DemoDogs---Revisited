// Ported from mudders (packages/client/src/net).
import { PeerMessageSchema, type LinkPath, type PeerMessage } from '@demodogs/shared';

/**
 * One host ⇄ guest connection. The game layer only sees this interface, whether the bytes
 * go over an `RTCDataChannel`, the signalling server's WebSocket relay ("transparent to the
 * game layer") or an in-memory pair in tests.
 */
export interface Link {
  readonly path: LinkPath;
  readonly open: boolean;
  send(msg: PeerMessage): void;
  close(): void;
  onMessage: ((msg: PeerMessage) => void) | null;
  onClose: (() => void) | null;
}

/** Largest single frame. Data channels allow ~256 KB in Chromium but less elsewhere; relay 32 KB. */
export const CHUNK = 15_000;
const PART = '\u0001';

/**
 * Turns a raw text pipe into a `Link`: JSON encoding, schema validation of everything received,
 * and splitting of large messages (a rejoin's input log) into ordered parts.
 */
export class TextLink implements Link {
  onMessage: ((msg: PeerMessage) => void) | null = null;
  onClose: (() => void) | null = null;
  private isOpen = true;
  private nextId = 1;
  private parts: string[] = [];
  private partId = '';

  constructor(
    readonly path: LinkPath,
    private readonly raw: (text: string) => void,
    private readonly rawClose: () => void = () => {},
  ) {}

  get open(): boolean {
    return this.isOpen;
  }

  send(msg: PeerMessage): void {
    if (!this.isOpen) return;
    const text = JSON.stringify(msg);
    if (text.length <= CHUNK) {
      this.raw(text);
      return;
    }
    const id = (this.nextId++).toString(36);
    const n = Math.ceil(text.length / CHUNK);
    for (let i = 0; i < n; i++) {
      this.raw(`${PART}${id}|${i}|${n}|${text.slice(i * CHUNK, (i + 1) * CHUNK)}`);
    }
  }

  /** Feed one frame received from the pipe. Malformed frames are dropped. */
  receive(text: string): void {
    if (!this.isOpen) return;
    if (text.startsWith(PART)) {
      const m = /^.([0-9a-z]+)\|(\d+)\|(\d+)\|/.exec(text);
      if (!m) return;
      const [head, id, i, n] = m as unknown as [string, string, string, string];
      if (i === '0') {
        this.partId = id;
        this.parts = [];
      }
      if (id !== this.partId || Number(i) !== this.parts.length) return;
      this.parts.push(text.slice(head.length));
      if (this.parts.length < Number(n)) return;
      text = this.parts.join('');
      this.parts = [];
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return;
    }
    const parsed = PeerMessageSchema.safeParse(raw);
    if (parsed.success) this.onMessage?.(parsed.data);
  }

  /** The pipe went away (or `close()` was called): fires `onClose` once. */
  closed(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.onClose?.();
  }

  close(): void {
    if (!this.isOpen) return;
    this.rawClose();
    this.closed();
  }
}

/**
 * Two linked in-memory links (tests, and the host's own seat). Delivery is asynchronous by default
 * like a real channel; `sync` delivers immediately for deterministic unit tests.
 */
export function linkPair(path: LinkPath = 'local', sync = false): [TextLink, TextLink] {
  const deliver = (fn: () => void) => (sync ? fn() : queueMicrotask(fn));
  // eslint-disable-next-line prefer-const
  let b: TextLink;
  const a: TextLink = new TextLink(
    path,
    (t) => deliver(() => b.receive(t)),
    () => deliver(() => b.closed()),
  );
  b = new TextLink(
    path,
    (t) => deliver(() => a.receive(t)),
    () => deliver(() => a.closed()),
  );
  return [a, b];
}

/** A bad connection to try the game on: `?lag=150&jitter=80` (ms, a round trip), `?stall=600`. */
export interface Rough {
  /** Round trip added, ms. */
  lag: number;
  /** Up to this much more on any one message, ms (a round trip's worth). */
  jitter: number;
  /** Now and then (about every four seconds) the line holds everything for this long, ms. */
  stall: number;
}

/**
 * Makes a link behave like a phone on a poor network: everything sent arrives late, by an amount
 * that wanders, and still in order (as a data channel or a socket delivers it). Both ends wrap
 * their link, so each direction gets half the round trip. For trying the game and for tests; a
 * real race never has one.
 */
export function roughLink(
  inner: Link,
  rough: Rough,
  rand: () => number = Math.random,
  now: () => number = () => performance.now(),
  later: (fn: () => void, ms: number) => void = (fn, ms) => void setTimeout(fn, ms),
): Link {
  let due = 0;
  let held = 0;
  const link: Link = {
    path: inner.path,
    get open() {
      return inner.open;
    },
    send(msg) {
      const t = now();
      if (rough.stall > 0 && t > held && rand() < 0.004) held = t + rough.stall;
      // never before the message ahead of it
      due = Math.max(due, held, t + rough.lag / 2 + (rand() * rough.jitter) / 2);
      later(() => inner.send(msg), due - t);
    },
    close: () => inner.close(),
    onMessage: null,
    onClose: null,
  };
  inner.onMessage = (m) => link.onMessage?.(m);
  inner.onClose = () => link.onClose?.();
  return link;
}

/** The bad connection asked for in the address, or null. */
export function roughFlags(search: string): Rough | null {
  const q = new URLSearchParams(search);
  const n = (k: string) => Math.max(0, Math.min(5000, Number(q.get(k)) || 0));
  const r = { lag: n('lag'), jitter: n('jitter'), stall: n('stall') };
  return r.lag + r.jitter + r.stall > 0 ? r : null;
}
