import { describe, expect, it } from 'vitest';
import { critterTest, put, trekBench } from '../../../src/testing';

const FILE = {
  prop: 'prop.ducks',
  count: 5,
  gap: 6,
  points: [
    [-120, 0],
    [120, 0],
  ],
  speed: 14,
  every: 40,
  back: true,
};

describe('prop.ducks', () => {
  it('is bowled over by a car, for points', () => {
    const r = critterTest('prop.ducks', 170, 0, true);
    expect(r.flung).toBeGreaterThan(0);
    expect(r.car.score).toBeGreaterThan(0);
  });
  it('crosses in a file, and one knocked out of it runs back to its place', () => {
    const w = trekBench(FILE);
    for (let i = 0; i < 300; i++) w.step();
    const k = w.critters[2]!;
    const c = w.player;
    put(c, k.x, k.y - 50, Math.PI / 2, 170);
    let flung = false;
    for (let i = 0; i < 60; i++) {
      w.step({ steer: 0, throttle: 0, brake: false, boost: false, fire: false });
      if (k.state === 'air') flung = true;
    }
    expect(flung).toBe(true);
    put(c, w.oval!.cx - 250, w.oval!.cy + 250, 0);
    for (let i = 0; i < 400; i++) w.step();
    expect(k.state).toBe('trek');
    // back between its neighbours, a place apart
    expect(w.critters[1]!.x - k.x).toBeCloseTo(6, 1);
    expect(k.y).toBeCloseTo(w.h / 2, 1);
  });
});
