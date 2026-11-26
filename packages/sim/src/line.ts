import type { Track } from './track';

/**
 * The racing line round a track: where across the road a car in a hurry wants to be at each
 * sample, so that it goes wide into a bend, clips the inside and runs wide out of it. It is the
 * line of least bending that stays `margin` inside the road's edges, found by relaxing the centre
 * line (each point is moved across the road until the bend through it is the mean of the bends
 * either side). A pure function of the track, so every screen of an online race finds the same.
 */
export interface Line {
  /** Across the road at each sample, art px: positive to the right of the way round. */
  off: Float32Array;
  x: Float32Array;
  y: Float32Array;
  /** Heading along the line at each sample. */
  a: Float32Array;
  /** How hard the line bends at each sample, 1/px: positive turning right (clockwise on screen). */
  k: Float32Array;
}

/** The bend of the circle through three points (1/radius, signed). */
function bend(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const ux = bx - ax;
  const uy = by - ay;
  const vx = cx - bx;
  const vy = cy - by;
  const wx = cx - ax;
  const wy = cy - ay;
  const den = Math.hypot(ux, uy) * Math.hypot(vx, vy) * Math.hypot(wx, wy);
  return den < 1e-9 ? 0 : (2 * (ux * vy - uy * vx)) / den;
}

/** The least radius the line keeps on the inside of a hairpin, art px. */
const TIGHT = 44;

export function racingLine(T: Track, half: number, margin = 16): Line {
  const N = T.n;
  const lim = Math.max(0, half - margin);
  const off = new Float32Array(N);
  // the way across the road at each sample (to the right of the way round)
  const nx = new Float32Array(N);
  const ny = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    nx[i] = -Math.sin(T.a[i]!);
    ny[i] = Math.cos(T.a[i]!);
  }
  // a bend tighter than the road is wide has no room on its inside: the line keeps `TIGHT` px of
  // radius there, however far in the road's edge goes
  const lo = new Float32Array(N).fill(-lim);
  const hi = new Float32Array(N).fill(lim);
  const G = Math.min(6, Math.max(1, Math.floor(N / 8)));
  for (let i = 0; i < N; i++) {
    const h = (i - G + N) % N;
    const j = (i + G) % N;
    const kc = bend(T.x[h]!, T.y[h]!, T.x[i]!, T.y[i]!, T.x[j]!, T.y[j]!);
    const room = Math.max(0, Math.min(lim, 1 / Math.max(1e-6, Math.abs(kc)) - TIGHT));
    if (kc > 0) hi[i] = room;
    else lo[i] = -room;
  }
  const px = (i: number) => T.x[i]! + nx[i]! * off[i]!;
  const py = (i: number) => T.y[i]! + ny[i]! * off[i]!;
  const at = (i: number) => ((i % N) + N) % N;
  // coarse first (whole bends), then finer; the points between are filled in as it goes
  for (const m of [48, 24, 12, 6]) {
    // (evenly round the whole loop, so there is no odd gap where it closes)
    const n = Math.round(N / m);
    if (n < 6) continue;
    const node = (j: number) => Math.round((((j % n) + n) % n) * (N / n)) % N;
    for (let pass = 0; pass < 40; pass++) {
      for (let j = 0; j < n; j++) {
        const i = node(j);
        const p2 = node(j - 2);
        const p1 = node(j - 1);
        const n1 = node(j + 1);
        const n2 = node(j + 2);
        const want =
          (bend(px(p2), py(p2), px(p1), py(p1), px(i), py(i)) +
            bend(px(i), py(i), px(n1), py(n1), px(n2), py(n2))) /
          2;
        // where the straight from the point before to the point after crosses this one's line
        const ax = px(p1);
        const ay = py(p1);
        const bx = px(n1);
        const by = py(n1);
        const dx = bx - ax;
        const dy = by - ay;
        const den = dx * ny[i]! - dy * nx[i]!;
        if (Math.abs(den) < 1e-6) continue;
        let o = (dy * (T.x[i]! - ax) - dx * (T.y[i]! - ay)) / den;
        // and from there, out until the bend through it is the one wanted
        const e = 0.5;
        const at0 = (d: number) =>
          bend(ax, ay, T.x[i]! + nx[i]! * (o + d), T.y[i]! + ny[i]! * (o + d), bx, by);
        const b0 = at0(0);
        const slope = (at0(e) - b0) / e;
        if (Math.abs(slope) > 1e-9) o += (want - b0) / slope;
        off[i] = Math.max(lo[i]!, Math.min(hi[i]!, o));
      }
      // the samples between the ones moved: straight between their neighbours
      for (let j = 0; j < n; j++) {
        const i = node(j);
        const e = node(j + 1);
        const gap = (e - i + N) % N;
        for (let k = 1; k < gap; k++) {
          const t = k / gap;
          off[at(i + k)] = off[i]! * (1 - t) + off[e]! * t;
        }
      }
    }
  }
  // rounded off, so the line has no corners where two stretches meet
  const tmp = new Float32Array(N);
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 0; i < N; i++) tmp[i] = (off[at(i - 2)]! + 2 * off[i]! + off[at(i + 2)]!) / 4;
    off.set(tmp);
  }
  const L: Line = {
    off,
    x: new Float32Array(N),
    y: new Float32Array(N),
    a: new Float32Array(N),
    k: new Float32Array(N),
  };
  for (let i = 0; i < N; i++) {
    L.x[i] = px(i);
    L.y[i] = py(i);
  }
  const g = G;
  for (let i = 0; i < N; i++) {
    const h = at(i - g);
    const j = at(i + g);
    L.a[i] = Math.atan2(L.y[j]! - L.y[h]!, L.x[j]! - L.x[h]!);
    L.k[i] = bend(L.x[h]!, L.y[h]!, L.x[i]!, L.y[i]!, L.x[j]!, L.y[j]!);
  }
  return L;
}
