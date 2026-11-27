import type { PropManifest, TrackFile } from '@demodogs/shared';
import {
  RAISE_LEVELS,
  RAISE_MAX,
  RAISE_MIN,
  RAISE_STEP,
  RAMP_MAX,
  RAMP_MIN,
  RAMP_STEP,
} from '@demodogs/shared';
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
  // a stretch runs the way the race does: it keeps its place by changing its ends about
  const turned = <S extends { x0: number; y0: number; x1: number; y1: number }>(s: S): S => ({
    ...s,
    x0: s.x1,
    y0: s.y1,
    x1: s.x0,
    y1: s.y0,
  });
  t.surfaces = t.surfaces.map(turned);
  t.raised = t.raised.map((r) => {
    const { rampIn, rampOut, lanes, levels, ...rest } = turned(r);
    const hs = [r.height, ...(levels ?? []).map((l) => l.height)];
    return {
      ...rest,
      height: hs[hs.length - 1]!,
      ...(levels?.length
        ? { levels: levels.map((l, j) => ({ x: l.x, y: l.y, height: hs[j]! })).reverse() }
        : {}),
      ...(lanes ? { lanes: lanes === 'left' ? 'right' : lanes === 'right' ? 'left' : lanes } : {}),
      ...(rampOut !== undefined ? { rampIn: rampOut } : {}),
      ...(rampIn !== undefined ? { rampOut: rampIn } : {}),
    };
  });
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
    ...(s.levels ? { levels: s.levels.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy })) } : {}),
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
  for (const r of t.raised) tidyLevels(T, r);
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

/** The samples of the road a stretch (of surface, or raised) runs from and to. */
export function stretchEnds(
  T: Track,
  s: { x0: number; y0: number; x1: number; y1: number },
): [number, number] {
  return [nearestSample(T, s.x0, s.y0).i, nearestSample(T, s.x1, s.y1).i];
}

/**
 * Drag one end of a stretch (0: where it begins, 1: where it ends) to the road nearest (x, y).
 * The other end stays put. The stretch is never shorter than `least` px, nor so long that less
 * than that is left of the lap: an end dragged past either stops there. Returns whether it moved.
 */
export function moveEnd(
  T: Track,
  s: { x0: number; y0: number; x1: number; y1: number },
  end: 0 | 1,
  x: number,
  y: number,
  least: number,
): boolean {
  const [a, b] = stretchEnds(T, s);
  const lo = Math.max(1, Math.min(Math.floor(T.n / 3), Math.ceil(least / T.step)));
  const hi = T.n - lo;
  const was = (b - a + T.n) % T.n;
  const i = nearestSample(T, x, y).i;
  let len = end === 0 ? (b - i + T.n) % T.n : (i - a + T.n) % T.n;
  // past the other end (which would flip it to the long way round, or back), or round the whole
  // lap: it stops at whichever limit it was nearer to
  if (len < lo || len > hi || Math.abs(len - was) > T.n / 2)
    len = Math.abs(was - lo) <= Math.abs(was - hi) ? lo : hi;
  if (len === was) return false;
  const at = end === 0 ? (b - len + T.n) % T.n : (a + len) % T.n;
  if (end === 0) Object.assign(s, { x0: Math.round(T.x[at]!), y0: Math.round(T.y[at]!) });
  else Object.assign(s, { x1: Math.round(T.x[at]!), y1: Math.round(T.y[at]!) });
  return true;
}

type Up = TrackFile['raised'][number];

/** The shortest a level of a raised stretch can be, px: room for the slopes at its two ends. */
export const LEVEL_LEAST = 64;

/**
 * The levels of a raised stretch: the samples it runs from and to, how many samples long it is,
 * how many samples into it each level after the first begins (`cuts`, in order), and how high
 * each level stands (one more than there are cuts).
 */
export function levelsIn(
  T: Track,
  s: Up,
): { a: number; b: number; len: number; cuts: number[]; heights: number[] } {
  const [a, b] = stretchEnds(T, s);
  const len = (b - a + T.n) % T.n;
  const cuts = (s.levels ?? []).map((l) => (nearestSample(T, l.x, l.y).i - a + T.n) % T.n);
  return { a, b, len, cuts, heights: [s.height, ...(s.levels ?? []).map((l) => l.height)] };
}

/**
 * Put a stretch's levels in order along it, each on the road; ones the stretch no longer holds
 * (its end was moved past them, or the road was) or that have closed up on a neighbour go.
 */
