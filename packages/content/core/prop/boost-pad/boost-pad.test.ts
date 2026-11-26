import { describe, expect, it } from 'vitest';
import { rangeBlast } from '@demodogs/sim';
import { padTest } from '../../../src/testing';

describe('prop.boost-pad', () => {
  it('kicks a car along its arrow and lifts its top speed for a while', () => {
    const plain = padTest(null, 150);
    const r = padTest('prop.boost-pad', 150);
    expect(r.events).toContain('pad');
    expect(r.top).toBeGreaterThan(plain.top + 30);
    expect(r.car.x).toBeGreaterThan(plain.car.x + 20);
  });
  it('pushes the way it points, whichever way the car came', () => {
    const r = padTest('prop.boost-pad', 120, Math.PI);
    expect(r.car.vx).toBeGreaterThan(-100);
  });
  it('keeps the ground under it whole: a blast on or beside it digs no pit there', () => {
    const { world: w } = padTest('prop.boost-pad', 0, 0, 0);
    const pad = w.pads[0]!;
    rangeBlast(w, pad.x, pad.y, 1);
    rangeBlast(w, pad.x + 14, pad.y, 1);
    expect(w.craters).toHaveLength(0);
    // out in the open the same blast digs one, and blasts beside it never widen it under the tile
    for (let i = 0; i < 6; i++) rangeBlast(w, pad.x + 30, pad.y, 1);
    expect(w.craters).toHaveLength(1);
    const c = w.craters[0]!;
    expect(Math.hypot(c.x - pad.x, c.y - pad.y)).toBeGreaterThanOrEqual(pad.def.radius + c.r);
  });
});
