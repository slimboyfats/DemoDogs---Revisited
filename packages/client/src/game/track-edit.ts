import type { PropManifest, TrackFile } from '@demodogs/shared';
import { RAISE_MAX, RAISE_MIN } from '@demodogs/shared';
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
  t.areas = t.areas.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy })).filter(inside);
  t.surfaces = t.surfaces.map((s) => ({
    ...s,
    x0: s.x0 + dx,
    y0: s.y0 + dy,
    x1: s.x1 + dx,
    y1: s.y1 + dy,
  }));
  t.raised = t.raised.map((s) => ({
    ...s,
    x0: s.x0 + dx,
    y0: s.y0 + dy,
    x1: s.x1 + dx,
    y1: s.y1 + dy,
  }));
}

/**
 * Put every bridge back on the road: at the middle of the stretch nearest to it. One the road
 * has left behind (further off than the road is wide) is taken away.
 */
export function snapBridges(t: TrackFile): void {
  if (t.bridges.length === 0 && t.surfaces.length === 0 && t.raised.length === 0) return;
  const T = sampleTrack(t.road.points, 4);
  t.bridges = t.bridges.flatMap((b) => {
    const hit = nearestSample(T, b.x, b.y);
    if (hit.d > t.road.width) return [];
    return [{ ...b, x: Math.round(T.x[hit.i]!), y: Math.round(T.y[hit.i]!) }];
  });
  const snap = <S extends { x0: number; y0: number; x1: number; y1: number }>(s: S): S => {
    const a = nearestSample(T, s.x0, s.y0).i;
    const b = nearestSample(T, s.x1, s.y1).i;
    return {
      ...s,
      x0: Math.round(T.x[a]!),
      y0: Math.round(T.y[a]!),
      x1: Math.round(T.x[b]!),
      y1: Math.round(T.y[b]!),
    };
  };
  t.surfaces = t.surfaces.map(snap);
  t.raised = t.raised.map(snap);
}

/**
 * A stretch of road between two of its samples, in the direction of the race: the shorter way
 * round from one to the other, whichever was given first.
 */
export function arc(n: number, a: number, b: number): [number, number] {
  return (b - a + n) % n <= n / 2 ? [a, b] : [b, a];
}

/** Is sample i on the stretch from a to b (in the direction of the race)? */
export const onArc = (n: number, a: number, b: number, i: number): boolean =>
  (i - a + n) % n <= (b - a + n) % n;

/** A stretch of road surface from one point on the ground to another, snapped to the road. */
export function surfaceBetween(
  T: Track,
  material: string,
  p: readonly [number, number],
  q: readonly [number, number],
): TrackFile['surfaces'][number] {
  const [a, b] = arc(T.n, nearestSample(T, p[0], p[1]).i, nearestSample(T, q[0], q[1]).i);
  return {
    material,
    x0: Math.round(T.x[a]!),
    y0: Math.round(T.y[a]!),
    x1: Math.round(T.x[b]!),
    y1: Math.round(T.y[b]!),
  };
}

/** The surface laid last over the road at (x, y), or -1. `reach` is how far off the line counts. */
export function surfaceAt(T: Track, t: TrackFile, x: number, y: number, reach: number): number {
  const hit = nearestSample(T, x, y);
  if (hit.d > reach) return -1;
  for (let k = t.surfaces.length - 1; k >= 0; k--) {
    const s = t.surfaces[k]!;
    const a = nearestSample(T, s.x0, s.y0).i;
    const b = nearestSample(T, s.x1, s.y1).i;
    if (onArc(T.n, a, b, hit.i)) return k;
  }
  return -1;
}

/** The shortest stretch of road worth raising, px: room for a way up and a way down. */
export const RAISE_LEAST = 96;

/**
 * A stretch of road raised into a platform, from one point on the ground to another, snapped to
 * the road. One too short to climb is drawn out about its middle.
 */
export function raisedBetween(
  T: Track,
  height: number,
  p: readonly [number, number],
  q: readonly [number, number],
): TrackFile['raised'][number] {
  let [a, b] = arc(T.n, nearestSample(T, p[0], p[1]).i, nearestSample(T, q[0], q[1]).i);
  const least = Math.min(Math.floor(T.n / 3), Math.ceil(RAISE_LEAST / T.step));
  const short = least - ((b - a + T.n) % T.n);
  if (short > 0) {
    a = (a - Math.ceil(short / 2) + T.n) % T.n;
    b = (b + Math.floor(short / 2)) % T.n;
  }
  return {
    height: Math.max(RAISE_MIN, Math.min(RAISE_MAX, height)),
    x0: Math.round(T.x[a]!),
    y0: Math.round(T.y[a]!),
    x1: Math.round(T.x[b]!),
    y1: Math.round(T.y[b]!),
  };
}

/** The raised stretch the road at (x, y) is on, or -1. `reach` is how far off the line counts. */
export function raisedAt(T: Track, t: TrackFile, x: number, y: number, reach: number): number {
  const hit = nearestSample(T, x, y);
  if (hit.d > reach) return -1;
  for (let k = t.raised.length - 1; k >= 0; k--) {
    const s = t.raised[k]!;
    const a = nearestSample(T, s.x0, s.y0).i;
    const b = nearestSample(T, s.x1, s.y1).i;
    if (onArc(T.n, a, b, hit.i)) return k;
  }
  return -1;
}

