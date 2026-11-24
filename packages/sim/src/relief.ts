import type { VenueManifest } from '@demodogs/shared';
import type { Track } from './track';

/**
 * The lie of the land: how high the ground stands at every point of a venue (art px). Hills roll
 * under everything, the road included, and cars feel their slopes; banks rise in terraces beyond
 * the road (or round a derby bowl), each a sheer face a car cannot climb but can drive off. It is
 * worked out once from the venue's seed, on a grid one value to 4x4 px and read between its points. A venue with no `relief` is flat and has none.
 */
export class Relief {
  static readonly CELL = 8;
  readonly gw: number;
  readonly gh: number;
  /** The hills: a height at every point of the grid. */
  readonly hills: Float32Array;
  /** The banks: how many terraces up each point of the grid is (a fraction: part way to the next). */
  readonly bank: Float32Array;
  /** How high one terrace stands above the last, how many there are, and how much of one is its face. */
  step = 0;
  steps = 0;
  face = 1;
  /** The highest the ground stands anywhere. */
  max = 0;

  constructor(
    readonly w: number,
    readonly ht: number,
  ) {
    this.gw = Math.ceil(w / Relief.CELL) + 1;
    this.gh = Math.ceil(ht / Relief.CELL) + 1;
    this.hills = new Float32Array(this.gw * this.gh);
    this.bank = new Float32Array(this.gw * this.gh);
  }

  /** The height of the ground at (x, y); off the map, that of the nearest edge. */
  at(x: number, y: number): number {
    const C = Relief.CELL;
    const fx = Math.min(this.gw - 1, Math.max(0, x / C));
    const fy = Math.min(this.gh - 1, Math.max(0, y / C));
    const xi = Math.min(this.gw - 2, Math.floor(fx));
    const yi = Math.min(this.gh - 2, Math.floor(fy));
    const tx = fx - xi;
    const ty = fy - yi;
    const k = yi * this.gw + xi;
    const k1 = k + this.gw;
    const H = this.hills;
    const a = H[k]!;
    const v =
      a +
      (H[k + 1]! - a) * tx +
      (H[k1]! - a) * ty +
      (a - H[k + 1]! - H[k1]! + H[k1 + 1]!) * tx * ty;
    if (this.steps === 0) return v;
    const B = this.bank;
    const e = B[k]!;
    const q =
      e +
      (B[k + 1]! - e) * tx +
      (B[k1]! - e) * ty +
      (e - B[k + 1]! - B[k1]! + B[k1 + 1]!) * tx * ty +
      0.5;
    // level terraces, each ending in a sheer face up to the next
    const fl = Math.floor(q);
    const up = (q - fl - (1 - this.face)) / this.face;
    return v + Math.min(this.steps, fl + (up > 0 ? up : 0)) * this.step;
  }

  /** How steeply the ground rises to the east at (x, y): height gained per px. */
  dx(x: number, y: number): number {
    return (this.at(x + 6, y) - this.at(x - 6, y)) / 12;
  }

  /** How steeply the ground rises to the south. */
  dy(x: number, y: number): number {
    return (this.at(x, y + 6) - this.at(x, y - 6)) / 12;
  }

  /** The slope right at (x, y), east and south: sheer at a terrace's face. */
  edge(x: number, y: number): [number, number] {
    return [
      (this.at(x + 2, y) - this.at(x - 2, y)) / 4,
      (this.at(x, y + 2) - this.at(x, y - 2)) / 4,
    ];
  }
}

/** A number from 0 to 1 for a whole-number point, the same on every machine. */
function hash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 974711)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Soft noise, 0 to 1, in blobs about one unit across. */
function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let fx = x - xi;
  let fy = y - yi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

type Spec = NonNullable<VenueManifest['relief']>;

/**
 * Work out a venue's relief. `flat(i)` says where the road must lie level (a flyover, a bridge):
 * the hills are pressed flat round those samples.
 */
export function buildRelief(
  spec: Spec,
  seed: number,
  w: number,
  h: number,
  track: Track | null,
  road: number,
  oval: { cx: number; cy: number; rx: number; ry: number } | null,
): Relief {
  const R = new Relief(w, h);
  const C = Relief.CELL;
  const half = road / 2;
  // how far each point of the grid is from the road, out to where the banks stop rising
  const reach = half + spec.from + spec.spread + 40;
  const dist = new Float32Array(R.gw * R.gh).fill(reach);
  if (track) {
    const rc = Math.ceil(reach / C);
    for (let i = 0; i < track.n; i += 2) {
      const cx = Math.round(track.x[i]! / C);
      const cy = Math.round(track.y[i]! / C);
      for (let gy = Math.max(0, cy - rc); gy <= Math.min(R.gh - 1, cy + rc); gy++)
        for (let gx = Math.max(0, cx - rc); gx <= Math.min(R.gw - 1, cx + rc); gx++) {
          const d = Math.hypot(gx * C - track.x[i]!, gy * C - track.y[i]!);
          const k = gy * R.gw + gx;
          if (d < dist[k]!) dist[k] = d;
        }
    }
  }
  const steps = spec.banks > 0 ? Math.max(1, Math.round(spec.banks / spec.step)) : 0;
  R.step = spec.step;
  R.steps = steps;
  // a face about a px and a half through, however wide the terraces are
  R.face = Math.min(1, (1.5 * Math.max(1, steps)) / spec.spread);
  let max = 0;
  for (let gy = 0; gy < R.gh; gy++)
    for (let gx = 0; gx < R.gw; gx++) {
      const x = gx * C;
      const y = gy * C;
      const k = gy * R.gw + gx;
      // hills: two sizes of soft noise, never below the level of the lowest ground
      if (spec.hills > 0) {
        const n =
          noise(x / spec.wave, y / spec.wave, seed + 101) * 0.7 +
          noise((x / spec.wave) * 2.3, (y / spec.wave) * 2.3, seed + 102) * 0.3;
        const v = spec.hills * clamp01((n - 0.25) * 1.6);
        R.hills[k] = v;
        if (v > max) max = v;
      }
      if (steps > 0) {
        // banks: how far past the road (or the bowl's wall), roughened
        let d: number;
        if (oval) {
          const q = Math.hypot((x - oval.cx) / oval.rx, (y - oval.cy) / oval.ry);
          d = (q - 1) * Math.min(oval.rx, oval.ry) - spec.from;
        } else d = dist[k]! - half - spec.from;
        if (d > 0) {
          const rough = (noise(x / 150, y / 150, seed + 103) - 0.5) * 0.7 * Math.min(1, d / 40);
          R.bank[k] = clamp01(d / spec.spread + rough) * steps;
        }
      }
    }
  R.max = max + steps * spec.step;
  return R;
}
