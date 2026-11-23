import { Shape } from './batch';
import type { Put } from './particles';

/**
 * Electric sparks as single cells, in the same grain as the fire and smoke cells (cells.ts). A
 * bolt is a crooked line of cells that stand where they are put and flicker out on their own
 * clocks, white-hot at the core and violet at the fringe; a spark is a cell flung off a strike
 * that falls, skips once off the ground and cools from white through blue to violet before it
 * winks out. Nothing is a drawn line or a soft sprite.
 *
 * Struct-of-arrays with a fixed capacity; purely visual, never fed to the sim.
 */
export const SKind = {
  /** A cell of a bolt: stands still, flickers, burns out fast. */
  Bolt: 0,
  /** A cell flung off a strike: flies, falls, skips and cools. */
  Spark: 1,
} as const;
export type SKind = (typeof SKind)[keyof typeof SKind];

/** Charge colours from hottest to coolest, in hard steps. */
export const ARC_RAMP: readonly number[] = [
  0xffffff, 0xe8f6ff, 0xb4e4ff, 0x7cc4ff, 0x5a8cff, 0x7a5cf0, 0x5a3cb0,
];
/** The glow a hot cell adds over itself. */
const ARC_GLOW = 0x6fb8ff;

export class Sparks {
  n = 0;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly z: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly th: Float32Array;
  private readonly kind: Uint8Array;
  private next = 0;

  constructor(
    readonly cap: number,
    private readonly rand: () => number = Math.random,
  ) {
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.z = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.vz = new Float32Array(cap);
    this.age = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.th = new Float32Array(cap);
    this.kind = new Uint8Array(cap);
  }

  add(
    kind: SKind,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
  ): void {
    let i = this.n;
    if (i >= this.cap) {
      i = this.next;
      this.next = (this.next + 7) % this.cap;
    } else this.n++;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = Math.max(0, z);
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.age[i] = 0;
    this.life[i] = life;
    this.th[i] = this.rand();
    this.kind[i] = kind;
  }

  /**
   * A bolt from one point to another: the line is split again and again and each middle point
   * pushed sideways (less at each split), so it comes out crooked at every scale; then it is laid
   * down in cells about one art px apart. Now and then a short fork leaves it. Returns the cells
   * laid.
   */
  bolt(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    life = 0.16,
    fork = true,
  ): number {
    const rand = this.rand;
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    let pts: number[] = [x0, y0, z0, x1, y1, z1];
    let jag = len * 0.22;
    while (pts.length / 3 - 1 < len / 4 && pts.length < 3 * 65) {
      const out: number[] = [];
      for (let i = 0; i + 3 < pts.length; i += 3) {
        out.push(pts[i]!, pts[i + 1]!, pts[i + 2]!);
        out.push(
          (pts[i]! + pts[i + 3]!) / 2 + (rand() - 0.5) * jag,
          (pts[i + 1]! + pts[i + 4]!) / 2 + (rand() - 0.5) * jag,
          Math.max(0, (pts[i + 2]! + pts[i + 5]!) / 2 + (rand() - 0.5) * jag * 0.6),
        );
      }
      out.push(x1, y1, z1);
      pts = out;
      jag *= 0.55;
    }
    let laid = 0;
    for (let i = 0; i + 3 < pts.length; i += 3) {
      const ax = pts[i]!;
      const ay = pts[i + 1]!;
      const az = pts[i + 2]!;
      const bx = pts[i + 3]!;
      const by = pts[i + 4]!;
      const bz = pts[i + 5]!;
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / 0.8));
      for (let k = 0; k < steps; k++) {
        const f = k / steps;
        this.add(
          SKind.Bolt,
          ax + (bx - ax) * f,
          ay + (by - ay) * f,
          az + (bz - az) * f,
          0,
          0,
          0,
          life * (0.6 + rand() * 0.8),
        );
        laid++;
      }
      if (fork && len > 14 && rand() < 0.12) {
        const a = rand() * Math.PI * 2;
        const d = len * (0.1 + rand() * 0.15);
        laid += this.bolt(
          ax,
          ay,
          az,
          ax + Math.cos(a) * d,
          ay + Math.sin(a) * d,
          Math.max(0, az - d * 0.4),
          life * 0.7,
          false,
        );
      }
    }
    return laid;
  }

  /** `n` sparks flung out of (x, y, z) at up to `v` art px per second. */
  shower(x: number, y: number, z: number, n: number, v = 70): void {
    const rand = this.rand;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const s = v * (0.3 + rand() * 0.7);
      this.add(
        SKind.Spark,
        x,
        y,
        z,
        Math.cos(a) * s,
        Math.sin(a) * s,
        20 + rand() * 90,
        0.25 + rand() * 0.45,
      );
    }
  }

  step(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const a = this.age[i]! + dt;
      if (a >= this.life[i]!) continue;
      let x = this.x[i]!;
      let y = this.y[i]!;
      let z = this.z[i]!;
      let vx = this.vx[i]!;
      let vy = this.vy[i]!;
      let vz = this.vz[i]!;
      if (this.kind[i] === SKind.Spark) {
        vz -= 320 * dt;
        x += vx * dt;
        y += vy * dt;
        z += vz * dt;
        if (z < 0) {
          // it skips off the ground, losing most of its speed
          z = 0;
          vz = -vz * 0.35;
          vx *= 0.5;
          vy *= 0.5;
        }
      }
      this.x[w] = x;
      this.y[w] = y;
      this.z[w] = z;
      this.vx[w] = vx;
      this.vy[w] = vy;
      this.vz[w] = vz;
      this.age[w] = a;
      this.life[w] = this.life[i]!;
      this.th[w] = this.th[i]!;
      this.kind[w] = this.kind[i]!;
      w++;
    }
    this.n = w;
    if (this.next >= w) this.next = 0;
  }

  /** Every cell is one art pixel, added over what is there, the hottest with a glow round it. */
  draw(_normal: Put, glow: Put, seen: (x: number, y: number, z: number) => boolean): void {
    const last = ARC_RAMP.length - 1;
    for (let i = 0; i < this.n; i++) {
      const t = this.age[i]! / this.life[i]!;
      const th = this.th[i]!;
      // each cell drops out on its own clock as it burns down, so a bolt breaks up, not fades
      if (th < t * t) continue;
      const x = this.x[i]!;
      const y = this.y[i]!;
      const z = this.z[i]!;
      if (!seen(x, y, z)) continue;
      const bolt = this.kind[i] === SKind.Bolt;
      // a bolt flickers: on and off on its own beat while it lives
      if (bolt && t > 0.25 && (Math.floor(this.age[i]! * 50 + th * 7) & 1) === 1) continue;
      const step = Math.min(last, Math.floor((bolt ? t * 1.4 : t) * last + th * 0.9));
      glow(x, y, z, 1, ARC_RAMP[step]!, 1, Shape.Rect);
      if (step < 3) glow(x, y, z, bolt ? 3 : 2, ARC_GLOW, bolt ? 0.3 : 0.2, Shape.Rect);
    }
  }

  clear(): void {
    this.n = 0;
  }
}
