/**
 * Rubble the way mudders makes it (sim/src/chunks.ts and debris.ts there): something that comes
 * down cracks into a few rigid pieces that keep their own pixels, and the stuff along the cracks
 * goes as loose grit. Pieces fall, tumble, chip and split where they land hard; grit flies, rolls
 * downhill and piles into heaps that stay. Nothing here touches the DOM, so it is all testable;
 * effects.ts turns pieces into strips and draws them.
 */
import { MAX_W, at, type Chip, type Voxels } from './strips';
import { PULL } from './voxels';

/** A piece cut out of a strip: its own voxels, and where its box sits in the source. */
export interface Cut {
  v: Voxels;
  /** The box's middle, art px from the source's middle (x forward, y across), and its bottom. */
  x: number;
  y: number;
  z: number;
  /** How many voxels it holds. */
  count: number;
}

export interface Cracked {
  pieces: Cut[];
  /** What was along the cracks, and pieces too small to keep: loose grit (Chip coordinates). */
  grit: Chip[];
}

/** A pseudo-random 0..1 for a lattice point: the same point always gives the same value. */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise, 0..1, on a lattice one unit apart. */
export function noise2(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * How many pieces a box `len` (art px along, across and up) of stuff that breaks into pieces about
 * `piece` across cracks into, each way; never more than `most` in all.
 */
export function crackPlan(
  len: readonly [number, number, number],
  piece: number,
  most = 12,
): [number, number, number] {
  const k = len.map((l) => Math.max(1, Math.round(l / piece))) as [number, number, number];
  while (k[0] * k[1] * k[2] > most) {
    // fewer cuts the way the pieces are already smallest
    let a = 0;
    for (let i = 1; i < 3; i++)
      if (k[i]! > 1 && (k[a] === 1 || len[i]! / k[i]! < len[a]! / k[a]!)) a = i;
    k[a]!--;
  }
  return k;
}

/** Gathers texels into blocks `size` texels a side, as chips. */
class Grit {
  private readonly cells = new Map<number, [number, number, number, number, number]>();
  constructor(
    private readonly v: Voxels,
    private readonly size: number,
  ) {}
  add(x: number, y: number, z: number, j: number): void {
    const B = this.size;
    const key = (Math.floor(z / B) * 4096 + Math.floor(y / B)) * 4096 + Math.floor(x / B);
    const c = this.cells.get(key);
    if (c) {
      c[0] += x;
      c[1] += y;
      c[2] += z;
      c[3]++;
    } else {
      const px = this.v.px;
      this.cells.set(key, [x, y, z, 1, (px[j]! << 16) | (px[j + 1]! << 8) | px[j + 2]!]);
    }
  }
  chips(): Chip[] {
    const v = this.v;
    const out: Chip[] = [];
    for (const [sx, sy, sz, k, rgb] of this.cells.values())
      out.push({
        x: (sx / k + 0.5 - v.cw / 2) / v.res,
        y: (sy / k + 0.5 - v.ch / 2) / v.res,
        z: sz / k / v.res,
        s: Math.cbrt(k) / v.res,
        rgb,
      });
    return out;
  }
}

/** Empty voxels for a box `cw` by `ch` by `n` texels, wrapped over rows like any strip. */
export function blank(cw: number, ch: number, n: number, res: number): Voxels {
  const cols = Math.max(1, Math.min(n, Math.floor(MAX_W / cw)));
  const W = cw * cols;
  const H = ch * Math.ceil(n / cols);
  return { px: new Uint8ClampedArray(W * H * 4), W, cw, ch, n, res, cols };
}

/**
 * Crack `v` into `k[0]` × `k[1]` × `k[2]` pieces (along x, y and up). The cracks are wavy planes,
 * not straight cuts: each is pushed back and forth by noise over the other two directions, about
 * `jag` of a piece's length, so the pieces have ragged faces that fit back together. Texels within
 * `gap` art px of a crack, and pieces under `keep` voxels, come back as grit in blocks of
 * `gritBlock` texels.
 */
export function crack(
  v: Voxels,
  k: readonly [number, number, number],
  rand: () => number,
  gap = 0.45,
  jag = 0.35,
  keep = 40,
  gritBlock = v.res,
): Cracked {
  const { cw, ch, n, res } = v;
  const len = [cw / res, ch / res, n / res];
  const cuts = k.map((m, a) => {
    const out: number[] = [];
    for (let i = 1; i < m; i++) out.push((len[a]! * (i + (rand() - 0.5) * 0.4)) / m);
    return out;
  });
  const seeds = k.map(() => Math.floor(rand() * 1e6));
  const amp = k.map((m, a) => (len[a]! / m) * jag);
  const [kx, ky] = k as [number, number, number];
  const owner = new Int16Array(cw * ch * n).fill(-1);
  const pieces = kx * ky * k[2];
  const counts = new Int32Array(pieces);
  const box = Array.from({ length: pieces }, () => [cw, ch, n, -1, -1, -1]);
  const grit = new Grit(v, gritBlock);
  const c = [0, 0, 0];
  const idx = [0, 0, 0];
  for (let z = 0; z < n; z++)
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        const j = at(v, x, y, z);
        if (!v.px[j + 3]) continue;
        c[0] = (x + 0.5) / res;
        c[1] = (y + 0.5) / res;
        c[2] = (z + 0.5) / res;
        let near = Infinity;
        for (let a = 0; a < 3; a++) {
          idx[a] = 0;
          const list = cuts[a]!;
          if (!list.length) continue;
          // the crack plane wanders over the other two directions
          const p = c[(a + 1) % 3]! / 2.5;
          const q = c[(a + 2) % 3]! / 2.5;
          const u = c[a]! + (noise2(p, q, seeds[a]!) - 0.5) * 2 * amp[a]!;
          for (const b of list) {
            if (u > b) idx[a]!++;
            near = Math.min(near, Math.abs(u - b));
          }
        }
        if (near < gap / 2) {
          grit.add(x, y, z, j);
          continue;
        }
        const p = idx[0]! + kx * (idx[1]! + ky * idx[2]!);
        owner[(z * ch + y) * cw + x] = p;
        counts[p]!++;
        const b = box[p]!;
        if (x < b[0]!) b[0] = x;
        if (y < b[1]!) b[1] = y;
        if (z < b[2]!) b[2] = z;
        if (x > b[3]!) b[3] = x;
        if (y > b[4]!) b[4] = y;
        if (z > b[5]!) b[5] = z;
      }
  const out: (Cut | null)[] = box.map((b, p) => {
    if (counts[p]! < keep) return null;
    // boxes come in a few sizes, so the room one piece's strip had can be used by another's
    const q = (len: number, step: number) => Math.ceil(len / step) * step;
    const w = q(b[3]! - b[0]! + 1, res * 2);
    const h = q(b[4]! - b[1]! + 1, res * 2);
    const pv = blank(w, h, q(b[5]! - b[2]! + 1, res), res);
    return {
      v: pv,
      x: (b[0]! + w / 2 - cw / 2) / res,
      y: (b[1]! + h / 2 - ch / 2) / res,
      z: b[2]! / res,
      count: counts[p]!,
    };
  });
  for (let z = 0; z < n; z++)
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        const p = owner[(z * ch + y) * cw + x]!;
        if (p < 0) continue;
        const j = at(v, x, y, z);
        const piece = out[p];
        if (!piece) {
          grit.add(x, y, z, j);
          continue;
        }
        const b = box[p]!;
        const t = at(piece.v, x - b[0]!, y - b[1]!, z - b[2]!);
        piece.v.px.set(v.px.subarray(j, j + 4), t);
      }
  return { pieces: out.filter((p): p is Cut => p !== null), grit: grit.chips() };
}

