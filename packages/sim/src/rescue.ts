import { DT } from '@demodogs/shared';
import type { Car, Spill } from './entities';
import { waterAt } from './damage';
import { leapGaps, leapPieces } from './leaps';
import { pathAt } from './pads';
import type { World } from './world';

/** Seconds a car that has fallen short of a jump lies in the pool under it before it is put back. */
export const PLUNGE_TIME = 0.8;

/**
 * The pools a jump is made over: for each gap between a takeoff and its landing, the smallest
 * pool laid as part of the map that its middle lies in. What comes down in one has fallen short.
 */
export function pitsOf(w: World): Spill[] {
  const out: Spill[] = [];
  for (const [x0, y0, x1, y1] of leapGaps(leapPieces(w.venue, w.content))) {
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    let best: Spill | null = null;
    for (const s of w.spills)
      if (s.fixed && Math.hypot(s.x - mx, s.y - my) < s.r && (!best || s.r < best.r)) best = s;
    if (best && !out.includes(best)) out.push(best);
  }
  return out;
}

/** Is (x, y) in the pool under a jump, and not on the jump's own pieces or a path over it? */
export function inPit(w: World, x: number, y: number): boolean {
  for (const s of w.pits) {
    if (Math.abs(s.x - x) > s.r || Math.hypot(s.x - x, s.y - y) > s.r) continue;
    return !pathAt(w, x, y);
  }
  return false;
}

/** How high raised road must stand over a car beside it for the car to be off it. */
const HIGH = 8;

/** Seconds left of the count before `c` is put back on the road, or 0 while none is running. */
export function rescueIn(w: World, c: Car): number {
  const { rescueGrace: grace, rescueCount: count } = w.tuning;
  // (one going under in deep water is put back without a count)
  return count > 0 && c.downT > grace && !((c.drown ?? 0) > 0) ? grace + count - c.downT : 0;
}

/**
 * In a race a car that leaves the course has a while to find its own way back: over the grass,
 * along a path laid off the road (which is part of the course), or, below raised road (whose sides are walls), up a ramp at its end or a way up its side.
 * After a while off the course (`tuning.rescueGrace`) a count starts, shown to the player, and at its end the car
 * is put back on the nearest road it has already driven: never further on than where it left,
 * so there is nothing to gain by it.
 */
export function updateRescue(w: World, c: Car): void {
  const T = w.track;
  const { rescueGrace, rescueCount, verge } = w.tuning;
  if (
    !T ||
    rescueCount <= 0 ||
    w.kind !== 'race' ||
    c.wrecked ||
    c.finished ||
    w.phase !== 'race'
  ) {
    c.downT = c.plunge = 0;
    c.drown = 0;
    return;
  }
  const i = c.idx;
  const R = w.relief;
  // short of a jump, down in the pool under it: it lies there a moment and is put back where it
  // left the road, so a jump missed costs all of the way that led to it
  if (c.plunge > 0 || (w.pits.length && c.z - c.deck < 1.5 && inPit(w, c.x, c.y))) {
    if (c.plunge === 0) w.emit({ t: 'plunge', car: c.index, x: c.x, y: c.y });
    c.plunge += DT;
    c.vx *= 0.8;
    c.vy *= 0.8;
    c.spin *= 0.8;
    if (c.plunge < PLUNGE_TIME) return;
    c.lap = c.onLap;
    putBack(w, c, c.onIdx);
    return;
  }
  if (drowning(w, c)) return;
  const top = R?.plat ? R.platAt(T.x[i]!, T.y[i]!) : 0;
  const below = top >= HIGH && top - R!.platAt(c.x, c.y) > HIGH * 0.75;
  // (a way up the side is the way back: on one it is not off the course)
  const off =
    !R?.slipAt(c.x, c.y) &&
    !pathAt(w, c.x, c.y) &&
    (below || Math.hypot(c.x - T.x[i]!, c.y - T.y[i]!) > w.road / 2 + verge);
  if (!off) {
    c.downT = 0;
    // (a path or a way up is part of the course, but the last road it was on is the road itself)
    if (!below && Math.hypot(c.x - T.x[i]!, c.y - T.y[i]!) <= w.road / 2 + verge) {
      c.onIdx = i;
      c.onLap = c.lap;
    }
    return;
  }
  // (in the air it is not yet waiting)
  if (c.z > 2) return;
  c.downT += DT;
  if (c.downT < rescueGrace + rescueCount) return;
  // the road beside it, unless that is further on than it has driven: then where it left
  const ahead = (c.lap - c.onLap) * T.n + i - c.onIdx > 2;
  if (ahead) c.lap = c.onLap;
  putBack(w, c, ahead ? c.onIdx : i);
}

/** Put `c` on the road at sample `i`, rolling, clear of the others and safe for a moment. */
function putBack(w: World, c: Car, i: number): void {
  const x = c.x;
  const y = c.y;
  const fell = c.plunge > 0;
  const { rescueSpeed } = w.tuning;
  w.placeOnTrack(c, i, 0);
  for (
    let tries = 0;
    tries < 6 && w.cars.some((o) => o !== c && Math.hypot(o.x - c.x, o.y - c.y) < 18);
    tries++
  ) {
    c.x -= Math.cos(c.h) * 16;
    c.y -= Math.sin(c.h) * 16;
  }
  c.vx = Math.cos(c.h) * rescueSpeed;
  c.vy = Math.sin(c.h) * rescueSpeed;
  c.vz = c.spin = 0;
  c.deck = w.deckAt(c.idx);
  c.z = c.deck + 6;
  c.downT = 0;
  c.plunge = 0;
  c.drown = 0;
  c.invuln = Math.max(c.invuln, 1);
  w.emit(fell ? { t: 'rescue', car: c.index, x, y, fell } : { t: 'rescue', car: c.index, x, y });
}

/** Seconds a car in water too deep to wade takes to go under before it is put back. */
export const SINK_TIME = 1.3;

const DRY: [number, boolean] = [0, false];

/**
 * The water car c stands in: how far in from the shore it is (art px; 0 when it is dry: in the
 * air, up on a deck, on a path laid over the water or on ground raised out of it), and whether
 * that is too deep to wade.
 */
export function wading(w: World, c: Car): [number, boolean] {
  if (w.spills.length === 0 || c.deck > 0 || c.z > 2 || c.buried) return DRY;
  if ((w.relief?.platAt(c.x, c.y) ?? 0) > 1 || (w.paths.length && pathAt(w, c.x, c.y))) return DRY;
  return waterAt(w, c.x, c.y);
}

/**
 * Dark water is too deep to wade. A racing car that drives or falls into it goes under where it
 * is, engine dead, and is put back on the road it left: no count, nothing to find a way out of.
 * Where no car is ever put back (a derby, a track with no road) deep water is waded like the rest.
 */
function drowning(w: World, c: Car): boolean {
  const under = c.drown ?? 0;
  if (under <= 0 && !wading(w, c)[1]) return false;
  if (under <= 0) w.emit({ t: 'sink', car: c.index, x: c.x, y: c.y });
  c.drown = under + DT;
  c.stall = Math.max(c.stall ?? 0, 2 * DT);
  c.vx *= 0.92;
  c.vy *= 0.92;
  c.spin *= 0.9;
  c.invuln = Math.max(c.invuln, 2 * DT);
  if (c.drown >= SINK_TIME) {
    c.lap = c.onLap;
    putBack(w, c, c.onIdx);
  }
  return true;
}
