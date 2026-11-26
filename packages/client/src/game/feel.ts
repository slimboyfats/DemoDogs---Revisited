import type { SimEvent } from '@demodogs/shared';

/**
 * How the game feels in the hand: how hard the screen shakes, how long a big blow stops the
 * clock, how hard the phone (or the gamepad) buzzes, and whether a gamepad drives. Shares of the
 * game's own amounts: 1 is as made, 0 is off.
 */
export interface FeelSetup {
  shake: number;
  stop: number;
  buzz: number;
  pad: boolean;
}

export const FEEL_DEFAULT: FeelSetup = { shake: 1, stop: 1, buzz: 1, pad: true };
/** The sliders' ends and steps. */
export const FEEL_RANGE = {
  shake: { max: 2, step: 0.1 },
  stop: { max: 2, step: 0.1 },
  buzz: { max: 1, step: 0.1 },
} as const;

const SAVE = 'demodogs.feel';

/** A plain key-value store: localStorage, or anything like it. */
interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const share = (v: unknown, max: number, d: number): number =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.round(Math.min(max, Math.max(0, v)) * 10) / 10
    : d;

/** A setup from whatever was written down: anything missing or wrong is the default. */
export function fitFeel(raw: unknown): FeelSetup {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    shake: share(o.shake, FEEL_RANGE.shake.max, FEEL_DEFAULT.shake),
    stop: share(o.stop, FEEL_RANGE.stop.max, FEEL_DEFAULT.stop),
    buzz: share(o.buzz, FEEL_RANGE.buzz.max, FEEL_DEFAULT.buzz),
    pad: typeof o.pad === 'boolean' ? o.pad : FEEL_DEFAULT.pad,
  };
}

/** What can buzz: the phone (on and off times in ms) and a gamepad (ms, and how hard, 0 to 1). */
export interface Buzzers {
  vibrate?: (pattern: number[]) => void;
  rumble?: (ms: number, strong: number, weak: number) => void;
  /** Milliseconds, from any clock that only goes up. */
  now: () => number;
}

/** At most one buzz in this many ms, so a hail of small blows is not one long drone. */
const BUZZ_GAP = 70;

/**
 * The feel settings, saved on the device, and the buzzer. This screen's business only: nothing
 * in the world reads it, so an online race is the same race however it feels.
 */
export class Feel {
  setup: FeelSetup = { ...FEEL_DEFAULT };
  private busyUntil = -1e9;
  private lastAt = -1e9;

  constructor(
    private readonly store?: Store,
    private readonly out?: Buzzers,
  ) {
    try {
      const s = store?.getItem(SAVE);
      if (s) this.setup = fitFeel(JSON.parse(s));
    } catch {
      /* nothing saved, or nonsense: the default */
    }
  }

  set(change: Partial<FeelSetup>): void {
    this.setup = fitFeel({ ...this.setup, ...change });
    try {
      this.store?.setItem(SAVE, JSON.stringify(this.setup));
    } catch {
      /* not saved, still works for this visit */
    }
  }

  /**
   * Buzz for a blow of `amount` (the same number the screen shakes by: 3 a nudge, 10 a wreck).
   * A buzz never cuts a longer one short, and small ones are spaced out.
   */
  thump(amount: number): void {
    if (amount <= 0) return;
    this.play([Math.round(Math.min(130, 12 + amount * 8))], Math.min(1, 0.25 + amount / 12));
  }

  /** A pattern by name: a tick for a pickup, a long double thud for being scrapped, GO. */
  cue(name: Cue): void {
    this.play(CUES[name], name === 'wreck' ? 1 : 0.5);
  }

  private play(pattern: readonly number[], hard: number): void {
    const k = this.setup.buzz;
    const o = this.out;
    if (!o || k <= 0) return;
    const t = o.now();
    // the phone cannot buzz softly, so a lower setting is a shorter buzz
    const scaled = pattern.map((ms, i) => (i % 2 ? ms : Math.max(8, Math.round(ms * k))));
    const length = scaled.reduce((a, b) => a + b, 0);
    if (t - this.lastAt < BUZZ_GAP || t + length <= this.busyUntil) return;
    this.lastAt = t;
    this.busyUntil = t + length;
    try {
      o.vibrate?.(scaled);
      o.rumble?.(length, Math.min(1, hard * k), Math.min(1, hard * k * 0.6));
    } catch {
      /* a browser that will not buzz just now */
    }
  }
}

