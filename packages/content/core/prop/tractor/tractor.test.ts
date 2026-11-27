import { describe, expect, it } from 'vitest';
import { put, trekBench } from '../../../src/testing';

const RUN = {
  prop: 'prop.tractor',
  points: [
    [-150, 40],
    [150, 40],
  ],
  speed: 22,
  every: 30,
  back: true,
};

describe('prop.tractor', () => {
  it('drives to the end of its run, waits, and comes back the way it went', () => {
    const w = trekBench(RUN);
    const k = w.critters[0]!;
    let far = k.x;
    let near = k.x;
    let turned = 0;
    for (let i = 0; i < 60 * 30; i++) {
      const was = k.vx;
      w.step();
      far = Math.max(far, k.x);
      near = Math.min(near, k.x);
      if (was * k.vx < 0 || (was === 0 && k.vx !== 0)) turned++;
      expect(k.gone).toBe(false);
    }
    expect(far).toBeCloseTo(w.w / 2 + 150, 0);
    expect(near).toBeCloseTo(w.w / 2 - 150, 0);
    expect(turned).toBeGreaterThan(1);
  });
  it('stops a car that drives into its side', () => {
    const w = trekBench(RUN);
    for (let i = 0; i < 60; i++) w.step();
    const k = w.critters[0]!;
    const c = w.player;
    put(c, k.x + k.vx * 0.25, k.y - 40, Math.PI / 2, 120);
    let least = 120;
    for (let i = 0; i < 60; i++) {
      w.step({ steer: 0, throttle: 0, brake: false, boost: false, fire: false });
      least = Math.min(least, c.vy);
    }
    expect(least).toBeLessThan(20);
    expect(k.y).toBeCloseTo(w.h / 2 + 40, 3);
  });
});
