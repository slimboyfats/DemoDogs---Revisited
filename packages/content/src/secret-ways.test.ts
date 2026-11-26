import { describe, expect, it } from 'vitest';
import type { World } from '@demodogs/sim';
import { loadContent } from './index';
import { makeWorld, put } from './testing';

/** The race venues whose relief has a secret way: a raised trail that ends in a gap, and the trail past it. */
const VENUES = [...loadContent().venue.values()].filter((v) => (v.relief?.trails.length ?? 0) >= 2);

/**
 * Drive the player up the trail before the first gap of venue `id` to its lip, flat out, boosting
 * over the last stretch or not, and say whether it came down on the far side or in the gap.
 */
function leap(id: string, boost: boolean): { far: boolean; gap: number } {
  const w: World = makeWorld({ venue: id, rivals: 0 } as never);
  w.phase = 'race';
  const R = w.relief!;
  const A = w.venue.relief!.trails[0]!.points;
  const B = w.venue.relief!.trails[1]!.points;
  const [lx, ly] = A[A.length - 1]!;
  const [bx, by] = B[0]!;
  // from where the trail leaves the road
  const k = 0;
  const c = w.player;
  const [sx, sy] = A[k]!;
  put(c, sx, sy, Math.atan2(A[k + 1]![1] - sy, A[k + 1]![0] - sx), 150);
  const gap = Math.hypot(bx - lx, by - ly);
  let j = k + 1;
  for (let t = 0; t < 60 * 6; t++) {
    while (j < A.length - 1 && Math.hypot(A[j]![0] - c.x, A[j]![1] - c.y) < 30) j++;
    const past = (c.x - lx) * (bx - lx) + (c.y - ly) * (by - ly);
    // (on the last straight, aim at the landing, as a driver would)
    const close = Math.hypot(lx - c.x, ly - c.y) < 140;
    const want = close
      ? Math.atan2(by - c.y, bx - c.x)
      : Math.atan2(A[j]![1] - c.y, A[j]![0] - c.x);
    let d = want - c.h;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    w.step({
      steer: past > 0 ? 0 : Math.max(-1, Math.min(1, d * 3)),
      throttle: 1,
      brake: false,
      boost: boost && past < 0 && Math.hypot(lx - c.x, ly - c.y) < 320,
      fire: false,
    });
    if (past / gap > 24 && c.z < 0.5) {
      const along = past / gap;
      return { far: R.at(c.x, c.y) > 8, gap: along };
    }
  }
  return { far: false, gap };
}

describe('secret ways', () => {
  it('every big course has one', () => expect(VENUES.length).toBe(5));
  for (const v of VENUES)
    it(`${v.id}: the gap is cleared with boost and not without`, () => {
      expect(leap(v.id, true).far).toBe(true);
      expect(leap(v.id, false).far).toBe(false);
    });
});
