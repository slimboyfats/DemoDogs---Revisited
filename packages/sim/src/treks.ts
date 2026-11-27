import { FLUNG_BELOW, type SceneryRule } from '@demodogs/shared';
import type { World } from './world';

type Rule = Extract<SceneryRule, { rule: 'trek' }>;

/**
 * Things that travel (the `trek` scenery rule): a train over a level crossing, a tractor along
 * the edge of a field, ducks in a file across the road. Each trek is a way (a line of points) and
 * a timetable; where each of its travellers is at any moment is worked out from the race's clock
 * alone, so nothing has to be stepped while nobody is near, a lamp can show what is coming, and
 * every screen of an online race agrees without a word. The travellers themselves are animals
 * like any other (`world.critters`, see critters.ts): light ones are bowled over and run back to
 * their place in the line, heavy ones do not give way.
 */
export interface Trek {
  rule: Rule;
  /** The way: points, and how far along it each is. */
  xs: number[];
  ys: number[];
  ds: number[];
  len: number;
  /** Seconds from one setting out to the next (never less than the trip takes). */
  period: number;
  /** How far from the way scenery is kept, art px. */
  room: number;
  /** Too heavy to be bowled over (a train, a tractor): a car gives way to it. */
  heavy: boolean;
  /** The radius of its biggest traveller, art px. */
  size: number;
}

/** Where a traveller is: on the way or not, where, which way it faces and how fast it is going. */
export interface Slot {
  on: boolean;
  x: number;
  y: number;
  h: number;
  vx: number;
  vy: number;
}

export function newSlot(): Slot {
  return { on: false, x: 0, y: 0, h: 0, vx: 0, vy: 0 };
}

/** How far short of the map's edge a way stops, art px. */
const EDGE = 16;

/** The ways of a venue's `trek` rules, in the order the rules come. Before any scenery is laid. */
export function planTreks(w: World): void {
  for (const rule of w.venue.scenery) {
    if (rule.rule !== 'trek') continue;
    const def = w.content.prop.get(rule.prop);
    const lead = rule.lead ? w.content.prop.get(rule.lead) : def;
    // (a rule that names something that is not there, or cannot travel, lays nothing)
    if (!def?.critter || !lead?.critter) continue;
    const pts = wayOf(w, rule);
    if (pts.length < 4) continue;
    const xs: number[] = [];
    const ys: number[] = [];
    const ds: number[] = [];
    let len = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const x = Math.min(w.w - EDGE, Math.max(EDGE, pts[i]!));
      const y = Math.min(w.h - EDGE, Math.max(EDGE, pts[i + 1]!));
      if (xs.length) {
        const d = Math.hypot(x - xs[xs.length - 1]!, y - ys[ys.length - 1]!);
        if (d < 0.5) continue;
        len += d;
      }
      xs.push(x);
      ys.push(y);
      ds.push(len);
    }
    if (xs.length < 2 || len < 8) continue;
    const ext = len + (rule.count - 1) * rule.gap;
    const trip = ext / rule.speed;
    w.treks.push({
      rule,
      xs,
      ys,
      ds,
      len,
      period: Math.max(rule.every, rule.back ? trip * 2 + 2 : trip + 1),
      room: Math.max(def.radius, lead.radius) + rule.wide + 5,
      heavy: Math.max(def.critter.mass, lead.critter.mass) >= FLUNG_BELOW,
      size: Math.max(def.radius, lead.radius),
    });
  }
}

/** A trek rule's way as x, y, x, y ... in map px. */
function wayOf(w: World, rule: Rule): number[] {
  const out: number[] = [];
  const T = w.track;
  if (rule.points) {
    for (const [x, y] of rule.points) out.push(x + w.w / 2, y + w.h / 2);
    return out;
  }
  if (!T) return out;
  const half = w.road / 2;
  if (rule.cross) {
    const C = rule.cross;
    const i = Math.floor(C.at * T.n) % T.n;
    const a = T.a[i]! + C.skew;
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const k = C.flip ? -1 : 1;
    const from = -(half + C.reach) * k;
    const to = (half + (C.far ?? C.reach)) * k;
    out.push(T.x[i]! + nx * from, T.y[i]! + ny * from, T.x[i]! + nx * to, T.y[i]! + ny * to);
    return out;
  }
  if (rule.beside) {
    const B = rule.beside;
    const i0 = Math.floor(B.from * T.n) % T.n;
    const i1 = Math.floor(B.to * T.n) % T.n;
    const n = (i1 - i0 + T.n) % T.n;
    const o = B.lane * half;
    for (let k = 0; k <= n; k += 2) {
      const i = (i0 + k) % T.n;
      out.push(T.x[i]! - Math.sin(T.a[i]!) * o, T.y[i]! + Math.cos(T.a[i]!) * o);
    }
  }
  return out;
}