/**
 * Knock up to `max` voxels off the outside of a piece, the ones with the most open sides first
 * (corners and edges go before faces), as grit `block` texels a side. They are gone from `v`.
 */
export function chipEdges(v: Voxels, max: number, rand: () => number, block = v.res): Chip[] {
  const { cw, ch, n } = v;
  const solid = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < cw && y < ch && z < n && v.px[at(v, x, y, z) + 3]! > 0;
  const grit = new Grit(v, block);
  const picked: number[] = [];
  // try random spots, keep the most exposed ones
  for (let tries = 0; tries < max * 6 && picked.length < max * 3; tries++) {
    const x = Math.floor(rand() * cw);
    const y = Math.floor(rand() * ch);
    const z = Math.floor(rand() * n);
    if (!solid(x, y, z)) continue;
    const open =
      +!solid(x - 1, y, z) +
      +!solid(x + 1, y, z) +
      +!solid(x, y - 1, z) +
      +!solid(x, y + 1, z) +
      +!solid(x, y, z + 1);
    if (open >= 2) picked.push(x, y, z);
  }
  const B = block;
  let taken = 0;
  for (let i = 0; i < picked.length && taken < max; i += 3) {
    // a whole block around the spot goes, so a chip is a lump, not a single texel
    const bx = picked[i]! - (picked[i]! % B);
    const by = picked[i + 1]! - (picked[i + 1]! % B);
    const bz = picked[i + 2]! - (picked[i + 2]! % B);
    let any = false;
    for (let z = bz; z < Math.min(n, bz + B); z++)
      for (let y = by; y < Math.min(ch, by + B); y++)
        for (let x = bx; x < Math.min(cw, bx + B); x++) {
          const j = at(v, x, y, z);
          if (!v.px[j + 3]) continue;
          grit.add(x, y, z, j);
          v.px[j + 3] = 0;
          any = true;
        }
    if (any) taken++;
  }
  return grit.chips();
}

/** Grit lying around: a height for every art px of ground it covers. */
export class Heap {
  private readonly h = new Map<number, number>();

  private static key(x: number, y: number): number {
    return (Math.floor(y) + 16384) * 32768 + Math.floor(x) + 16384;
  }

