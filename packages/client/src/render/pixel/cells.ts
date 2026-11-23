import { Shape } from './batch';
import { shade, WIND, type Put } from './particles';

/**
 * Fire and smoke as mudders draws them: nothing is a drawn shape. A blast lets go thousands of
 * single cells of burning gas and shoves the air, and the air carries them: each cell goes where
 * the air goes, burns down the fire ramp on its own clock and winks out by itself, so a fireball
 * rolls, curls over and thins out into soot cell by cell. (mudders: PKind.Bang, Fire and Wisp in
 * render/pixel/gpu-particles.ts.) Here every cell also has a height, and the turning air is a
 * ring: the roll of a ground burst seen from above, rising as a mushroom's cap does.
 *
 * Struct-of-arrays in typed arrays with a fixed capacity; purely visual, never fed to the sim.
 */
export const CKind = {
  /** A blast's first flash: all fire from start to finish, thrown too hard for the air to stop. */
  Bang: 0,
  /** Burning gas: goes where the air goes, burns out in its first third, then is soot that pales. */
  Fire: 1,
  /** Smoke, steam or dust: dark when fresh, its own colour, paler as it thins out. */
  Wisp: 2,
  /**
   * A leaf torn off a tree: flung out, brakes hard in the air, then flutters down on the wind,
   * swinging from side to side and flipping between its light and its dark face. Where it lands
   * it stays: `landed` hands it over to be painted into the ground. (mudders: PKind.Leaf.)
   */
  Leaf: 3,
  /**
   * A smoke screen's smoke: heavy and cold, so it does not climb like Wisp. It rolls low over the
   * ground at its own height, drifts a little on the wind and stays thick two cells across for
   * most of its life, so that a bank of it hides the road under it.
   */
  Fog: 4,
} as const;
export type CKind = (typeof CKind)[keyof typeof CKind];

/**
 * A ring of turning air lying flat at height z: air goes up through the middle, out over the top,
 * down the outside and back in underneath. `R` is the ring's radius, `r` the reach of its roll,
 * `spin` the speed of the air at that reach (art px per second). It climbs at `vz`, widens at
 * `grow` and dies away over `life` seconds.
 */
export interface Ring {
  x: number;
  y: number;
  z: number;
  vz: number;
  R: number;
  r: number;
  spin: number;
  grow: number;
  life: number;
  max: number;
}

const rgbOf = (r: number, g: number, b: number): number =>
  (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);

type V3 = readonly [number, number, number];
const mix = (a: V3, b: V3, f: number): V3 => [
  a[0] + (b[0] - a[0]) * f,
  a[1] + (b[1] - a[1]) * f,
  a[2] + (b[2] - a[2]) * f,
];
const ramp3 = (a: V3, b: V3, c: V3, f: number): V3 =>
  f < 0.5 ? mix(a, b, f * 2) : mix(b, c, f * 2 - 1);

const WHITE: V3 = [1, 0.97, 0.78];
const YELLOW: V3 = [1, 0.8, 0.25];
const ORANGE: V3 = [1, 0.45, 0.1];
const RED: V3 = [0.72, 0.16, 0.06];
const DEEP: V3 = [0.4, 0.1, 0.06];
const SOOT: V3 = [0.2, 0.17, 0.18];
const GREY: V3 = [0.4, 0.37, 0.39];
const PALE: V3 = [0.64, 0.61, 0.64];
/** The glow a hot cell adds over itself. */
export const HOT = rgbOf(1, 0.816, 0.376);

/** A bang's colour in 8 hard steps: white-hot, yellow, orange, red, deep red. */
export const BANG_RAMP: readonly number[] = Array.from({ length: 9 }, (_, i) => {
  const f = i / 8;
  return rgbOf(
    ...(f < 0.5 ? ramp3(WHITE, YELLOW, ORANGE, f * 2) : ramp3(ORANGE, RED, DEEP, f * 2 - 1)),
  );
});
/** A fire cell's colour in 12 hard steps: the fire ramp in the first third, then soot paling. */
export const FIRE_RAMP: readonly number[] = Array.from({ length: 13 }, (_, i) => {
  const x = i / 12;
  if (x >= 0.3) return rgbOf(...ramp3(SOOT, GREY, PALE, (x - 0.3) / 0.7));
  const f = x / 0.3;
  return rgbOf(
    ...(f < 0.5 ? ramp3(WHITE, YELLOW, ORANGE, f * 2) : ramp3(ORANGE, RED, SOOT, f * 2 - 1)),
  );
});

/** Time in `n` hard steps, each cell on its own clock (`th` is the cell's own offset, 0 to 1). */
const stepT = (t: number, th: number, n: number): number => Math.min(1, Math.floor(t * n + th) / n);

