import { DRIFT } from '@demodogs/shared';

/**
 * The driving lesson a new player is given before a first race: six things to do, one at a time,
 * each done by doing it. This is the lesson's own book-keeping only (which step is on, where its
 * rings, crate and targets stand, when it is done); the world it is given in and what is drawn
 * are the tutor's (ui/tutor.ts). Nothing here touches the DOM or the sim, so it can be tested.
 */

export type StepId = 'drive' | 'brake' | 'boost' | 'drift' | 'crate' | 'fire';

/** The steps, in the order they are taught. */
export const STEPS: readonly StepId[] = ['drive', 'brake', 'boost', 'drift', 'crate', 'fire'];

/** What the lesson reads of the world, each frame. */
export interface Seen {
  x: number;
  y: number;
  /** The car's heading, radians. */
  h: number;
  /** The brake is held. */
  brake: boolean;
  /** Nitro is burning. */
  boosting: boolean;
  /** Seconds a drift has been held well (the car's `charge`): 0 when there is none. */
  charge: number;
  /** A weapon is in hand. */
  armed: boolean;
  /** How many of the parked targets are wrecked. */
  wrecks: number;
}

export interface Spot {
  x: number;
  y: number;
}

/** The lawn the lesson is given on. */
export interface Lawn {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** What changed in an update, for the tutor to show. */
export type Change =
  /** A ring was driven through (not the last). */
  | 'ring'
  /** The step was done: the cheer is up. */
  | 'cheer'
  /** A new step began: its things want putting in the world. */
  | 'step'
  /** The rockets ran out with nothing hit: hand over some more. */
  | 'rearm'
  /** The last step's cheer is over. */
  | 'done';

/** How near a ring's middle counts as through it, art px. */
export const RING = 34;
/** Seconds a cheer stays up before the next step begins. */
export const CHEER = 1.4;
/** Seconds of holding that a held button's step asks for. */
const HOLD: Partial<Record<StepId, number>> = { brake: 0.7, boost: 1 };
/** Seconds with nothing to fire before more rockets are handed over. */
const REARM = 1.2;

/** Each step's things, as (ahead, to the right) of the car when the step begins. */
const PLACES: Record<StepId, [number, number][]> = {
  // (near enough to be on a phone's screen from where the car stands)
  drive: [
    [110, 0],
    [220, 60],
    [330, -30],
  ],
  brake: [],
  boost: [],
  drift: [],
  crate: [[120, 0]],
  fire: [
    [130, 0],
    [175, 50],
  ],
};

function within(L: Lawn, p: Spot, q: number): boolean {
  return ((p.x - L.cx) / (L.rx * q)) ** 2 + ((p.y - L.cy) / (L.ry * q)) ** 2 <= 1;
}

/**
 * Where a step's things go: ahead of the car as it stands if there is room there, otherwise
 * along the nearest heading that has room, so nothing is ever put through the fence.
 */
export function layout(from: Seen, L: Lawn, places: readonly [number, number][]): Spot[] {
  const at = (h: number): Spot[] =>
    places.map(([a, s]) => ({
      x: from.x + Math.cos(h) * a - Math.sin(h) * s,
      y: from.y + Math.sin(h) * a + Math.cos(h) * s,
    }));
  const N = 24;
  // the car's own heading first, then a little to either side, and so on round
  for (let i = 0; i < N; i++) {
    const turn = (Math.ceil(i / 2) * (i % 2 ? 1 : -1) * Math.PI * 2) / N;
    const spots = at(from.h + turn);
    if (spots.every((p) => within(L, p, 0.82))) return spots;
  }
  // (a car against the fence on a lawn too small: towards the middle, pulled inside)
  return at(Math.atan2(L.cy - from.y, L.cx - from.x)).map((p) => {
    const d = Math.hypot((p.x - L.cx) / (L.rx * 0.82), (p.y - L.cy) / (L.ry * 0.82));
    return d <= 1 ? p : { x: L.cx + (p.x - L.cx) / d, y: L.cy + (p.y - L.cy) / d };
  });
}

export class Lesson {
  /** Which step is on (an index into STEPS); STEPS.length once the lesson is over. */
  index = 0;
  /** Seconds of the cheer left; while it is up the step is done and the next has not begun. */
  cheer = 0;
  /** How far through the step, 0 to 1, for the steps that are measured. */
  progress = 0;
  /** The step's things: rings to drive through, the crate, the targets. */
  spots: Spot[] = [];
  /** The next ring to drive through. */
  ring = 0;
  /** More rockets were handed over after a miss. */
  missed = false;
  private held = 0;
  private empty = 0;
  /** The drift step: a slide has been held long enough to pay. */
  private charged = false;

  constructor(
    private readonly lawn: Lawn,
    from: Seen,
    /** Begin at this step (for pictures of one step). */
    start = 0,
  ) {
    this.index = Math.max(0, Math.min(STEPS.length - 1, start));
    this.begin(from);
  }

  get step(): StepId | null {
    return STEPS[this.index] ?? null;
  }

