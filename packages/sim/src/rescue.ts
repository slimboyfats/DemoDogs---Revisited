import { DT } from '@demodogs/shared';
import type { Car } from './entities';
import { waterAt } from './damage';
import { pathAt } from './pads';
import type { World } from './world';

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
    c.downT = 0;
    c.drown = 0;
    return;
  }
  if (drowning(w, c)) return;
  const i = c.idx;
  const R = w.relief;
  const top = R?.plat ? R.platAt(T.x[i]!, T.y[i]!) : 0;
  const below = top >= HIGH && top - R!.platAt(c.x, c.y) > HIGH * 0.75;
  // (a way up the side is the way back: on one it is not off the course)
  const off =
    !R?.slipAt(c.x, c.y) &&
    !pathAt(w, c.x, c.y) &&
    (below || Math.hypot(c.x - T.x[i]!, c.y - T.y[i]!) > w.road / 2 + verge);
  if (!off) {
    c.downT = 0;
    c.onIdx = i;
    c.onLap = c.lap;
    return;
  }
  // (in the air it is not yet waiting)
  if (c.z > 2) return;
  c.downT += DT;
  if (c.downT < rescueGrace + rescueCount) return;
  // the road beside it, unless that is further on than it has driven: then where it left
  const ahead = (c.lap - c.onLap) * T.n + i - c.onIdx > 2;
  putBack(w, c, ahead ? c.onIdx : i, ahead ? c.onLap : c.lap);
}

/** Put car c back on the road at track sample i of lap `lap`, rolling, clear of the others. */
function putBack(w: World, c: Car, i: number, lap: number): void {
  const { rescueSpeed } = w.tuning;
  const x = c.x;
  const y = c.y;
  c.lap = lap;
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
  c.drown = 0;
  c.invuln = Math.max(c.invuln, 1);
  w.emit({ t: 'rescue', car: c.index, x, y });
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
  if (c.drown >= SINK_TIME) putBack(w, c, c.onIdx, c.onLap);
  return true;
}
