import { DEFAULT_TUNING, type Tuning, type VenueManifest } from '@demodogs/shared';
import type { LeapPiece } from './leaps';
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
  /**
   * Raised road (null where a venue has none), four values to each point of the grid: how far
   * inside the platform's side the point is (in side widths: 1 and more on the top, 0 and less
   * past the foot), how high the road stands there, how high the on-ramp's lane beside it has
   * climbed, and how wide that lane is (in side widths). They are kept apart and not as one
   * height because each runs smoothly across the grid, where the height they add up to has a
   * sharp lip and foot: read between the grid's points and shaped after (`raisedOf`), a side is
   * a clean wall whichever way it runs, not a row of steps the size of the grid.
   */
  plat: Float32Array | null = null;
  /**
   * Where an on-ramp beside raised road lies, a byte to each point of the grid (null: none): 2 on
   * the lane itself, 1 on the ground hard by it that must stay clear.
   */
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
      (a - H[k + 1]! - H[k1]! + H[k1 + 1]!) * tx * ty +
      (this.plat ? this.raisedOf(k, tx, ty) : 0);
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

  /** Whether (x, y) is on, or hard by, an on-ramp beside raised road. */
  slipAt(x: number, y: number): boolean {
    return this.slipOf(x, y) > 0;
  }

  /** Whether (x, y) is on the lane of an on-ramp itself. */
  laneAt(x: number, y: number): boolean {
    return this.slipOf(x, y) === 2;
  }

  private slipOf(x: number, y: number): number {
    const S = this.slip;
    if (!S) return 0;
    const gx = Math.min(this.gw - 1, Math.max(0, Math.round(x / Relief.CELL)));
    const gy = Math.min(this.gh - 1, Math.max(0, Math.round(y / Relief.CELL)));
    return S[gy * this.gw + gx]!;
  }

  /** How much of the ground's height at (x, y) is raised road: its platform, ramps and sides. */
  platAt(x: number, y: number): number {
    if (!this.plat) return 0;
    const C = Relief.CELL;
    const fx = Math.min(this.gw - 1, Math.max(0, x / C));
    const fy = Math.min(this.gh - 1, Math.max(0, y / C));
    const xi = Math.min(this.gw - 2, Math.floor(fx));
    const yi = Math.min(this.gh - 2, Math.floor(fy));
    return this.raisedOf(yi * this.gw + xi, fx - xi, fy - yi);
  }

  /** The raised road's height in the cell whose first point is `k`, `tx`, `ty` of the way across. */
  private raisedOf(k: number, tx: number, ty: number): number {
    const P = this.plat!;
    const a = k * 4;
    const b = a + 4;
    const c = a + this.gw * 4;
    const d = c + 4;
    const w0 = (1 - tx) * (1 - ty);
    const w1 = tx * (1 - ty);
    const w2 = (1 - tx) * ty;
    const w3 = tx * ty;
    const top = P[a + 1]! * w0 + P[b + 1]! * w1 + P[c + 1]! * w2 + P[d + 1]! * w3;
    if (top <= 0) return 0;
    const s = P[a]! * w0 + P[b]! * w1 + P[c]! * w2 + P[d]! * w3;
    const lane = P[a + 2]! * w0 + P[b + 2]! * w1 + P[c + 2]! * w2 + P[d + 2]! * w3;
    const wide = P[a + 3]! * w0 + P[b + 3]! * w1 + P[c + 3]! * w2 + P[d + 3]! * w3;
    return lane * clamp01(s + wide) + (top - lane) * clamp01(s);
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

/**
 * A venue's relief; banks rise in the infield too unless `infield` is false, and outside the loop
 * unless `outfield` is.
 */
type Spec = Omit<NonNullable<VenueManifest['relief']>, 'infield' | 'outfield'> & {
  infield?: boolean;
  outfield?: boolean;
};
type Raised = NonNullable<NonNullable<VenueManifest['track']>['raised']>[number];

/** A venue with raised road and no `relief` of its own gets this: flat but for the platforms. */
export const FLAT_RELIEF: Spec = { hills: 0, wave: 520, banks: 0, from: 60, spread: 150, step: 8 };

/** Where each row `y` of a grid crosses the road's loop, west to east: inside it between pairs. */
function loopCrossings(track: Track, y: number): number[] {
  const out: number[] = [];
  const N = track.n;
  for (let i = 0, j = N - 1; i < N; j = i, i += 1) {
    const yi = track.y[i]!;
    const yj = track.y[j]!;
    if (yi > y !== yj > y)
      out.push(((track.x[j]! - track.x[i]!) * (y - yi)) / (yj - yi) + track.x[i]!);
  }
  return out.sort((p, q) => p - q);
}

/**
 * How far a platform reaches past the road's edge before its side begins (the road is given room:
 * a car that runs wide is still on the top), and how far through the side is (px).
 */
export const SHOULDER = 30;
const SIDE = 9;
/** How far in from a platform's edge its rail runs (px). */
export const RAIL_IN = 7;
/** A raised stretch climbs one px in this many unless it says how long its ramps are. */
const RAMP = 5;
/** How far an on-ramp runs level beside the road at its top, narrowing, for a car to move over (px). */
const MERGE = 72;

/**
 * Ways back up: a platform's sides are walls, so every so far along one (px) an on-ramp runs
 * beside it on each side, the way a slip road joins a highway: a lane that starts on the ground,
 * climbs in the road's own direction and comes level with the road, where it narrows into it
 * (the `lane` numbers of shared/tuning.ts: how far apart, how wide, and how many px along for
 * each px up).
 */
export type Lanes = Pick<Tuning, 'laneGap' | 'laneWide' | 'laneRun'>;

/** The on-ramps beside a track: see `lanesOf`. */
export interface OnRamps {
  /** At each sample, how far up to the road the lanes beside it have climbed (0 to 1). */
  rise: Float32Array;
  /** How wide the lane on the left of the road (side -1) and on its right (+1) is there (px; 0: none). */
  left: Float32Array;
  right: Float32Array;
}

/** How wide the lane beside sample `i` on `side` (-1 left, 1 right) is. */
export const laneWide = (L: OnRamps, i: number, side: number): number =>
  (side < 0 ? L.left : L.right)[i]!;

/**
 * The on-ramps beside the track, given `liftsOf`'s heights. A lane lies on a side of the road
 * only where the road (`road` wide) does not bend towards that side too tightly for it, and
 * where the stretch has not said it wants none there (`edges`: see `edgesOf`).
 */
export function lanesOf(
  track: Track,
  lift: Float32Array,
  road: number,
  S: Lanes = DEFAULT_TUNING,
  edges: Uint8Array | null = null,
): OnRamps {
  const N = track.n;
  const out = road / 2 + SHOULDER + S.laneWide + SIDE;
  const L: OnRamps = {
    rise: new Float32Array(N),
    left: new Float32Array(N),
    right: new Float32Array(N),
  };
  // each run of road at its full height (level: its end ramps are not part of it)
  const level = (i: number): boolean =>
    lift[i]! > 0 && lift[i] === lift[(i + 1) % N] && lift[i] === lift[(i - 1 + N) % N];
  // how sharply the road turns at a sample, towards its right (+) or left (-), as 1 / radius
  const bend = (i: number): number => {
    let d = track.a[(i + 4) % N]! - track.a[(i - 4 + N) % N]!;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return d / (8 * track.step);
  };
  let start = 0;
  while (start < N && level(start)) start++;
  if (start === N) start = 0;
  const merge = Math.max(2, Math.round(MERGE / track.step));
  for (let k = 0; k < N;) {
    const i0 = (start + k) % N;
    if (!level(i0)) {
      k++;
      continue;
    }
    let len = 0;
    while (len < N && level((i0 + len) % N)) len++;
    const climb = Math.max(2, Math.round((lift[i0]! * S.laneRun) / track.step));
    const whole = climb + merge;
    // spread evenly: one in the middle of a short run, more as it gets longer
    const n =
      len >= whole + 4
        ? Math.max(1, Math.min(Math.floor(len / whole), Math.round((len * track.step) / S.laneGap)))
        : 0;
    // which sides a lane starting `from` samples into the run has room on
    const room = (from: number, side: number): boolean => {
      if (edges && edges[(i0 + from) % N]! & (side < 0 ? EDGING.noLeft : EDGING.noRight))
        return false;
      for (let q = 0; q < whole; q += 2)
        if (bend((i0 + from + q) % N) * side * out > 0.55) return false;
      return true;
    };
    for (let j = 0; j < n; j++) {
      const lo = Math.max(2, Math.floor((j * len) / n));
      const hi = Math.min(len - whole - 2, Math.floor(((j + 1) * len) / n) - whole);
      const want = Math.max(lo, Math.min(hi, Math.floor(((j + 0.5) * len) / n - whole / 2)));
      // as near the middle of its share of the run as there is room on both sides, else on one
      let from = -1;
      let both = false;
      for (let d = 0; d <= hi - lo && !both; d += 2)
        for (const f of d ? [want - d, want + d] : [want]) {
          if (f < lo || f > hi) continue;
          const l = room(f, -1);
          const r = room(f, 1);
          if (l && r) {
            from = f;
            both = true;
            break;
          }
          if ((l || r) && from < 0) from = f;
        }
      if (from < 0) continue;
      const l = room(from, -1);
      const r = room(from, 1);
      for (let q = 0; q < whole; q++) {
        const i = (i0 + from + q) % N;
        const wide = q < climb ? S.laneWide : (S.laneWide * (whole - q)) / merge;
        L.rise[i] = q < climb ? q / climb : 1;
        if (l) L.left[i] = wide;
        if (r) L.right[i] = wide;
      }
    }
    k += len;
  }
  return L;
}

/** A grid of raised road with none on it yet: every point `far` outside a side, nothing high. */
function platOf(R: Relief, far: number): Float32Array {
  const P = new Float32Array(R.gw * R.gh * 4);
  for (let k = 0; k < P.length; k += 4) P[k] = far;
  return P;
}

/** How high the road stands at each sample of the track, for its raised stretches. */
export function liftsOf(track: Track, raised: readonly Raised[]): Float32Array {
  const N = track.n;
  const out = new Float32Array(N);
  for (const r of raised) {
    const i0 = Math.min(N - 1, Math.floor(r.from * N));
    const len = ((Math.min(N - 1, Math.floor(r.to * N)) - i0 + N) % N) + 1;
    if (r.levels?.length || r.rampIn !== undefined || r.rampOut !== undefined) {
      stepped(track, r, i0, len, out);
      continue;
    }
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
 * Where a raised stretch changes level: how many samples into it (`len` long, from sample `i0`)
 * each of its `levels` begins, in order, and how high the road stands from there. Ones that are
 * not inside the stretch are left out.
 */
export function levelsOf(
  r: Raised,
  i0: number,
  len: number,
  N: number,
): { at: number; height: number }[] {
  return (r.levels ?? [])
    .map((l) => ({ at: (Math.min(N - 1, Math.floor(l.at * N)) - i0 + N) % N, height: l.height }))
    .filter((l) => l.at > 0 && l.at < len - 1)
    .sort((a, b) => a.at - b.at);
}

/**
 * A raised stretch with levels, or with a slope of its own at each end: the road climbs to its
 * first level over `rampIn`, goes from each level to the next up or down a slope about the place
 * where they meet, and comes down from its last over `rampOut`. Where there is not the room for
 * all of a slope it is as long as there is room for.
 */
function stepped(track: Track, r: Raised, i0: number, len: number, out: Float32Array): void {
  const N = track.n;
  const cuts = levelsOf(r, i0, len, N);
  const hs = [r.height, ...cuts.map((c) => c.height)];
  const at = [0, ...cuts.map((c) => c.at), len];
  const m = cuts.length;
  // how much of each section the slope at its start wants, and the one at its end (samples)
  const head: number[] = [];
  const tail: number[] = [];
  for (let j = 0; j <= m; j++) {
    head.push(
      j === 0
        ? (r.rampIn ?? r.ramp ?? hs[0]! * RAMP) / track.step
        : (Math.abs(hs[j]! - hs[j - 1]!) * RAMP) / track.step / 2,
    );
    tail.push(
      j === m
        ? (r.rampOut ?? r.ramp ?? hs[m]! * RAMP) / track.step
        : (Math.abs(hs[j + 1]! - hs[j]!) * RAMP) / track.step / 2,
    );
  }
  // (a section too short for both gives each its share)
  for (let j = 0; j <= m; j++) {
    const room = at[j + 1]! - at[j]!;
    const k = Math.min(1, room / (head[j]! + tail[j]! || 1));
    head[j] = Math.max(0.5, head[j]! * k);
    tail[j] = Math.max(0.5, tail[j]! * k);
  }
  const ease = (t: number): number => {
    const c = clamp01(t);
    return c * c * (3 - 2 * c);
  };
  for (let k = 0; k < len; k++) {
    let v = hs[0]!;
    for (let j = 1; j <= m; j++) {
      // (a slope between two levels is as long either side of where they meet)
      const half = Math.min(tail[j - 1]!, head[j]!);
      v += (hs[j]! - hs[j - 1]!) * ease((k - at[j]! + half) / (2 * half));
    }
    const i = (i0 + k) % N;
    out[i] = Math.max(out[i]!, v * ease((k + 1) / head[0]!) * ease((len - k) / tail[m]!));
  }
}

/** What a raised stretch says of its edges, a byte to each sample of the road: these added up. */
export const EDGING = { noLeft: 1, noRight: 2, wall: 4, open: 8 } as const;

/**
 * What stands along the edges of the raised road at each sample, and which sides an on-ramp may
 * lie on there (`EDGING`); null when every stretch is the usual: railed, a ramp on either side.
 */
export function edgesOf(track: Track, raised: readonly Raised[]): Uint8Array | null {
  if (!raised.some((r) => r.edge || r.lanes)) return null;
  const N = track.n;
  const out = new Uint8Array(N);
  for (const r of raised) {
    const i0 = Math.min(N - 1, Math.floor(r.from * N));
    const len = ((Math.min(N - 1, Math.floor(r.to * N)) - i0 + N) % N) + 1;
    const lanes = r.edge === 'wall' ? 'none' : (r.lanes ?? 'both');
    const bits =
      (lanes === 'none' || lanes === 'right' ? EDGING.noLeft : 0) |
      (lanes === 'none' || lanes === 'left' ? EDGING.noRight : 0) |
      (r.edge === 'wall' ? EDGING.wall : r.edge === 'open' ? EDGING.open : 0);
    for (let k = 0; k < len; k++) out[(i0 + k) % N] = bits;
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
  lanes: Lanes = DEFAULT_TUNING,
  leaps: readonly LeapPiece[] = [],
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
  const lane = lift ? lanesOf(track!, lift, road, lanes, edgesOf(track!, raised)) : null;
  // (the on-ramps reach further out than the banks may)
  if (lift) reach = Math.max(reach, half + SHOULDER + lanes.laneWide + SIDE + 24);
  if (track) {
    const rc = Math.ceil(reach / C);
    for (let i = 0; i < track.n; i += 2) {
      const cx = Math.round(track.x[i]! / C);
      const cy = Math.round(track.y[i]! / C);
      const tx = track.x[i]!;
      const ty = track.y[i]!;
      const gx0 = Math.max(0, cx - rc);
      const gx1 = Math.min(R.gw - 1, cx + rc);
      const gy1 = Math.min(R.gh - 1, cy + rc);
      for (let gy = Math.max(0, cy - rc); gy <= gy1; gy++) {
        const dy = gy * C - ty;
        for (let gx = gx0; gx <= gx1; gx++) {
          // (a square root and not `Math.hypot`: see DistanceGrid)
          const dx = gx * C - tx;
          const d = Math.sqrt(dx * dx + dy * dy);
          const k = gy * R.gw + gx;
          if (d < dist[k]!) {
            dist[k] = d;
            if (near) near[k] = i;
          }
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
  for (let gy = 0; gy < R.gh; gy++) {
    // (the loop's edges along this row, when the banks keep out of the infield)
    const cross =
      (spec.infield === false || spec.outfield === false) && track && !oval
        ? loopCrossings(track, gy * C)
        : null;
    let ci = 0;
    for (let gx = 0; gx < R.gw; gx++) {
      const x = gx * C;
      const y = gy * C;
      const k = gy * R.gw + gx;
      if (cross) while (ci < cross.length && cross[ci]! < x) ci++;
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
        // the platform: the road's own height out to its shoulder, then down a steep side;
        // and beside it, where there is one, the lane of an on-ramp at the height it has climbed to
        // (read between the samples either side of it, by how far along the road it lies: taken
        // from the nearest sample alone a ramp is a flight of steps, and its light a lattice)
        const i = near![k]!;
        const N = track!.n;
        const ca = Math.cos(track!.a[i]!);
        const sa = Math.sin(track!.a[i]!);
        const st = track!.step;
        const along = Math.max(
          -st,
          Math.min(st, (x - track!.x[i]!) * ca + (y - track!.y[i]!) * sa),
        );
        const j = (i + (along < 0 ? N - 1 : 1)) % N;
        const f = Math.abs(along) / st;
        const top = lift[i]! + (lift[j]! - lift[i]!) * f;
        const edge = half + SHOULDER;
        const s = (edge + SIDE - dist[k]!) / SIDE;
        // (which side of the road this point is on says which lane it may be part of)
        const side = (y - track!.y[i]!) * ca - (x - track!.x[i]!) * sa < 0 ? -1 : 1;
        // (a lane's width and climb between samples too, where it runs past both of them)
        const wi = laneWide(lane!, i, side);
        const wj = laneWide(lane!, j, side);
        const both = wi > 0 && wj > 0;
        const wide = both ? wi + (wj - wi) * f : wi;
        const rise = both ? lane!.rise[i]! + (lane!.rise[j]! - lane!.rise[i]!) * f : lane!.rise[i]!;
        const low = wide > 0 ? top * rise : 0;
        if (wide > 0 && dist[k]! > half - 6 && dist[k]! < edge + wide + SIDE + 12)
          (R.slip ??= new Uint8Array(R.gw * R.gh))[k] =
            dist[k]! > edge - 4 && dist[k]! < edge + wide + 2 ? 2 : 1;
        const P = (R.plat ??= platOf(R, (edge + SIDE - reach) / SIDE));
        P[k * 4] = s;
        P[k * 4 + 1] = top;
        P[k * 4 + 2] = low;
        P[k * 4 + 3] = wide / SIDE;
        const v = R.hills[k]! + low * clamp01(s + wide / SIDE) + (top - low) * clamp01(s);
        if (v > max) max = v;
      }
      if (steps > 0) {
        // banks: how far past the road (or the bowl's wall), roughened
        let d: number;
        if (oval) {
          const q = Math.hypot((x - oval.cx) / oval.rx, (y - oval.cy) / oval.ry);
          d = (q - 1) * Math.min(oval.rx, oval.ry) - spec.from;
        } else d = dist[k]! - half - spec.from;
        if (cross && (ci % 2 === 1 ? spec.infield === false : spec.outfield === false)) d = 0;
        if (d > 0) {
          const rough = (noise(x / 150, y / 150, seed + 103) - 0.5) * 0.7 * Math.min(1, d / 40);
          R.bank[k] = clamp01(d / spec.spread + rough) * steps;
        }
      }
    }
  }
  max = Math.max(max, layLeaps(R, leaps, (half + SHOULDER + SIDE - reach) / SIDE));
  R.max = max + steps * spec.step;
  return R;
}

/**
 * Jump pieces, laid in the same grid as raised road (where both reach a point, the higher wins):
 * each a block `long` along its turn and `wide` across, square at its ends, level across and
 * sheer at its sides; a takeoff climbs from nothing at its back to its height at its front, where
 * it drops sheer, and a landing the other way about. The highest any stands.
 */
function layLeaps(R: Relief, leaps: readonly LeapPiece[], far: number): number {
  if (!leaps.length) return 0;
  const C = Relief.CELL;
  const P = (R.plat ??= platOf(R, far));
  let max = 0;
  for (const p of leaps) {
    const L = p.def.long / 2;
    const W = p.def.wide / 2;
    const cs = Math.cos(p.rot);
    const sn = Math.sin(p.rot);
    // (a landing is a takeoff turned about: along it from its tall end)
    const dir = p.def.way === 'up' ? 1 : -1;
    const rc = Math.ceil((Math.hypot(L, W) + SIDE * 2) / C);
    const gx0 = Math.max(0, Math.round(p.x / C) - rc);
    const gx1 = Math.min(R.gw - 1, Math.round(p.x / C) + rc);
    const gy0 = Math.max(0, Math.round(p.y / C) - rc);
    const gy1 = Math.min(R.gh - 1, Math.round(p.y / C) + rc);
    for (let gy = gy0; gy <= gy1; gy++)
      for (let gx = gx0; gx <= gx1; gx++) {
        const dx = gx * C - p.x;
        const dy = gy * C - p.y;
        const u = (dx * cs + dy * sn) * dir;
        const v = -dx * sn + dy * cs;
        // how far inside the sides and the tall end (the low end meets the ground: no edge)
        const e = Math.min(W - Math.abs(v), L - u);
        if (e < -SIDE * 2 || u < -L - SIDE * 2) continue;
        const s = (e + SIDE) / SIDE;
        const top = p.def.high * clamp01((u + L) / (2 * L));
        const k = gy * R.gw + gx;
        const had =
          P[k * 4 + 1]! * clamp01(P[k * 4]!) + P[k * 4 + 2]! * clamp01(P[k * 4]! + P[k * 4 + 3]!);
        const h = top * clamp01(s);
        if (h < had || (h === had && s <= P[k * 4]!)) continue;
        P[k * 4] = s;
        P[k * 4 + 1] = top;
        P[k * 4 + 2] = 0;
        P[k * 4 + 3] = 0;
        if (R.hills[k]! + h > max) max = R.hills[k]! + h;
      }
  }
  return max;
}
