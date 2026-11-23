import {
  DT,
  NO_CONTROLS,
  packControls,
  unpackControls,
  type Controls,
  type PeerMessage,
} from '@demodogs/shared';
import type { Link } from './link';

/**
 * Host-stamped lockstep for a real-time race, after mudders' `net/lockstep.ts`.
 *
 * - Each driver's controls are held state. A driver sends a change; the host stamps it with the
 *   tick it applies before, keeps it in the race log and passes it on. Fire is a press, not held:
 *   after the tick it was stamped in, the fire bit drops on every peer alike.
 * - The host sends guests `tick { upTo, log }` every FLUSH_EVERY ticks: the changes it stamped and
 *   leave to simulate every tick before `upTo`. Guests never run past it, so they never predict
 *   or roll back. They trail the host by half a round trip and their own steering shows up after
 *   a whole round trip (tens of ms on a direct link).
 * - Every HASH_EVERY ticks guests send `world.hash()`; a mismatch makes the host send `start`
 *   again (seed, seats, the whole log) and the guest rebuilds by re-simulating, fast-forwarding.
 * - Only these few bytes cross the wire: every crater, splinter and flame is re-made by each
 *   peer's own sim from the same seed and controls.
 */
export const HASH_EVERY = 120;
/** The host sends guests their leave this often (30 Hz), with or without changes. */
export const FLUSH_EVERY = 2;
/** Most ticks one frame runs at normal speed, so a slow frame doesn't snowball. */
export const MAX_STEPS = 5;
/** A guest further behind its leave than this runs one extra tick a frame to close the gap. */
export const CATCHUP_LAG = 8;
/** Further behind than this (a rejoin or a resync), a guest fast-forwards this many ticks a frame. */
export const FAST_FORWARD = 60;
/** Hash value a guest sends to ask for the race again (it saw a change stamped in its past). */
export const RESYNC = 'resync';

const FIRE = 1 << 13;
const IDLE = packControls(NO_CONTROLS);

/** What a race driver needs from the session: one tick with every seat's controls, and a hash. */
export interface Stepper {
  step(seats: Controls[]): void;
  hash(): string;
}

/** How the session drives an online race (in place of reading input and stepping itself). */
export interface NetRace {
  readonly seat: number;
  /** The local driver's controls this frame. */
  local(c: Controls): void;
  /** Run the ticks that are due after dt seconds of real time. */
  pump(dt: number, s: Stepper): void;
  /** A short status line for the HUD: ping, path, how far behind. */
  status(): string;
}

/** The held controls of every seat, with the fire press dropped after each tick. */
class Held {
  readonly c: number[];
  constructor(seats: number) {
    this.c = Array.from({ length: seats }, () => IDLE);
  }
  controls(): Controls[] {
    return this.c.map(unpackControls);
  }
  afterTick(): void {
    for (let i = 0; i < this.c.length; i++) this.c[i]! &= ~FIRE;
  }
}

/** Sends only what changed; a fire press always goes. */
class Outbox {
  private last = IDLE;
  next(c: Controls): number | null {
    const p = packControls(c);
    if (p === this.last && !(p & FIRE)) return null;
    this.last = p & ~FIRE;
    return p;
  }
}

/** The host's side: runs the race at real speed and feeds every guest. */
export class HostRace implements NetRace {
  readonly seat = 0;
  readonly log: number[] = [];
  desyncs = 0;
  /** Ticks simulated (the world's own tick count, from 0 at the start). */
  t = 0;
  private readonly held: Held;
  private readonly box = new Outbox();
  private queue: number[] = [];
  private out: number[] = [];
  private readonly guests = new Map<number, Link>();
  private readonly hashes = new Map<number, string>();
  private acc = 0;
  onDesync: ((seat: number) => void) | null = null;

  constructor(
    seats: number,
    /** The `start` message for a seat (with the log so far), for joins and resyncs. */
    private readonly startFor: (seat: number) => PeerMessage,
  ) {
    this.held = new Held(seats);
  }

  local(c: Controls): void {
    const p = this.box.next(c);
    if (p !== null) this.submit(0, p);
  }

  /** Queue a seat's change for the next tick. */
  submit(seat: number, packed: number): void {
    if (seat < 0 || seat >= this.held.c.length) return;
    this.queue.push(seat, packed);
  }

  pump(dt: number, s: Stepper): void {
    this.acc += Math.min(dt, DT * MAX_STEPS);
    let n = 0;
    while (this.acc >= DT && n < MAX_STEPS) {
      this.stepOnce(s);
      this.acc -= DT;
      n++;
    }
  }

  stepOnce(s: Stepper): void {
    const t = this.t;
    const q = this.queue;
    for (let i = 0; i < q.length; i += 2) {
      this.held.c[q[i]!] = q[i + 1]!;
      this.log.push(t, q[i]!, q[i + 1]!);
      this.out.push(t, q[i]!, q[i + 1]!);
    }
    this.queue = [];
    s.step(this.held.controls());
    this.held.afterTick();
    this.t++;
    if (this.t % HASH_EVERY === 0) {
      this.hashes.set(this.t, s.hash());
      this.hashes.delete(this.t - HASH_EVERY * 30);
    }
    if (this.out.length > 0 || this.t % FLUSH_EVERY === 0) this.flush();
  }