export function tidyLevels(T: Track, s: Up): void {
  if (!s.levels) return;
  const { a, len } = levelsIn(T, s);
  const least = Math.max(1, Math.ceil(LEVEL_LEAST / 2 / T.step));
  let last = 0;
  const kept = s.levels
    .map((l) => ({ l, at: (nearestSample(T, l.x, l.y).i - a + T.n) % T.n }))
    .sort((p, q) => p.at - q.at)
    .filter((p) => {
      if (p.at < last + least || p.at > len - least) return false;
      last = p.at;
      return true;
    })
    .map(({ l, at }) => {
      const i = (a + at) % T.n;
      return { ...l, x: Math.round(T.x[i]!), y: Math.round(T.y[i]!) };
    });
  if (kept.length) s.levels = kept;
  else delete s.levels;
}

/** Which level of a raised stretch the road nearest (x, y) is on: 0 the first. */
export function levelAt(T: Track, s: Up, x: number, y: number): number {
  const { a, len, cuts } = levelsIn(T, s);
  const at = (nearestSample(T, x, y).i - a + T.n) % T.n;
  // (a place just off either end counts as that end)
  const k = at > len ? (at - len < T.n - at ? len : 0) : at;
  let part = 0;
  while (part < cuts.length && k >= cuts[part]!) part++;
  return part;
}

/** How high level `part` of a raised stretch stands. */
export const levelHeight = (s: Up, part: number): number =>
  part > 0 ? (s.levels?.[part - 1]?.height ?? s.height) : s.height;

/** Stand level `part` of a raised stretch `h` high. */
export function setLevelHeight(s: Up, part: number, h: number): void {
  const high = Math.max(RAISE_MIN, Math.min(RAISE_MAX, h));
  const l = part > 0 ? s.levels?.[part - 1] : undefined;
  if (l) l.height = high;
  else s.height = high;
  // (a slope of its own at an end is never left so short for the new height as to be a wall)
  const n = s.levels?.length ?? 0;
  if (part === 0 && s.rampIn !== undefined) s.rampIn = Math.max(s.rampIn, rampLeast(high));
  if (part === n && s.rampOut !== undefined) s.rampOut = Math.max(s.rampOut, rampLeast(high));
}

/**
 * Split level `part` of a raised stretch in two at its middle (or, with a place, at the road
 * nearest it): the half further on becomes a level of its own, a step higher (lower, if that is
 * as high as road goes). Returns the new level, or -1 when there is no room for another.
 */
export function splitLevel(T: Track, s: Up, part: number, at?: readonly [number, number]): number {
  const { a, len, cuts, heights } = levelsIn(T, s);
  if (cuts.length >= RAISE_LEVELS || part < 0 || part > cuts.length) return -1;
  const least = Math.ceil(LEVEL_LEAST / T.step);
  const lo = (part > 0 ? cuts[part - 1]! : 0) + least;
  const hi = (part < cuts.length ? cuts[part]! : len) - least;
  if (hi < lo) return -1;
  const mid = at ? (nearestSample(T, at[0], at[1]).i - a + T.n) % T.n : Math.round((lo + hi) / 2);
  const k = Math.max(lo, Math.min(hi, mid));
  const i = (a + k) % T.n;
  const h = heights[part]!;
  const height = h + 2 * RAISE_STEP <= RAISE_MAX ? h + 2 * RAISE_STEP : h - 2 * RAISE_STEP;
  (s.levels ??= []).splice(part, 0, { x: Math.round(T.x[i]!), y: Math.round(T.y[i]!), height });
  return part + 1;
}

/**
 * Join level `part` of a raised stretch to the one before it (the first: to the one after), at
 * the height of `part`. Returns the level they have become, or -1 if there is only the one.
 */
export function joinLevel(s: Up, part: number): number {
  const n = s.levels?.length ?? 0;
  if (!n || part < 0 || part > n) return -1;
  const h = levelHeight(s, part);
  const cut = Math.max(1, part);
  s.levels!.splice(cut - 1, 1);
  if (!s.levels!.length) delete s.levels;
  setLevelHeight(s, cut - 1, h);
  return cut - 1;
}

/**
 * Drag the place where level `part` (1 or more) of a raised stretch begins to the road nearest
 * (x, y): no nearer either neighbour, or an end, than a level can be short. Whether it moved.
 */