/** How long a line through these points is. */
function lengthOf(line: readonly (readonly [number, number])[], closed: boolean): number {
  let d = 0;
  const n = line.length;
  for (let i = 1; i < n + (closed ? 1 : 0); i++)
    d += Math.hypot(line[i % n]![0] - line[i - 1]![0], line[i % n]![1] - line[i - 1]![1]);
  return d;
}

/** `count` points evenly spaced along a line (a closed one starts at its first point). */
function spaced(
  line: readonly (readonly [number, number])[],
  count: number,
  closed: boolean,
): [number, number][] {
  const total = lengthOf(line, closed);
  const out: [number, number][] = [];
  const n = line.length;
  const step = total / (closed ? count : count - 1);
  let seg = 1;
  let before = 0;
  for (let k = 0; k < count; k++) {
    const want = Math.min(total, k * step);
    for (;;) {
      const a = line[seg - 1]!;
      const b = line[seg % n]!;
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (before + l >= want - 1e-9 || seg >= n - (closed ? 0 : 1)) {
        const f = l > 0 ? Math.max(0, Math.min(1, (want - before) / l)) : 0;
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
        break;
      }
      before += l;
      seg++;
    }
  }
  return out;
}

/** A shaky line made steady: each point becomes the mean of itself and its neighbours. */
function steady(line: [number, number][], closed: boolean, reach = 3): [number, number][] {
  const n = line.length;
  return line.map((p, i) => {
    if (!closed && (i === 0 || i === n - 1)) return p;
    let x = 0;
    let y = 0;
    let c = 0;
    for (let k = -reach; k <= reach; k++) {
      const j = closed ? (i + k + n) % n : i + k;
      const q = line[j];
      if (!q) continue;
      x += q[0];
      y += q[1];
      c++;
    }
    return [x / c, y / c];
  });
}

/** Road points this far apart follow a drawn line closely without being a crowd to tidy up. */
const PENCIL_GAP = 150;

/**
 * The road as drawn with the pencil. A line that comes back to where it began is a whole new
 * road. A line from one place on the road to another is a new way between the two: it takes the
 * place of the shorter stretch of road between them. Returns what was done, or null when the
 * line is too short to be either.
 */
export function drawRoad(
  t: TrackFile,
  stroke: readonly (readonly [number, number])[],
): 'loop' | 'stretch' | null {
  if (stroke.length < 4) return null;
  const open = lengthOf(stroke, false);
  const first = stroke[0]!;
  const last = stroke[stroke.length - 1]!;
  const apart = Math.hypot(last[0] - first[0], last[1] - first[1]);
  const T = sampleTrack(t.road.points, 4);
  const from = nearestSample(T, first[0], first[1]);
  const to = nearestSample(T, last[0], last[1]);
  const onRoad = from.d <= t.road.width && to.d <= t.road.width;
  if (onRoad && apart > Math.max(100, open * 0.2) && open >= 120) {
    // a new way between two places on the road
    let [a, b] = [from.i, to.i];
    let line = spaced(stroke, Math.max(8, Math.round(open / 10)), false);
    if ((b - a + T.n) % T.n > T.n / 2) {
      [a, b] = [b, a];
      line = line.reverse();
    }
    const count = Math.max(1, Math.min(30, Math.round(open / PENCIL_GAP) - 1));
    // the ends are on the old road already: the new points lie between them
    const fresh = spaced(steady(line, false), count + 2, false)
      .slice(1, -1)
      .map(([x, y]) => clampPoint(t, x, y));
    const at = t.road.points.map(([x, y]) => nearestSample(T, x, y).i);
    at[0] = 0;
    const kept = t.road.points.filter((_, k) => !onArc(T.n, a, b, at[k]!));
    if (kept.length + fresh.length < 4 || kept.length + fresh.length > 80) return null;
    if (a <= b) {
      const head = t.road.points.filter((_, k) => at[k]! < a);
      const tail = t.road.points.filter((_, k) => at[k]! > b);
      t.road.points = [...head, ...fresh, ...tail];
    } else t.road.points = [...kept, ...fresh];
    return 'stretch';
  }
  const total = lengthOf(stroke, true);
  if (total < 500) return null;
  const line = steady(spaced(stroke, Math.max(16, Math.round(total / 10)), true), true);
  const count = Math.max(6, Math.min(48, Math.round(total / PENCIL_GAP)));
  t.road.points = spaced(line, count, true).map(([x, y]) => clampPoint(t, x, y));
  return 'loop';
}

export type PropGroup = 'pieces' | 'animals' | 'plants' | 'bangs' | 'loose' | 'built';

/** The names of the groups, in the order the palette shows them. */
export const PROP_GROUPS: [PropGroup, string][] = [
  ['pieces', 'TRACK PIECES'],
  ['animals', 'ANIMALS'],
  ['plants', 'TREES & PLANTS'],
  ['bangs', 'THINGS THAT BLOW UP'],
  ['loose', 'LOOSE STUFF'],
  ['built', 'WALLS & BUILDINGS'],
];

/** Which group of the palette a prop is shown in: by what it does, never by its name. */
export function propGroup(p: PropManifest): PropGroup {
  if (p.pad) return 'pieces';
  if (p.critter) return 'animals';
  if (p.crown || p.sway || p.trample) return 'plants';
  if (p.explodesAt || p.blast || p.throws || p.spills) return 'bangs';
  return p.body === 'loose' ? 'loose' : 'built';
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