  get over(): boolean {
    return this.index >= STEPS.length;
  }

  private begin(from: Seen): void {
    const s = this.step;
    this.progress = this.held = this.empty = this.ring = 0;
    this.missed = this.charged = false;
    this.spots = s ? layout(from, this.lawn, PLACES[s]) : [];
  }

  /** One frame of the lesson. Returns what changed, if anything did. */
  update(seen: Seen, dt: number): Change | null {
    const s = this.step;
    if (!s) return null;
    if (this.cheer > 0) {
      this.cheer -= dt;
      if (this.cheer > 0) return null;
      this.cheer = 0;
      this.index++;
      this.begin(seen);
      return this.over ? 'done' : 'step';
    }
    let done: boolean;
    let change: Change | null = null;
    if (s === 'drive') {
      const g = this.spots[this.ring];
      if (g && Math.hypot(seen.x - g.x, seen.y - g.y) < RING) {
        this.ring++;
        change = 'ring';
      }
      this.progress = this.ring / this.spots.length;
      done = this.ring >= this.spots.length;
    } else if (s === 'brake' || s === 'boost') {
      if (s === 'brake' ? seen.brake : seen.boosting) this.held += dt;
      this.progress = Math.min(1, this.held / HOLD[s]!);
      done = this.progress >= 1;
    } else if (s === 'drift') {
      // held until the sparks turn, then let go: the burst is the lesson
      if (seen.charge >= DRIFT.stage[0]) this.charged = true;
      this.progress = this.charged ? 0.9 : Math.min(0.8, (seen.charge / DRIFT.stage[0]) * 0.8);
      done = this.charged && seen.charge === 0;
    } else if (s === 'crate') done = seen.armed;
    else {
      done = seen.wrecks > 0;
      // every rocket gone wide: wait for the last to land, then hand over three more
      this.empty = seen.armed ? 0 : this.empty + dt;
      if (!done && this.empty > REARM) {
        this.empty = 0;
        this.missed = true;
        change = 'rearm';
      }
    }
    if (!done) return change;
    this.progress = 1;
    this.cheer = CHEER;
    return 'cheer';
  }
}

export interface Words {
  title: string;
  sub: string;
}

/** What the card says for a step: for thumbs on glass, or for a keyboard. */
export function words(step: StepId, keys: boolean, missed = false): Words {
  switch (step) {
    case 'drive':
      return keys
        ? {
            title: 'DRIVE WITH W A S D',
            sub: 'Or the arrow keys: up is gas, left and right steer. Drive through the 3 rings!',
          }
        : {
            title: 'DRAG TO DRIVE',
            sub: 'Thumb down on the left, push the way you want to go. Drive through the 3 rings!',
          };
    case 'brake':
      return {
        title: keys ? 'HOLD S TO BRAKE' : 'HOLD BRAKE',
        sub: 'It stops the car. Keep holding and you back up.',
      };
    case 'boost':
      return {
        title: keys ? 'HOLD SPACE TO BOOST' : 'HOLD BOOST',
        sub: 'Nitro! The blue tank drains while you hold, then fills back up by itself.',
      };
    case 'drift':
      return keys
        ? {
            title: 'DRIFT: GAS, TURN AND S',
            sub: 'Get up to speed, turn, and hold the brake with the gas still on. When the sparks turn yellow, let go: whoosh!',
          }
        : {
            title: 'DRIFT: BRAKE IN A TURN',
            sub: 'Get up to speed, turn, and hold BRAKE while you steer. When the sparks turn yellow, let go: whoosh!',
          };
    case 'crate':
      return {
        title: 'GRAB THE CRATE',
        sub: 'Just drive through it. Crates hold weapons, repairs, shields and tricks.',
      };
    case 'fire':
      return {
        title: keys ? 'PRESS X TO FIRE' : 'TAP FIRE!',
        sub: missed
          ? 'So close! Here are three more. Point your nose at the parked car.'
          : 'Point your nose at the parked car and let the rockets go.',
      };
  }
}

/** What is shouted when a step is done. */
export const CHEERS: Record<StepId, string> = {
  drive: 'NICE DRIVING!',
  brake: 'SMOOTH!',
  boost: 'WHOOSH!',
  drift: 'DRIFT KING!',
  crate: 'ROCKETS!',
  fire: 'BOOM!',
};

/** Where the answer to "show me the lesson?" is kept on the device. */
export const LESSON_KEY = 'dd-lesson-v1';

/**
 * Is the lesson offered by itself when the game opens? Once, to somebody new: never again after
 * it was taken or turned down, and never to a device that already has a career or a best score.
 */
export function offerLesson(
  store: Pick<Storage, 'getItem' | 'length' | 'key'> | undefined,
): boolean {
  if (!store) return false;
  try {
    if (store.getItem(LESSON_KEY) !== null) return false;
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i) ?? '';
      if (k.startsWith('dd-career') || k.startsWith('dd-best-')) return false;
    }
    return true;
  } catch {
    return false;
  }
}
