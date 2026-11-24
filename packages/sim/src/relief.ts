import { DEFAULT_TUNING, type Tuning, type VenueManifest } from '@demodogs/shared';
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
  /** Raised road: how much of each point's height is a platform's (null where a venue has none). */
  plat: Float32Array | null = null;
  /** Where a way up the side of raised road lies, a byte to each point of the grid (null: none). */
  slip: Uint8Array | null = null;
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

  /** Whether (x, y) is on, or at the head or foot of, a way up the side of raised road. */
  slipAt(x: number, y: number): boolean {
    const S = this.slip;
    if (!S) return false;
    const gx = Math.min(this.gw - 1, Math.max(0, Math.round(x / Relief.CELL)));
    const gy = Math.min(this.gh - 1, Math.max(0, Math.round(y / Relief.CELL)));
    return S[gy * this.gw + gx] === 1;
  }

  /** How much of the ground's height at (x, y) is raised road: its platform, ramps and sides. */
  platAt(x: number, y: number): number {
    const P = this.plat;
    if (!P) return 0;
    const C = Relief.CELL;
    const fx = Math.min(this.gw - 1, Math.max(0, x / C));
    const fy = Math.min(this.gh - 1, Math.max(0, y / C));
    const xi = Math.min(this.gw - 2, Math.floor(fx));
    const yi = Math.min(this.gh - 2, Math.floor(fy));
    const tx = fx - xi;
    const ty = fy - yi;
    const k = yi * this.gw + xi;
    const k1 = k + this.gw;
    const a = P[k]!;
    return (
      a + (P[k + 1]! - a) * tx + (P[k1]! - a) * ty + (a - P[k + 1]! - P[k1]! + P[k1 + 1]!) * tx * ty
    );
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

/** How far through a terrace's face is, foot to lip (px). */
const FACE = 5;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

type Spec = NonNullable<VenueManifest['relief']>;
type Raised = NonNullable<NonNullable<VenueManifest['track']>['raised']>[number];

/** A venue with raised road and no `relief` of its own gets this: flat but for the platforms. */
export const FLAT_RELIEF: Spec = { hills: 0, wave: 520, banks: 0, from: 60, spread: 150, step: 8 };

/** How far a platform reaches past the road's edge before its side begins, and how far through the side is (px). */
const SHOULDER = 14;
const SIDE = 9;
/** A raised stretch climbs one px in this many unless it says how long its ramps are. */
const RAMP = 5;

/**
 * Ways back up: a platform's sides are walls, so every so far along one (px) a stretch of each
 * side this wide is a slope instead, for a car that went over the edge (the `slip` numbers of
 * shared/tuning.ts: how far apart, how wide, and how many px along for each px up).
 */
export type Slips = Pick<Tuning, 'slipGap' | 'slipWide' | 'slipRun'>;

/** Which samples of the track have a way up the side beside them (1), given `liftsOf`'s heights. */
export function slipsOf(track: Track, lift: Float32Array, S: Slips = DEFAULT_TUNING): Uint8Array {
  const N = track.n;
  const out = new Uint8Array(N);
  const wide = Math.max(2, Math.round(S.slipWide / track.step));
  // each run of road at its full height (level: its end ramps are not part of it)
  const level = (i: number): boolean =>
    lift[i]! > 0 && lift[i] === lift[(i + 1) % N] && lift[i] === lift[(i - 1 + N) % N];
  let start = 0;
  while (start < N && level(start)) start++;
  if (start === N) start = 0;
  for (let k = 0; k < N;) {
    const i0 = (start + k) % N;
    if (!level(i0)) {
      k++;
      continue;
    }
    let len = 0;
    while (len < N && level((i0 + len) % N)) len++;
    // spread evenly: one in the middle of a short run, more as it gets longer
    const n = len >= wide + 4 ? Math.max(1, Math.round((len * track.step) / S.slipGap)) : 0;
    for (let j = 0; j < n; j++) {
      const mid = Math.floor(((j + 0.5) * len) / n);
      for (let q = -(wide >> 1); q <= wide >> 1; q++)
        if (mid + q >= 0 && mid + q < len) out[(i0 + mid + q) % N] = 1;
    }
    k += len;
  }
  return out;
}

/** How high the road stands at each sample of the track, for its raised stretches. */
export function liftsOf(track: Track, raised: readonly Raised[]): Float32Array {
  const N = track.n;
  const out = new Float32Array(N);
  for (const r of raised) {
    const i0 = Math.min(N - 1, Math.floor(r.from * N));
    const len = ((Math.min(N - 1, Math.floor(r.to * N)) - i0 + N) % N) + 1;
    // the ramps: as long as asked, but never more than half the stretch between them
    const ramp = Math.max(1, Math.min(len / 2, (r.ramp ?? r.height * RAMP) / track.step));
    for (let k = 0; k < len; k++) {
      const t = clamp01(Math.min(k + 1, len - k) / ramp);
      const i = (i0 + k) % N;
      out[i] = Math.max(out[i]!, r.height * t * t * (3 - 2 * t));
    }
  }
  return out;
}

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
  raised: readonly Raised[] = [],
  slips: Slips = DEFAULT_TUNING,
): Relief {
  const R = new Relief(w, h);
  const C = Relief.CELL;
  const half = road / 2;
  // how far each point of the grid is from the road, out to where the banks stop rising
  let reach = half + spec.from + spec.spread + 40;
  const dist = new Float32Array(R.gw * R.gh).fill(reach);
  // raised stretches: how high the road stands at each of its samples, and which sample each
  // point of the grid is nearest to
  const lift = track && raised.length ? liftsOf(track, raised) : null;
  const near = lift ? new Int32Array(R.gw * R.gh).fill(-1) : null;
  const slip = lift ? slipsOf(track!, lift, slips) : null;
  // (the ways up the sides reach further out than the banks may)
  if (lift)
    reach = Math.max(
      reach,
      half + SHOULDER + lift.reduce((a, b) => Math.max(a, b), 0) * slips.slipRun + 24,
    );
  if (track) {
    const rc = Math.ceil(reach / C);
    for (let i = 0; i < track.n; i += 2) {
      const cx = Math.round(track.x[i]! / C);
      const cy = Math.round(track.y[i]! / C);
      for (let gy = Math.max(0, cy - rc); gy <= Math.min(R.gh - 1, cy + rc); gy++)
        for (let gx = Math.max(0, cx - rc); gx <= Math.min(R.gw - 1, cx + rc); gx++) {
          const d = Math.hypot(gx * C - track.x[i]!, gy * C - track.y[i]!);
          const k = gy * R.gw + gx;
          if (d < dist[k]!) {
            dist[k] = d;
            if (near) near[k] = i;
          }
        }
    }
  }
  const steps = spec.banks > 0 ? Math.max(1, Math.round(spec.banks / spec.step)) : 0;
  R.step = spec.step;
  R.steps = steps;
  // a face five px through, however wide the terraces are: steep, but with a front to be seen from any side
  R.face = Math.min(1, (FACE * Math.max(1, steps)) / spec.spread);
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
      if (lift && near![k]! >= 0) {
        // the platform: the road's own height out to its shoulder, then down a steep side
        // (or, at a way up, a slope a car can climb)
        const top = lift[near![k]!]!;
        const run = slip![near![k]!] ? Math.max(SIDE, top * slips.slipRun) : SIDE;
        const side = clamp01((half + SHOULDER + run - dist[k]!) / run);
        const up = top * side;
        if (run > SIDE && dist[k]! > half - 6 && dist[k]! < half + SHOULDER + run + 12)
          (R.slip ??= new Uint8Array(R.gw * R.gh))[k] = 1;
        (R.plat ??= new Float32Array(R.gw * R.gh))[k] = up;
        const v = (R.hills[k]! += up);
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
