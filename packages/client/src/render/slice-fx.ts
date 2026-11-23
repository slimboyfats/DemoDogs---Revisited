import type { World } from '@demodogs/sim';
import type { Strip } from './stack';
import type { StackSink } from './stacks';

/**
 * Slice effects: what only a stack of slices can do, because every slice is its own thing (after
 * the build effect of loktar00/sprite-stack-engine). A thing that appears is BUILT, its slices
 * dropping in from above, the lowest first, each turning as it settles. Client only: the sim
 * knows nothing of it.
 */

/** Seconds a slice takes to fall into place, and how far up it starts (art px). */
const FALL = 0.26;
const DROP = 30;
/** How far round a slice is turned when it starts to fall (radians). */
const TURN = 1.3;
/** Art px of height that start falling each second: a car is whole in about half a second. */
const RISE = 34;

/** Seconds after which a build is dropped whatever its height. */
const STALE = 5;

/** A thing being built: when it began (slice clock) and the height its foot is at. */
export interface Build {
  t0: number;
  base: number;
}

/**
 * Where the slice `h` art px above a thing's foot is, `t` seconds into its build: null while it
 * has not started to fall, else how far above its place it is and how far it is turned. Both are
 * 0 once it has landed.
 */
export function buildSlice(h: number, t: number): { dz: number; turn: number } | null {
  const p = (t - Math.max(0, h) / RISE) / FALL;
  if (p <= 0) return null;
  if (p >= 1) return LANDED;
  // falls fast and settles: ease out
  const k = (1 - p) * (1 - p);
  return { dz: k * DROP, turn: k * TURN };
}
const LANDED = { dz: 0, turn: 0 };

/** Seconds a thing `height` art px tall takes to build. */
export const buildTime = (height: number): number => Math.max(0, height) / RISE + FALL;

/** The slice effects' state for one race: what is being built. */
export class SliceFx {
  /** The slice clock, seconds: moved by the frame, not the sim (the track creator stops the sim). */
  now = 0;
  /** Off: nothing is built (`?slices=0` clears `enabled` for every race of the visit). */
  static enabled = true;
  on = SliceFx.enabled;
  private readonly builds = new Map<object, Build>();
  private statics = -1;
  private props = -1;
  private pickups: boolean[] = [];

  /** Start building a thing whose foot is `base` art px up. */
  start(o: object, base = 0): void {
    if (this.on) this.builds.set(o, { t0: this.now, base });
  }

  /** The build a thing is in the middle of, if any. */
  building(o: object, height: number): Build | null {
    const b = this.builds.get(o);
    if (!b) return null;
    if (this.now - b.t0 >= buildTime(height)) {
      this.builds.delete(o);
      return null;
    }
    return b;
  }

  /**
   * Once a frame: move the clock, and start a build for whatever has appeared since
   * the last look: scenery and props put down after the start (the track creator, the test
   * range), and pickups that have come back.
   */
  frame(w: World, dt: number): void {
    this.now += dt;
    if (this.statics < 0) {
      this.statics = w.statics.length;
      this.props = w.props.length;
      this.pickups = w.pickups.map((p) => p.on);
      return;
    }
    for (let i = this.statics; i < w.statics.length; i++) this.start(w.statics[i]!);
    this.statics = w.statics.length;
    for (let i = this.props; i < w.props.length; i++) this.start(w.props[i]!, w.props[i]!.z);
    this.props = w.props.length;
    for (let i = 0; i < w.pickups.length; i++) {
      const p = w.pickups[i]!;
      if (p.on && this.pickups[i] === false) this.start(p);
      this.pickups[i] = p.on;
    }
    // a build nobody asked after (it went up out of sight) is over all the same
    for (const [o, b] of this.builds) if (this.now - b.t0 > STALE) this.builds.delete(o);
  }

  /** Things with a build under way (for tests and the counters). */
  get busy(): number {
    return this.builds.size;
  }
}

/**
 * A sink that builds what goes through it: every slice is passed on where the build has it now
 * (above its place and turned, or not at all yet). Stacks and limbs are taken apart into slices.
 */
export class Builder implements StackSink {
  private R!: StackSink;
  private b: Build = { t0: 0, base: 0 };
  private t = 0;
  private zm = 1;

  /** Build what follows into `R`, `t` seconds into build `b`. */
  into(R: StackSink, b: Build, t: number): this {
    this.R = R;
    this.b = b;
    this.t = t;
    this.zm = 1;
    return this;
  }

  visible(x: number, y: number, rad: number, ht?: number): boolean {
    return this.R.visible(x, y, rad + 4, (ht ?? 0) + DROP);
  }
  group(key: number): void {
    this.R.group(key);
  }
  slice(
    s: Strip,
    i: number,
    x: number,
    y: number,
    z: number,
    rot: number,
    thick = 1,
    alpha = 1,
  ): void {
    const at = buildSlice(z - this.b.base, this.t);
    if (at) this.R.slice(s, i, x, y, z + at.dz, rot + at.turn, thick, alpha);
  }
  stack(s: Strip, x: number, y: number, z: number, rot: number, alpha = 1): void {
    const res = s.res / this.zm;
    for (let i = 0; i < s.n; i++) this.slice(s, i, x, y, z + i / res, rot, 1, alpha);
  }
  zoom(k: number): void {
    this.zm = k;
    this.R.zoom(k);
  }
  limb(s: Strip, a: readonly number[], b: readonly number[], n: number): void {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      this.stack(
        s,
        a[0]! + (b[0]! - a[0]!) * t,
        a[1]! + (b[1]! - a[1]!) * t,
        a[2]! + (b[2]! - a[2]!) * t - 0.5,
        0,
      );
    }
  }
  mark(): number {
    return this.R.mark?.() ?? 0;
  }
  rim(from: number, rgb: number): void {
    this.R.rim?.(from, rgb);
  }
  warm(on: boolean): void {
    this.R.warm?.(on);
  }
  get rimOn(): boolean {
    return this.R.rimOn ?? false;
  }
}
