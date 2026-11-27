import { describe, expect, it } from 'vitest';
import { crossingAhead } from '@demodogs/sim';
import { put, trekBench } from '../../../src/testing';

/** A train straight across the bowl, left to right through its middle: an engine and two wagons. */
const LINE = {
  prop: 'prop.train-wagon',
  lead: 'prop.steam-engine',
  count: 3,
  gap: 14,
  points: [
    [-200, 0],
    [200, 0],
  ],
  speed: 80,
  every: 9,
};

describe('prop.steam-engine', () => {
  it('runs to its timetable: where it is depends on the clock alone', () => {
    const w = trekBench(LINE);
    const e = w.critters[0]!;
    expect(e.def.id).toBe('prop.steam-engine');
    const t0 = w.time;
    const x0 = e.x;
    for (let i = 0; i < 60; i++) w.step();
    expect(e.gone).toBe(false);
    expect(e.x - x0).toBeCloseTo(80 * (w.time - t0), 0);
    expect(e.y).toBeCloseTo(w.h / 2, 3);
  });
  it('throws a car that is parked on the line clear, and does not budge for it', () => {
    const w = trekBench(LINE);
    const e = w.critters[0]!;
    const c = w.player;
    put(c, e.x + 60, e.y, Math.PI / 2);
    const hp = c.hp;
    let bumped = 0;
    for (let i = 0; i < 120; i++) {
      w.step();
      for (const ev of w.takeEvents()) if (ev.t === 'critter' && ev.what === 'bump') bumped++;
      expect(e.y).toBeCloseTo(w.h / 2, 3);
    }
    expect(bumped).toBeGreaterThan(0);
    expect(c.hp).toBeLessThan(hp);
    // (the car is off the line, and no part of the train went through it)
    expect(Math.hypot(c.x - e.x, c.y - e.y)).toBeGreaterThan(e.def.radius + 4);
  });
  it('is waited for by a driver whose way it is about to cross, and by no other', () => {
    const w = trekBench(LINE);
    const e = w.critters[0]!;
    const c = w.player;
    // heading up at the line, a second short of where the engine will be in a second
    put(c, e.x + 80, e.y + 100, -Math.PI / 2);
    c.vx = 0;
    c.vy = -100;
    c.vf = 100;
    expect(crossingAhead(w, c)).toBeLessThan(100);
    // the same car far down the line, where the train will not be for seconds
    put(c, e.x + 380, e.y + 100, -Math.PI / 2);
    c.vf = 100;
    expect(crossingAhead(w, c)).toBe(Infinity);
    // and one driving away from the line has nothing to wait for
    put(c, e.x + 80, e.y + 100, Math.PI / 2);
    c.vf = 100;
    expect(crossingAhead(w, c)).toBe(Infinity);
  });
  it('is gone at the end of the line, and sets out again when its time comes round', () => {
    const w = trekBench(LINE);
    const e = w.critters[0]!;
    const seen: boolean[] = [];
    for (let i = 0; i < 60 * 12; i++) {
      w.step();
      seen.push(!!e.gone);
    }
    expect(seen.some((g) => g)).toBe(true);
    expect(seen.lastIndexOf(false)).toBeGreaterThan(seen.indexOf(true));
  });
});