  flush(): void {
    const msg: PeerMessage = { type: 'tick', upTo: this.t, log: this.out };
    for (const link of this.guests.values()) link.send(msg);
    this.out = [];
  }

  /** A guest's link is (re)connected; `haveTick` is the last tick it simulated, or -1. */
  attach(seat: number, link: Link, haveTick: number): void {
    this.flush();
    this.guests.set(seat, link);
    if (haveTick < 0 || haveTick > this.t) link.send(this.startFor(seat));
    else {
      const log: number[] = [];
      for (let i = 0; i < this.log.length; i += 3)
        if (this.log[i]! >= haveTick) log.push(this.log[i]!, this.log[i + 1]!, this.log[i + 2]!);
      link.send({ type: 'tick', upTo: this.t, log });
    }
  }

  /** A guest's link went away: its car rolls to a stop until it is back. */
  detach(seat: number): void {
    this.guests.delete(seat);
    this.submit(seat, IDLE);
  }

  connected(seat: number): boolean {
    return this.guests.has(seat);
  }

  handle(seat: number, msg: PeerMessage): void {
    if (msg.type === 'ctl') this.submit(seat, msg.c);
    else if (msg.type === 'hash') {
      const mine = this.hashes.get(msg.t);
      if (msg.h === RESYNC || (mine !== undefined && mine !== msg.h)) {
        this.desyncs++;
        console.warn(`[net] seat ${seat} out of step at tick ${msg.t}: resending the race`);
        this.onDesync?.(seat);
        this.flush();
        this.guests.get(seat)?.send(this.startFor(seat));
      }
    }
  }

  status(): string {
    return `HOST · ${this.guests.size} linked${this.desyncs ? ` · ${this.desyncs} resync` : ''}`;
  }
}

/** A guest's side: simulates exactly what the host has stamped, never further. */
export class GuestRace implements NetRace {
  t = 0;
  upTo: number;
  rebuilds = 0;
  private readonly held: Held;
  private readonly box = new Outbox();
  /** Stamped changes not applied yet, as flat triples in tick order. */
  private pending: number[] = [];
  private head = 0;
  private acc = 0;
  /** Set by the session layer: ping in ms and the link's path, for the status line. */
  ping = 0;
  path = '';

  constructor(
    readonly seat: number,
    seats: number,
    log: readonly number[],
    upTo: number,
    readonly send: (msg: PeerMessage) => void,
  ) {
    this.held = new Held(seats);
    this.pending = log.slice();
    this.upTo = upTo;
  }

  get lag(): number {
    return this.upTo - this.t;
  }

  local(c: Controls): void {
    const p = this.box.next(c);
    if (p !== null) this.send({ type: 'ctl', c: p });
  }

  /** `tick` from the host. */
  receive(upTo: number, log: readonly number[]): void {
    for (let i = 0; i < log.length; i += 3) {
      if (log[i]! < this.t) {
        // stamped in a tick this guest already ran: it can only be put right from the start
        this.send({ type: 'hash', t: this.t, h: RESYNC });
        return;
      }
      this.pending.push(log[i]!, log[i + 1]!, log[i + 2]!);
    }
    this.upTo = Math.max(this.upTo, upTo);
  }

  pump(dt: number, s: Stepper): void {
    this.acc = Math.min(this.acc + dt, DT * MAX_STEPS);
    let n = Math.floor(this.acc / DT);
    this.acc -= n * DT;
    const lag = this.lag;
    if (lag > FAST_FORWARD) n = FAST_FORWARD;
    else if (lag > CATCHUP_LAG) n++;
    n = Math.min(n, lag);
    // waiting on the host: don't bank the time, or the guest lurches when the leave arrives
    if (n <= 0) this.acc = Math.min(this.acc, DT);
    for (let i = 0; i < n; i++) this.stepOnce(s);
  }

  stepOnce(s: Stepper): void {
    const P = this.pending;
    while (this.head < P.length && P[this.head]! === this.t) {
      const seat = P[this.head + 1]!;
      if (seat >= 0 && seat < this.held.c.length) this.held.c[seat] = P[this.head + 2]!;
      this.head += 3;
    }
    if (this.head > 3000) {
      this.pending = P.slice(this.head);
      this.head = 0;
    }
    s.step(this.held.controls());
    this.held.afterTick();
    this.t++;
    if (this.t % HASH_EVERY === 0) this.send({ type: 'hash', t: this.t, h: s.hash() });
  }

  status(): string {
    const path = this.path ? ` · ${this.path}` : '';
    const behind = this.lag > CATCHUP_LAG ? ` · catching up ${this.lag}` : '';
    return `${this.ping} ms${path}${behind}`;
  }
}
