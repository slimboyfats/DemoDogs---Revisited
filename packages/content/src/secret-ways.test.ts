import { describe, expect, it } from 'vitest';
import {
  PLUNGE_TIME,
  inPit,
  leapGaps,
  leapPieces,
  type StaticProp,
  type World,
} from '@demodogs/sim';
import { loadContent } from './index';
import { makeWorld, put } from './testing';

const C = loadContent();
/** The race venues with a secret way: a takeoff, a gap and a landing across it. */
const VENUES = [...C.venue.values()].filter((v) => leapGaps(leapPieces(v, C)).length > 0);

/** What shuts venue `w`'s secret way: its cracked walls or its bollards. */
const gateOf = (w: World): StaticProp[] =>
  w.statics.filter((s) => s.def.gate || s.def.made === 'material.cracked-rock');

/** A race on venue `id` with nobody else in it, and the first jump on it: lip, far side, heading, gap. */
function jump(id: string) {
  const w: World = makeWorld({ venue: id, rivals: 0 } as never);
  w.phase = 'race';
  const [x0, y0, x1, y1] = leapGaps(leapPieces(w.venue, C))[0]!;
  const a = Math.atan2(y1 - y0, x1 - x0);
  return { w, x0, y0, a, gap: Math.hypot(x1 - x0, y1 - y0) };
}

/**
 * Drive the player flat out up the takeoff of venue `id`'s first jump, from well back on the
 * straight before it, boosting or not, with the way's gate open or shut, and say whether it came
 * down on the landing. `after` more ticks are run once it is down.
 */
function leap(id: string, boost: boolean, open = true, after = 0): { made: boolean; w: World } {
  const { w, x0, y0, a, gap } = jump(id);
  const R = w.relief!;
  if (open)
    for (const s of gateOf(w)) {
      s.down = true;
      s.openT = 99;
    }
  const c = w.player;
  // a run-up as long as the straight before the lip: the takeoff and 60 px of path
  put(c, x0 - Math.cos(a) * 188, y0 - Math.sin(a) * 188, a, 150);
  let made = false;
  for (let t = 0; t < 60 * 5; t++) {
    const past = (c.x - x0) * Math.cos(a) + (c.y - y0) * Math.sin(a);
    // (held on the line, as a driver would)
    const off = -(c.x - x0) * Math.sin(a) + (c.y - y0) * Math.cos(a);
    let d = a - c.h - off * 0.01;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    // (a gate on a beat is held down, tick by tick)
    if (open) for (const s of gateOf(w)) s.down = true;
    w.step({
      steer: past > 0 ? 0 : Math.max(-1, Math.min(1, d * 3)),
      throttle: 1,
      brake: false,
      boost: boost && past < 0,
      fire: false,
    });
    if (past > 24 && c.z < 0.5) {
      made = past > gap && R.at(c.x, c.y) > 6;
      break;
    }
  }
  for (let t = 0; t < after; t++) w.step();
  return { made, w };
}

describe('secret ways', () => {
  it('every big course has one', () => expect(VENUES.length).toBe(5));
  for (const v of VENUES) {
    it(`${v.id}: the gap is cleared with boost and not without`, () => {
      expect(leap(v.id, true).made).toBe(true);
      expect(leap(v.id, false).made).toBe(false);
    });

    it(`${v.id}: the gate stands across the takeoff where its sides are too high to climb`, () => {
      const { w, x0, y0, a } = jump(v.id);
      const R = w.relief!;
      const gate = gateOf(w);
      expect(gate.length).toBeGreaterThan(3);
      // every post up on the ramp, and no room for a car between them or past the last
      const across = gate
        .map((s) => -(s.x - x0) * Math.sin(a) + (s.y - y0) * Math.cos(a))
        .sort((p, q) => p - q);
      for (const s of gate) expect(R.platAt(s.x, s.y)).toBeGreaterThan(12);
      const r = gate[0]!.def.radius;
      expect(across[0]! - r).toBeLessThan(-32 + 8);
      expect(across[across.length - 1]! + r).toBeGreaterThan(32 - 8);
      for (let k = 1; k < across.length; k++)
        expect(across[k]! - across[k - 1]! - 2 * r).toBeLessThan(8);
      // shut, it stops a car that comes flat out with boost (one on a beat is not shut for long)
      if (!gate[0]!.def.gate?.period) expect(leap(v.id, true, false).made).toBe(false);
    });

    it(`${v.id}: there is no way onto the takeoff from beside it past the gate`, () => {
      for (const side of [-1, 1]) {
        const { w, x0, y0, a } = jump(v.id);
        const c = w.player;
        // beside the ramp, 30 px short of its lip, driven straight at its side
        const bx = x0 - Math.cos(a) * 30 - Math.sin(a) * side * 70;
        const by = y0 - Math.sin(a) * 30 + Math.cos(a) * side * 70;
        put(c, bx, by, a - (side * Math.PI) / 2, 150);
        // (the ramp is 64 px across: its middle is never reached)
        let near = 99;
        for (let t = 0; t < 90; t++) {
          w.step({ steer: 0, throttle: 1, brake: false, boost: true, fire: false });
          near = Math.min(near, Math.abs(-(c.x - x0) * Math.sin(a) + (c.y - y0) * Math.cos(a)));
        }
        expect(near).toBeGreaterThan(30);
      }
    });

    it(`${v.id}: a car that falls short lies in the pool under the jump and is put back on the road`, () => {
      const { w } = leap(v.id, false);
      const c = w.player;
      expect(w.pits.length).toBe(1);
      expect(inPit(w, c.x, c.y)).toBe(true);
      const left = c.onIdx;
      let fell = 0;
      let back = 0;
      for (let t = 0; t < PLUNGE_TIME * 60 + 30; t++) {
        w.step({ steer: 0, throttle: 1, brake: false, boost: false, fire: false });
        for (const e of w.takeEvents()) {
          if (e.t === 'plunge') fell++;
          if (e.t === 'rescue' && e.fell) back++;
        }
      }
      expect(fell + back).toBe(2);
      expect(w.grid!.at(c.x, c.y)).toBeLessThan(w.road / 2);
      expect(Math.abs(c.idx - left)).toBeLessThan(30);
    });
  }

  it('a path is part of the course, but a car put back from one goes to where it left the road', () => {
    const { w, x0, y0, a } = jump('venue.bonefish-bay');
    const c = w.player;
    for (let t = 0; t < 5; t++) w.step();
    const left = c.onIdx;
    // on the takeoff, well up the way from where it forked off
    put(c, x0 - Math.cos(a) * 100, y0 - Math.sin(a) * 100, a, 0);
    for (let t = 0; t < 120; t++) w.step();
    expect(c.downT).toBe(0);
    expect(c.onIdx).toBe(left);
  });
});