export type Cue = 'pickup' | 'wreck' | 'go';
const CUES: Record<Cue, readonly number[]> = {
  pickup: [14],
  wreck: [70, 50, 150],
  go: [30],
};

/** The buzzes that are not blows, for the car this screen drives. */
export function cuesOf(events: readonly SimEvent[], me: number): Cue[] {
  const out: Cue[] = [];
  for (const e of events) {
    if (e.t === 'pickup' && e.car === me) out.push('pickup');
    else if (e.t === 'wreck' && e.car === me) out.push('wreck');
    else if (e.t === 'go') out.push('go');
  }
  return out;
}

/** The shake that counts as a blow worth stopping the clock for, and the most there is. */
const STOP_FROM = 5;
const SHAKE_TOP = 16;

/**
 * Seconds the world holds still for a blow of `amount`: nothing under a solid knock, then from
 * about two frames up to about seven for the biggest blast.
 */
export function hitStop(amount: number): number {
  if (amount < STOP_FROM) return 0;
  const k = Math.min(1, (amount - STOP_FROM) / (SHAKE_TOP - STOP_FROM));
  return 0.035 + 0.08 * k;
}

/** Game seconds between two stops, so a string of blasts does not turn the race to treacle. */
export const STOP_REST = 0.45;

/** The spring the picture hangs on: quick, and still after two or three swings. */
const OMEGA = Math.PI * 2 * 8.5;
const DAMP = 0.3;
/** Art pixels of swing for each unit of blow, and of steady rattle while the ground shakes. */
const KICK = 0.32;
const RATTLE = 0.07;
/** The most the picture ever moves, in art pixels, whatever is going off and however it is set. */
export const SWING_TOP = 9;
/** What a kick of 1 needs as speed for its first swing to reach 1 (found by `peakOf`). */
const LAUNCH = OMEGA / peakOf();

/** How far a kick at speed 1 swings out on this spring, times OMEGA. */
function peakOf(): number {
  const wd = Math.sqrt(1 - DAMP * DAMP);
  return Math.exp((-DAMP * Math.atan2(wd, DAMP)) / wd);
}

/**
 * The picture's shake. A blow kicks it one way and it swings back on a damped spring, which reads
 * as a hit where plain jitter reads as noise; while the ground goes on shaking (a quake, a
 * collapse) it rattles as well. All in art pixels, added to where the camera looks.
 */
export class Shaker {
  x = 0;
  y = 0;
  private vx = 0;
  private vy = 0;
  private t = 0;
  private turn = 0.7;

  /** A blow of `amount`, from the side (dx, dy) if that is known. */
  kick(amount: number, dx = 0, dy = 0): void {
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) {
      // no side to it: each one from a new quarter, most of it across the screen
      this.turn += 2.399963;
      dx = Math.cos(this.turn);
      dy = Math.sin(this.turn) * 0.6;
    } else {
      dx /= d;
      dy /= d;
    }
    const v = Math.min(SHAKE_TOP, amount) * KICK * LAUNCH;
    this.vx += dx * v;
    this.vy += dy * v;
  }

  /** On by `dt` seconds, with the ground shaking by `rumble` and everything scaled by `level`. */
  step(dt: number, rumble: number, level: number): void {
    let left = Math.min(0.1, dt);
    while (left > 1e-6) {
      const h = Math.min(left, 1 / 240);
      left -= h;
      this.vx += (-OMEGA * OMEGA * this.sx - 2 * DAMP * OMEGA * this.vx) * h;
      this.vy += (-OMEGA * OMEGA * this.sy - 2 * DAMP * OMEGA * this.vy) * h;
      this.sx += this.vx * h;
      this.sy += this.vy * h;
    }
    this.t += dt;
    const r = Math.min(SHAKE_TOP, rumble) * RATTLE;
    const t = this.t;
    const nx = Math.sin(t * 61) + Math.sin(t * 97 + 1.3) * 0.6;
    const ny = Math.sin(t * 71 + 2.1) + Math.sin(t * 113 + 0.4) * 0.6;
    const cap = (v: number) => Math.max(-SWING_TOP, Math.min(SWING_TOP, v));
    this.x = cap((this.sx + nx * r) * level);
    this.y = cap((this.sy + ny * r) * level);
  }

  private sx = 0;
  private sy = 0;
}