  /** How high the rubble is at (x, y). */
  at(x: number, y: number): number {
    return this.h.get(Heap.key(x, y)) ?? 0;
  }

  /** The highest rubble under a footprint `r` across, centred on (x, y). */
  under(x: number, y: number, r: number): number {
    const d = r * 0.6;
    return Math.max(
      this.at(x, y),
      this.at(x + d, y),
      this.at(x - d, y),
      this.at(x, y + d),
      this.at(x, y - d),
    );
  }

  /** Raise the rubble at (x, y) to at least `to`. */
  raise(x: number, y: number, to: number): void {
    const k = Heap.key(x, y);
    if ((this.h.get(k) ?? 0) < to) this.h.set(k, to);
  }

  private add(x: number, y: number, dh: number): void {
    const k = Heap.key(x, y);
    const v = (this.h.get(k) ?? 0) + dh;
    if (v <= 0.01) this.h.delete(k);
    else this.h.set(k, v);
  }

  /**
   * Lay a grain `s` across at (x, y): like a grain of mudders' debris it rolls downhill while a
   * neighbour is lower by more than its own size (a 45° pile), then sits on top. Returns where.
   */
  lay(x: number, y: number, s: number): [number, number, number] {
    const step = Math.max(1, s);
    for (let r = 0; r < 8; r++) {
      const here = this.at(x, y);
      let bx = 0;
      let by = 0;
      let best = here;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const h = this.at(x + dx * step, y + dy * step);
          if (h < best) {
            best = h;
            bx = dx;
            by = dy;
          }
        }
      if (here - best <= s * 1.1) break;
      x += bx * step;
      y += by * step;
    }
    const z = this.at(x, y);
    // a grain fills its own volume of a one-pixel column, loosely packed
    this.add(x, y, s * s * s * 1.6);
    return [x, y, z];
  }

  /** A grain `s` across taken off the top at (x, y). */
  lift(x: number, y: number, s: number): void {
    this.add(x, y, -s * s * s * 1.6);
  }

  clear(): void {
    this.h.clear();
  }

  get size(): number {
    return this.h.size;
  }
}

/** A rigid piece of something that came down, falling, tumbling and finally lying in the rubble. */
export interface Slab {
  x: number;
  y: number;
  /** Underside of its box. */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: number;
  spin: number;
  /** How far it leans over (radians), towards world angle `dir`; a tumble rocks it back and forth. */
  tilt: number;
  dir: number;
  tumble: number;
  phase: number;
  /** Reach from its middle, and height, art px. */
  r: number;
  tall: number;
  /** It has stopped for good (until something shoves it). */
  still: boolean;
  /** How much of its speed it keeps when it lands. */
  bounce: number;
  /** How many hard landings it has had. */
  hits: number;
  age: number;
}

const GRAVITY = 420;
/** The furthest a piece leans: past this a stack of slices stops looking like one thing. */
export const MAX_TILT = 0.75;
/** Landing faster than this bounces it, chips it and may split it. */
export const HARD = 70;

/**
 * Move a piece on by dt over ground `floor(x, y, r)` high. Returns how fast it hit the ground this
 * step (0 if it did not), so the caller can chip, split and throw dust.
 */
export function stepSlab(
  s: Slab,
  dt: number,
  floor: (x: number, y: number, r: number) => number,
): number {
  if (s.still) return 0;
  s.age += dt;
  s.vz -= GRAVITY * PULL.g * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.z += s.vz * dt;
  s.rot += s.spin * dt;
  // tumbling: it rocks over and back, less as it slows
  s.phase += s.tumble * dt;
  const lean = Math.abs(Math.sin(s.phase)) * MAX_TILT;
  s.tilt += (lean - s.tilt) * Math.min(1, dt * 10);
  const f = floor(s.x, s.y, s.r);
  if (s.z > f) return 0;
  const hit = -s.vz;
  s.z = f;
  if (hit > HARD) {
    s.vz = hit * s.bounce;
    s.vx *= 0.55;
    s.vy *= 0.55;
    s.spin *= 0.5;
    s.tumble *= 0.5;
    s.hits++;
    return hit;
  }
  s.vz = 0;
  const k = Math.max(0, 1 - dt * 7);
  s.vx *= k;
  s.vy *= k;
  s.spin *= k;
  s.tumble *= k;
  if ((Math.hypot(s.vx, s.vy) < 4 && Math.abs(s.spin) < 0.4) || s.age > 8) {
    s.still = true;
    s.vx = s.vy = s.spin = s.tumble = 0;
  }
  return hit > 1 ? hit : 0;
}

/** Where slice `h` art px up a leaning piece is drawn: offset along its lean, and height. */
export function leanAt(s: Slab, h: number): [number, number, number] {
  const off = h * Math.sin(s.tilt);
  return [s.x + Math.cos(s.dir) * off, s.y + Math.sin(s.dir) * off, s.z + h * Math.cos(s.tilt)];
}