export function moveLevel(T: Track, s: Up, part: number, x: number, y: number): boolean {
  const l = s.levels?.[part - 1];
  if (!l) return false;
  const { a, len, cuts } = levelsIn(T, s);
  const least = Math.ceil(LEVEL_LEAST / T.step);
  const lo = (part > 1 ? cuts[part - 2]! : 0) + least;
  const hi = (part < cuts.length ? cuts[part]! : len) - least;
  if (hi < lo) return false;
  const want = (nearestSample(T, x, y).i - a + T.n) % T.n;
  // (off the stretch altogether: whichever end it is nearer)
  const k = Math.max(lo, Math.min(hi, want > len ? (want - len < T.n - want ? hi : lo) : want));
  if (k === cuts[part - 1]) return false;
  const i = (a + k) % T.n;
  Object.assign(l, { x: Math.round(T.x[i]!), y: Math.round(T.y[i]!) });
  return true;
}

/** The shortest slope (px) that a car can still drive up to road `h` high: any shorter is a wall. */
export const rampLeast = (h: number): number =>
  Math.max(RAMP_MIN, Math.ceil((h * 1.7) / RAMP_STEP) * RAMP_STEP);

/**
 * How long the slope at an end of a raised stretch (0: up to it at its start, 1: down from it at
 * its end) is, px: what it says, else about five along for each px up, and never more than the
 * level it climbs to has room for.
 */
export function rampOf(T: Track, s: Up, end: 0 | 1): number {
  const { len, cuts, heights } = levelsIn(T, s);
  const h = end === 0 ? heights[0]! : heights[heights.length - 1]!;
  const said = end === 0 ? s.rampIn : s.rampOut;
  const room = (cuts.length ? (end === 0 ? cuts[0]! : len - cuts[cuts.length - 1]!) : len) * T.step;
  const plain = !cuts.length && s.rampIn === undefined && s.rampOut === undefined;
  return Math.min(said ?? h * 5, plain ? room / 2 : room);
}

/**
 * Drag the top of the slope at an end of a raised stretch to the road nearest (x, y): near the
 * end is a short, steep slope, far from it a long, gentle one. It is never so short as to be a
 * wall, and leaves the other end's slope (or the next level) its room. Whether it changed.
 */
export function moveRamp(T: Track, s: Up, end: 0 | 1, x: number, y: number): boolean {
  const { a, len } = levelsIn(T, s);
  const at = (nearestSample(T, x, y).i - a + T.n) % T.n;
  const k = at > len ? (at - len < T.n - at ? len : 0) : at;
  return setRamp(T, s, end, (end === 0 ? k : len - k) * T.step);
}

/**
 * Make the slope at an end of a raised stretch about `want` px long. It is never so short as to
 * be a wall, and leaves the other end's slope (or the next level) its room. Whether it changed.
 */
export function setRamp(T: Track, s: Up, end: 0 | 1, want: number): boolean {
  const { len, cuts, heights } = levelsIn(T, s);
  const h = end === 0 ? heights[0]! : heights[heights.length - 1]!;
  const first = cuts.length ? (end === 0 ? cuts[0]! : len - cuts[cuts.length - 1]!) : len;
  // (with no levels the two slopes share the one stretch)
  const other = cuts.length ? 0 : rampOf(T, s, end === 0 ? 1 : 0);
  const most = Math.min(RAMP_MAX, Math.floor((first * T.step - other) / RAMP_STEP) * RAMP_STEP);
  const least = rampLeast(h);
  if (most < least) return false;
  const long = Math.max(least, Math.min(most, snapTo(want, RAMP_STEP)));
  if (long === (end === 0 ? s.rampIn : s.rampOut)) return false;
  // (a slope of its own at one end makes the other end's its own too, as long as it was)
  const was = rampOf(T, s, end === 0 ? 1 : 0);
  if (end === 0) {
    s.rampIn = long;
    s.rampOut ??= snapTo(Math.max(RAMP_MIN, Math.min(RAMP_MAX, was)), RAMP_STEP);
  } else {
    s.rampOut = long;
    s.rampIn ??= snapTo(Math.max(RAMP_MIN, Math.min(RAMP_MAX, was)), RAMP_STEP);
  }
  return true;
}

/** The slopes an end can be given by name: as steep as a car can climb, the usual, or a long one. */
export const SLOPES = ['steep', 'medium', 'gentle'] as const;
export type Slope = (typeof SLOPES)[number];

/** How long a slope of each name is for road `h` high (px). */
export const slopeLength = (h: number, slope: Slope): number =>
  slope === 'steep' ? rampLeast(h) : snapTo(h * (slope === 'medium' ? 5 : 10), RAMP_STEP);

