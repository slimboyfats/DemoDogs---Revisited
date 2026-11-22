/**
 * A race track: a closed Catmull-Rom curve through control points, sampled at an even spacing. The
 * road is everything within half a road width of it. The distance grid answers "how far from the
 * road is this point, and which sample is nearest" in one lookup.
 */
export interface Track {
  x: Float64Array;
  y: Float64Array;
  /** Tangent angle at each sample. */
  a: Float64Array;
  /** Distance along the track at each sample. */
  s: Float64Array;
  n: number;
  len: number;
  step: number;
}

type Pt = readonly [number, number];

function catmull(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): [number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

export function sampleTrack(points: readonly Pt[], step: number): Track {
  const n = points.length;
  const dense: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]!;
    const p1 = points[i]!;
    const p2 = points[(i + 1) % n]!;
    const p3 = points[(i + 2) % n]!;
    for (let k = 0; k < 60; k++) dense.push(catmull(p0, p1, p2, p3, k / 60));
  }
  const xs: number[] = [dense[0]![0]];
  const ys: number[] = [dense[0]![1]];
  let carry = 0;
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1]!;
    const b = dense[i % dense.length]!;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let pos = 0;
    while (carry + seg - pos >= step) {
      pos += step - carry;
      carry = 0;
      const t = pos / seg;
      xs.push(a[0] + (b[0] - a[0]) * t);
      ys.push(a[1] + (b[1] - a[1]) * t);
    }
    carry += seg - pos;
  }
  if (Math.hypot(xs[xs.length - 1]! - xs[0]!, ys[ys.length - 1]! - ys[0]!) < step * 0.5) {
    xs.pop();
    ys.pop();
  }
  const N = xs.length;
  const T: Track = {
    x: Float64Array.from(xs),
    y: Float64Array.from(ys),
    a: new Float64Array(N),
    s: new Float64Array(N),
    n: N,
    len: N * step,
    step,
  };
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const h = (i - 1 + N) % N;
    T.a[i] = Math.atan2(T.y[j]! - T.y[h]!, T.x[j]! - T.x[h]!);
    T.s[i] = i * step;
  }
  return T;
}

export class DistanceGrid {
  readonly gw: number;
  readonly gh: number;
  readonly dist: Float32Array;
  readonly near: Int32Array;

  constructor(
    T: Track,
    w: number,
    h: number,
    readonly cell: number,
    reach: number,
  ) {
    this.gw = Math.ceil(w / cell);
    this.gh = Math.ceil(h / cell);
    this.dist = new Float32Array(this.gw * this.gh).fill(1e4);
    this.near = new Int32Array(this.gw * this.gh).fill(-1);
    const rc = Math.ceil(reach / cell);
    for (let i = 0; i < T.n; i++) {
      const cx = Math.floor(T.x[i]! / cell);
      const cy = Math.floor(T.y[i]! / cell);
      for (let gy = Math.max(0, cy - rc); gy <= Math.min(this.gh - 1, cy + rc); gy++) {
        for (let gx = Math.max(0, cx - rc); gx <= Math.min(this.gw - 1, cx + rc); gx++) {
          const d = Math.hypot((gx + 0.5) * cell - T.x[i]!, (gy + 0.5) * cell - T.y[i]!);
          const k = gy * this.gw + gx;
          if (d < this.dist[k]!) {
            this.dist[k] = d;
            this.near[k] = i;
          }
        }
      }
    }
  }

  private index(x: number, y: number): number {
    const gx = Math.floor(x / this.cell);
    const gy = Math.floor(y / this.cell);
    if (gx < 0 || gy < 0 || gx >= this.gw || gy >= this.gh) return -1;
    return gy * this.gw + gx;
  }

  /** Distance from (x, y) to the centre line; large off the grid or far from the road. */
  at(x: number, y: number): number {
    const k = this.index(x, y);
    return k < 0 ? 1e4 : this.dist[k]!;
  }

  /** The nearest sample to (x, y), or -1. */
  nearest(x: number, y: number): number {
    const k = this.index(x, y);
    return k < 0 ? -1 : this.near[k]!;
  }
}
