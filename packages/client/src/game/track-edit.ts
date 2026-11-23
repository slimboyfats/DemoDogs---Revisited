import type { TrackFile } from '@demodogs/shared';
import { clampPoint, sampleTrack, type Track } from '@demodogs/sim';

/**
 * What the track creator does to a track, apart from the screen: finding what was tapped, adding
 * and removing road points, moving the start, and stepping back.
 */

/** The sample of a road nearest to (x, y), and how far away it is. */
export function nearestSample(T: Track, x: number, y: number): { i: number; d: number } {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < T.n; i++) {
    const d = (T.x[i]! - x) ** 2 + (T.y[i]! - y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return { i: best, d: Math.sqrt(bd) };
}

/**
 * Where on the road (x, y) is nearest to: the stretch of it (after control point `seg`), which way
 * the road runs there, and how far from its centre line the point is.
 */
export function roadAt(
  points: TrackFile['road']['points'],
  x: number,
  y: number,
): { seg: number; a: number; d: number } {
  const T = sampleTrack(points, 4);
  const hit = nearestSample(T, x, y);
  // the curve passes through every control point in turn, starting at the first
  let seg = 0;
  for (let i = 1; i < points.length; i++)
    if (nearestSample(T, points[i]![0], points[i]![1]).i <= hit.i) seg = i;
  return { seg, a: T.a[hit.i]!, d: hit.d };
}

/** A new road point at (x, y), in the stretch of road nearest to it. Returns its index. */
export function insertPoint(t: TrackFile, x: number, y: number): number {
  if (t.road.points.length >= 80) return -1;
  const { seg } = roadAt(t.road.points, x, y);
  t.road.points.splice(seg + 1, 0, clampPoint(t, x, y));
  return seg + 1;
}

/** Take a road point out. A road needs four. */
export function removePoint(t: TrackFile, i: number): boolean {
  if (t.road.points.length <= 4 || !t.road.points[i]) return false;
  t.road.points.splice(i, 1);
  return true;
}

/** Make point i the start line (the road is the same; the points are counted from there). */
export function startAt(t: TrackFile, i: number): void {
  const p = t.road.points;
  t.road.points = [...p.slice(i), ...p.slice(0, i)];
}

/** Race the other way round, from the same start line. */
export function reverse(t: TrackFile): void {
  const [first, ...rest] = t.road.points;
  t.road.points = [first!, ...rest.reverse()];
}

/** Give the map a new size, keeping what is on it about its middle. */
export function resize(t: TrackFile, w: number, h: number): void {
  const dx = Math.round((w - t.size.w) / 2);
  const dy = Math.round((h - t.size.h) / 2);
  t.size = { w, h };
  t.road.points = t.road.points.map(([x, y]) => clampPoint(t, x + dx, y + dy));
  const inside = (o: { x: number; y: number }) =>
    o.x > 12 && o.y > 12 && o.x < w - 12 && o.y < h - 12;
  t.items = t.items.map((i) => ({ ...i, x: i.x + dx, y: i.y + dy })).filter(inside);
  t.pools = t.pools.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })).filter(inside);
  t.bridges = t.bridges.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy })).filter(inside);
}

/**
 * Put every bridge back on the road: at the middle of the stretch nearest to it. One the road
 * has left behind (further off than the road is wide) is taken away.
 */
export function snapBridges(t: TrackFile): void {
  if (t.bridges.length === 0) return;
  const T = sampleTrack(t.road.points, 4);
  t.bridges = t.bridges.flatMap((b) => {
    const hit = nearestSample(T, b.x, b.y);
    if (hit.d > t.road.width) return [];
    return [{ ...b, x: Math.round(T.x[hit.i]!), y: Math.round(T.y[hit.i]!) }];
  });
}

/** The index of the thing nearest to (x, y) within `reach`, or -1. */
export function nearest(
  things: readonly { x: number; y: number; r?: number }[],
  x: number,
  y: number,
  reach: number,
): number {
  let best = -1;
  let bd = Infinity;
  things.forEach((o, i) => {
    const d = Math.hypot(o.x - x, o.y - y) - (o.r ?? 0);
    if (d < reach && d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Steps back: the track as it was before each change. */
export class History {
  private readonly past: string[] = [];

  /** Call before changing the track. */
  remember(t: TrackFile): void {
    const now = JSON.stringify(t);
    if (this.past[this.past.length - 1] === now) return;
    this.past.push(now);
    if (this.past.length > 60) this.past.shift();
  }

  get size(): number {
    return this.past.length;
  }

  undo(): TrackFile | null {
    const s = this.past.pop();
    return s === undefined ? null : (JSON.parse(s) as TrackFile);
  }
}