/** Which of the named slopes the one at an end of a raised stretch is nearest to. */
export function slopeOf(T: Track, s: Up, end: 0 | 1): Slope {
  const { heights } = levelsIn(T, s);
  const h = end === 0 ? heights[0]! : heights[heights.length - 1]!;
  const long = rampOf(T, s, end);
  let best: Slope = 'medium';
  for (const k of SLOPES)
    if (Math.abs(slopeLength(h, k) - long) < Math.abs(slopeLength(h, best) - long)) best = k;
  return best;
}

/** A finger moves this many CSS px up or down the screen for each art px a road is raised by. */
export const LIFT_PX = 5;

/**
 * How high a stretch stands after a finger that took hold of it at height `h0` has moved `dy`
 * CSS px down the screen (up the screen, a negative `dy`, is higher), in the editor's steps.
 */
export function liftTo(h0: number, dy: number): number {
  const h = Math.round((h0 - dy / LIFT_PX) / RAISE_STEP) * RAISE_STEP;
  return Math.max(RAISE_MIN, Math.min(RAISE_MAX, h));
}

/** The samples of the road a bridge's deck begins and ends at. */
export function bridgeEnds(
  T: Track,
  b: { x: number; y: number; length: number },
): [number, number] {
  const c = nearestSample(T, b.x, b.y).i;
  const half = Math.min(Math.floor(T.n / 2) - 1, Math.round(b.length / 2 / T.step));
  return [(c - half + T.n) % T.n, (c + half) % T.n];
}

/** How long a bridge is when one of its ends is dragged to the road nearest (x, y). */
export function bridgeSpan(T: Track, b: { x: number; y: number }, x: number, y: number): number {
  const c = nearestSample(T, b.x, b.y).i;
  const i = nearestSample(T, x, y).i;
  const away = Math.min((i - c + T.n) % T.n, (c - i + T.n) % T.n);
  return Math.max(80, Math.min(600, snapTo(away * T.step * 2, 20)));
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
  if (p.pad || p.bounce) return 'pieces';
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

/** Things off the road settle on a grid this fine when snapping is on (art px). */
export const SNAP_GRID = 16;
/** Road points settle on a coarser one, so bends line up. */
export const SNAP_POINT = 20;

/** The nearest multiple of `step` to v. */
export const snapTo = (v: number, step: number): number => Math.round(v / step) * step;

/**
 * Where a thing let go at (x, y) settles when snapping is on. On the road it takes the middle of
 * the road or of a lane either side, as far along as it was let go; off it, the grid.
 */
export function snapThing(T: Track, width: number, x: number, y: number): [number, number] {
  const near = nearestSample(T, x, y);
  if (near.d > width / 2) return [snapTo(x, SNAP_GRID), snapTo(y, SNAP_GRID)];
  const a = T.a[near.i]!;
  const px = T.x[near.i]!;
  const py = T.y[near.i]!;
  // across the road (to the right of the way it runs) and along it
  const across = -(x - px) * Math.sin(a) + (y - py) * Math.cos(a);
  const along = (x - px) * Math.cos(a) + (y - py) * Math.sin(a);
  const lane = width * 0.3;
  const off = Math.abs(across) < lane / 2 ? 0 : Math.sign(across) * lane;
  return [
    Math.round(px + along * Math.cos(a) - off * Math.sin(a)),
    Math.round(py + along * Math.sin(a) + off * Math.cos(a)),
  ];
}

/** Steps back and forward again: the track as it was before each change, and after it. */
export class History {
  private readonly past: string[] = [];
  private readonly future: string[] = [];

  /** Call before changing the track. A new change leaves nothing to step forward to. */
  remember(t: TrackFile): void {
    const now = JSON.stringify(t);
    if (this.past[this.past.length - 1] === now) return;
    this.past.push(now);
    if (this.past.length > 60) this.past.shift();
    this.future.length = 0;
  }

  /** How many steps back there are, and how many forward again. */
  get size(): number {
    return this.past.length;
  }

  get ahead(): number {
    return this.future.length;
  }

  /** The track as it was a step back. Given the track as it is, `redo` can bring that back. */
  undo(now?: TrackFile): TrackFile | null {
    const s = this.past.pop();
    if (s === undefined) return null;
    if (now) this.future.push(JSON.stringify(now));
    return JSON.parse(s) as TrackFile;
  }

  /** The track as it was before the last step back. */
  redo(now: TrackFile): TrackFile | null {
    const s = this.future.pop();
    if (s === undefined) return null;
    this.past.push(JSON.stringify(now));
    return JSON.parse(s) as TrackFile;
  }
}