export class Cells {
  n = 0;
  readonly rings: Ring[] = [];
  /** Leaves that came to rest this tick, as x, y, colour triples; whoever paints them empties it. */
  readonly landed: number[] = [];
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly z: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly th: Float32Array;
  private readonly rgb: Uint32Array;
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
    this.rgb = new Uint32Array(cap);
    this.kind = new Uint8Array(cap);
  }

  /** Let go one cell. When full, one of the cells already burning is replaced. */
  add(
    kind: CKind,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    rgb = 0,
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
    this.rgb[i] = rgb;
    this.kind[i] = kind;
  }

  /**
   * A whirlpool at (x, y): every cell within R is carried round it and in towards it, `k` art px a
   * second at the rim and faster nearer the middle. It moves the cells themselves, so it works on
   * fire, smoke and leaves alike, whatever their own air is doing.
   */
  swirl(x: number, y: number, R: number, k: number, dt: number): void {
    for (let i = 0; i < this.n; i++) {
      const dx = x - this.x[i]!;
      const dy = y - this.y[i]!;
      if (Math.abs(dx) > R || Math.abs(dy) > R) continue;
      const d = Math.hypot(dx, dy);
      if (d > R || d < 1.5) continue;
      const s = (k * (0.4 + 1.6 * (1 - d / R)) * dt) / d;
      this.x[i] = this.x[i]! + (dx * 0.7 - dy) * s;
      this.y[i] = this.y[i]! + (dy * 0.7 + dx) * s;
    }
  }

  /** Set a ring of air turning. */
  ring(r: Omit<Ring, 'max'>): void {
    if (this.rings.length >= 12) this.rings.shift();
    this.rings.push({ ...r, max: r.life });
  }

  count(kind: CKind): number {
    let c = 0;
    for (let i = 0; i < this.n; i++) if (this.kind[i] === kind) c++;
    return c;
  }

  /** Where the air is going at a point: the sum of every ring's roll there. */
  air(px: number, py: number, pz: number, out: [number, number, number]): void {
    let ax = 0;
    let ay = 0;
    let az = 0;
    for (const g of this.rings) {
      const dx = px - g.x;
      const dy = py - g.y;
      const reach = g.R + g.r * 3;
      if (dx > reach || dx < -reach || dy > reach || dy < -reach) continue;
      const rho = Math.hypot(dx, dy);
      const dr = rho - g.R;
      const dh = pz - g.z;
      const d = Math.hypot(dr, dh) + 0.001;
      const q = d / g.r;
      // fastest at the roll's own radius, falling off inside and outside it
      const fall = 2 / (1 + q * q);
      const s = (g.spin * q * fall * g.life) / g.max / d;
      const out2 = s * dh;
      if (rho > 0.01) {
        ax += (out2 * dx) / rho;
        ay += (out2 * dy) / rho;
      }
      // the whole roll is climbing: what is in it climbs with it
      az += -s * dr + g.vz * fall * 0.5;
    }
    out[0] = ax;
    out[1] = ay;
    out[2] = az;
  }

  /** One tick: the rings climb and die away, every cell is carried, ages and burns out. */
  step(dt: number): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const g = this.rings[i]!;
      g.life -= dt;
      if (g.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      g.z += g.vz * dt;
      g.vz *= Math.exp(-1.1 * dt);
      g.R += g.grow * dt;
      g.grow *= Math.exp(-1.6 * dt);
    }
    const air: [number, number, number] = [0, 0, 0];
    const calm = this.rings.length === 0;
    const drag = Math.exp(-3 * dt);
    const rand = this.rand;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const a = this.age[i]! + dt;
      const life = this.life[i]!;
      if (a >= life) continue;
      const k = this.kind[i]!;
      let x = this.x[i]!;
      let y = this.y[i]!;
      let z = this.z[i]!;
      let vx = this.vx[i]!;
      let vy = this.vy[i]!;
      let vz = this.vz[i]!;
      if (k === CKind.Bang) {
        // thrown too hard for the air to turn it: it brakes, and licks upward
        vx *= drag;
        vy *= drag;
        vz = vz * drag + 70 * dt;
      } else if (k === CKind.Leaf) {
        if (calm) air[0] = air[1] = air[2] = 0;
        else this.air(x, y, z, air);
        // it brakes hard, takes up the air and the wind, and sinks slowly, swinging as it goes
        const th = this.th[i]!;
        const f = Math.min(1, 3.2 * dt);
        const beat = a * (2.4 + th * 2.6) + th * 40;
        vx += (air[0] + WIND[0] * 0.7 + Math.sin(beat) * 16 - vx) * f;
        vy += (air[1] + WIND[1] * 0.7 + Math.cos(beat * 0.7) * 9 - vy) * f;
        vz += (air[2] * 0.6 - 7 - Math.cos(beat) * 3 - vz) * f;
        if (z + vz * dt <= 0 && a > 0.15) {
          this.landed.push(x + vx * dt, y + vy * dt, shade(this.rgb[i]!, th < 0.5 ? 1 : 0.72));
          continue;
        }
      } else if (k === CKind.Fog) {
        if (calm) air[0] = air[1] = air[2] = 0;
        else this.air(x, y, z, air);
        // it seeks its own height a little above the ground and churns slowly there
        const th = this.th[i]!;
        const f = Math.min(1, 2.5 * dt);
        const roll = a * (0.8 + th) + th * 30;
        vx += (air[0] + WIND[0] * 0.25 + Math.sin(roll) * 5 - vx) * f;
        vy += (air[1] + WIND[1] * 0.25 + Math.cos(roll) * 5 - vy) * f;
        vz += (air[2] + (2 + th * 9 - z) * 1.5 - vz) * f;
      } else {
        if (calm) air[0] = air[1] = air[2] = 0;
        else this.air(x, y, z, air);
        // weightless: it takes up the air's speed, lifts on its own heat and jitters
        const t = a / life;
        const fire = k === CKind.Fire;
        const f = Math.min(1, (fire ? 11 : 8) * dt);
        const lean = fire ? 0.15 + t * 0.5 : 0.3 + t * 1.1;
        const j = fire ? 7 : 5;
        vx += (air[0] + WIND[0] * lean - vx) * f + (rand() - 0.5) * j;
        vy += (air[1] + WIND[1] * lean - vy) * f + (rand() - 0.5) * j;
        vz += (air[2] + (fire ? 16 : 20 * (1 - t * 0.6)) - vz) * f + (rand() - 0.5) * j * 0.6;
      }
      x += vx * dt;
      y += vy * dt;
      z += vz * dt;
      if (z < 0) {
        // the ground: what was going down spreads along it
        z = 0;
        vz = 0;
      }
      this.x[w] = x;
      this.y[w] = y;
      this.z[w] = z;
      this.vx[w] = vx;
      this.vy[w] = vy;
      this.vz[w] = vz;
      this.age[w] = a;
      this.life[w] = life;
      this.th[w] = this.th[i]!;
      this.rgb[w] = this.rgb[i]!;
      this.kind[w] = k;
      w++;
    }
    this.n = w;
    if (this.next >= w) this.next = 0;
  }

  /**
   * Draw every cell, one art pixel each: smoke and soot first, fire over them, and a hard
   * additive cell on each of the hottest. `seen` culls what is off screen.
   */
  draw(normal: Put, glow: Put, seen: (x: number, y: number, z: number) => boolean): void {
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < this.n; i++) {
        const k = this.kind[i]!;
        const t = this.age[i]! / this.life[i]!;
        const th = this.th[i]!;
        const x = this.x[i]!;
        const y = this.y[i]!;
        const z = this.z[i]!;
        if (k === CKind.Leaf) {
          if (pass !== 0 || !seen(x, y, z)) continue;
          // tumbling: it shows its light face and its dark face in turn, on its own beat
          const face = (Math.floor(this.age[i]! * (5 + th * 5)) + (th < 0.5 ? 0 : 1)) & 1;
          const c = this.rgb[i]!;
          normal(x, y, z, 1, face ? shade(c, 0.72) : c, 1, Shape.Rect);
        } else if (k === CKind.Wisp) {
          if (pass !== 0) continue;
          if (th >= Math.min(1, t * 8 + 0.4) * (t < 0.25 ? 1 : (1 - t) / 0.75)) continue;
          if (!seen(x, y, z)) continue;
          const s = stepT(t, th, 6);
          const c = this.rgb[i]!;
          // fresh smoke is thick: two cells across until it starts to thin
          normal(
            x,
            y,
            z,
            t < 0.35 ? 2 : 1,
            shade(c, s < 0.34 ? 0.55 : s < 0.67 ? 1 : 1.45),
            1,
            Shape.Rect,
          );
        } else if (k === CKind.Fog) {
          if (pass !== 0) continue;
          // thick from the start, thinning out cell by cell in its last fifth
          if (t > 0.8 && th < (t - 0.8) / 0.2) continue;
          if (!seen(x, y, z)) continue;
          const s = stepT(t, th, 4);
          normal(x, y, z, t < 0.85 ? 2 : 1, shade(this.rgb[i]!, 0.8 + s * 0.35), 1, Shape.Rect);
        } else if (k === CKind.Fire) {
          const s = stepT(t, th, 12);
          const hot = s < 0.3;
          if (hot !== (pass === 1)) continue;
          if (th >= (t < 0.45 ? 1 : (1 - t) / 0.55)) continue;
          if (!seen(x, y, z)) continue;
          normal(x, y, z, 1, FIRE_RAMP[Math.round(s * 12)]!, 1, Shape.Rect);
          if (s < 0.16) glow(x, y, z, 1, HOT, 0.2, Shape.Rect);
        } else {
          if (pass !== 1) continue;
          if (th >= (t < 0.7 ? 1 : (1 - t) / 0.3)) continue;
          if (!seen(x, y, z)) continue;
          const f = stepT(Math.max(0, t - 0.3) / 0.7, th, 8);
          normal(x, y, z, 1, BANG_RAMP[Math.round(f * 8)]!, 1, Shape.Rect);
          if (f < 0.5) glow(x, y, z, 1, HOT, 0.14, Shape.Rect);
        }
      }
  }

  clear(): void {
    this.n = 0;
    this.rings.length = 0;
    this.landed.length = 0;
  }
}
