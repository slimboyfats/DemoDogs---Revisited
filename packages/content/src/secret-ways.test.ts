import { describe, expect, it } from 'vitest';
import { leapGaps, leapPieces, type World } from '@demodogs/sim';
import { loadContent } from './index';
import { makeWorld, put } from './testing';

const C = loadContent();
/** The race venues with a secret way: a takeoff, a gap and a landing across it. */
const VENUES = [...C.venue.values()].filter((v) => leapGaps(leapPieces(v, C)).length > 0);

/**
 * Drive the player flat out up the takeoff of venue `id`'s first jump, from well back on the
 * straight before it, boosting or not, and say whether it came down on the landing or in the gap.
 */
function leap(id: string, boost: boolean): boolean {
  const w: World = makeWorld({ venue: id, rivals: 0 } as never);
  w.phase = 'race';
  const R = w.relief!;
  const [x0, y0, x1, y1] = leapGaps(leapPieces(w.venue, C))[0]!;
  const a = Math.atan2(y1 - y0, x1 - x0);
  const gap = Math.hypot(x1 - x0, y1 - y0);
  const c = w.player;
  // a run-up as long as the straight before the lip: the takeoff and 60 px of path
  put(c, x0 - Math.cos(a) * 188, y0 - Math.sin(a) * 188, a, 150);
  for (let t = 0; t < 60 * 5; t++) {
    const past = (c.x - x0) * Math.cos(a) + (c.y - y0) * Math.sin(a);
    // (held on the line, as a driver would)
    const off = -(c.x - x0) * Math.sin(a) + (c.y - y0) * Math.cos(a);
    let d = a - c.h - off * 0.01;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    w.step({
      steer: past > 0 ? 0 : Math.max(-1, Math.min(1, d * 3)),
      throttle: 1,
      brake: false,
      boost: boost && past < 0,
      fire: false,
    });
    if (past > 24 && c.z < 0.5) return past > gap && R.at(c.x, c.y) > 6;
  }
  return false;
}

describe('secret ways', () => {
  it('every big course has one', () => expect(VENUES.length).toBe(5));
  for (const v of VENUES)
    it(`${v.id}: the gap is cleared with boost and not without`, () => {
      expect(leap(v.id, true)).toBe(true);
      expect(leap(v.id, false)).toBe(false);
    });
});
