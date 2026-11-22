import { DT } from '@demodogs/shared';
import type { Car } from './entities';
import { angDiff } from './math';
import type { World } from './world';

/**
 * Track a car's place on the course: the nearest sample, searched near the last one so a car cannot
 * jump to another part of the track across the grass. Crossing the line forwards adds a lap,
 * backwards takes one off.
 */
export function trackIndex(w: World, c: Car): void {
  const T = w.track!;
  const N = T.n;
  let best = c.idx;
  let bd = 1e12;
  for (let o = -24; o <= 24; o++) {
    const i = (c.idx + o + N) % N;
    const dx = T.x[i]! - c.x;
    const dy = T.y[i]! - c.y;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  if (bd > 130 * 130) {
    const g = w.grid!.nearest(c.x, c.y);
    if (g >= 0) best = g;
  }
  const delta = best - c.idx;
  if (delta < -N / 2) {
    c.lap++;
    if (c.lap === w.laps && c.isPlayer) w.emit({ t: 'final-lap', car: c.index });
  } else if (delta > N / 2) c.lap--;
  c.idx = best;
  c.progress = c.lap * T.len + T.s[best]!;
  if (!c.finished && c.lap > w.laps && w.phase === 'race') {
    c.finished = true;
    c.finishTime = w.raceTime;
    w.finishers.push(c.index);
    w.emit({ t: 'finish', car: c.index, place: w.finishers.length });
    if (c.isPlayer) w.endT = 2.8;
  }
  if (c.isPlayer) {
    const wrong = Math.abs(angDiff(c.h, T.a[best]!)) > 2.1 && c.vf > 15;
    c.wrongT = wrong ? c.wrongT + DT : 0;
  }
}

/** Race: finishers in order, then the rest by progress. Derby: survivors by score, then the wrecked, last out first. */
export function standings(w: World): Car[] {
  if (w.kind === 'race') {
    const done = w.finishers.map((i) => w.cars[i]!);
    const rest = w.cars
      .filter((c) => !c.finished)
      .sort((a, b) => b.progress - a.progress || a.index - b.index);
    return [...done, ...rest];
  }
  return w.cars.slice().sort((a, b) => {
    if (a.wrecked !== b.wrecked) return a.wrecked ? 1 : -1;
    if (a.wrecked && b.wrecked) return b.wreckTick - a.wreckTick || b.score - a.score;
    return b.score - a.score || a.index - b.index;
  });
}