/** The place `d` px along a trek's way, into `S` (x, y and the heading there). */
function along(K: Trek, d: number, S: Slot): void {
  const { xs, ys, ds } = K;
  let lo = 0;
  let hi = ds.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ds[mid]! <= d) lo = mid;
    else hi = mid;
  }
  const span = ds[hi]! - ds[lo]! || 1;
  const u = Math.min(1, Math.max(0, (d - ds[lo]!) / span));
  const dx = xs[hi]! - xs[lo]!;
  const dy = ys[hi]! - ys[lo]!;
  S.x = xs[lo]! + dx * u;
  S.y = ys[lo]! + dy * u;
  S.h = Math.atan2(dy, dx);
}

/**
 * Where traveller `i` of a trek (set `off` px to the side of the way) is at time `t`, into `S`.
 * One that has not set out yet, or has arrived where it goes for good, is not `on` the way.
 */
export function slotAt(K: Trek, i: number, off: number, t: number, S: Slot): Slot {
  const R = K.rule;
  const tau = (((t + R.shift * K.period) % K.period) + K.period) % K.period;
  const ext = K.len + (R.count - 1) * R.gap;
  let d: number;
  let dir = 1;
  let moving = true;
  S.on = true;
  if (!R.back) {
    d = tau * R.speed - i * R.gap;
    if (d < 0 || d > K.len) {
      S.on = false;
      moving = false;
      d = d < 0 ? 0 : K.len;
    }
  } else if (tau < K.period / 2) {
    const e = Math.min(ext, tau * R.speed) - i * R.gap;
    moving = e > 0 && e < K.len;
    d = Math.min(K.len, Math.max(0, e));
  } else {
    const e = Math.min(ext, (tau - K.period / 2) * R.speed) - i * R.gap;
    moving = e > 0 && e < K.len;
    d = K.len - Math.min(K.len, Math.max(0, e));
    dir = -1;
  }
  along(K, d, S);
  const c = Math.cos(S.h);
  const s = Math.sin(S.h);
  S.x -= s * off;
  S.y += c * off;
  S.vx = moving ? c * R.speed * dir : 0;
  S.vy = moving ? s * R.speed * dir : 0;
  if (dir < 0) S.h += Math.PI;
  return S;
}

/** How far (x, y) is from a trek's way, art px. */
export function offWay(K: Trek, x: number, y: number): number {
  let best = Infinity;
  for (let i = 1; i < K.xs.length; i++) {
    const ax = K.xs[i - 1]!;
    const ay = K.ys[i - 1]!;
    const dx = K.xs[i]! - ax;
    const dy = K.ys[i]! - ay;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(ax + dx * u - x, ay + dy * u - y));
  }
  return best;
}

/** Is (x, y) within `r` of any trek's way? Scenery asks before it stands anything solid. */
export function onTrek(w: World, x: number, y: number, r: number): boolean {
  for (const K of w.treks) if (offWay(K, x, y) < K.room + r) return true;
  return false;
}

const AHEAD = newSlot();

/**
 * Is any traveller of a trek whose way passes within `reach` of (x, y) within `near` of it at
 * time `t`? What a signal beside a crossing shows: asked for now, and for a moment from now.
 */
export function trekNear(
  w: World,
  x: number,
  y: number,
  reach: number,
  near: number,
  t: number,
): boolean {
  for (const K of w.treks) {
    if (offWay(K, x, y) > reach) continue;
    // (a way across the road is judged from the middle of the road, so that the lamps on both
    // sides of it show the same)
    const last = K.xs.length - 1;
    const cx = K.rule.cross ? (K.xs[0]! + K.xs[last]!) / 2 : x;
    const cy = K.rule.cross ? (K.ys[0]! + K.ys[last]!) / 2 : y;
    for (let i = 0; i < K.rule.count; i++) {
      const S = slotAt(K, i, 0, t, AHEAD);
      if (S.on && Math.abs(S.x - cx) < near && Math.abs(S.y - cy) < near) return true;
    }
  }
  return false;
}

/** Is there a trek's way within `reach` of (x, y)? */
export function trekBy(w: World, x: number, y: number, reach: number): boolean {
  for (const K of w.treks) if (offWay(K, x, y) <= reach) return true;
  return false;
}
