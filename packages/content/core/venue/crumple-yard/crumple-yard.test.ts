import { describe, expect, it } from 'vitest';
import { CAR_RADIUS } from '@demodogs/shared';
import { makeWorld, runUntil } from '../../../src/testing';

describe('venue.crumple-yard', () => {
  it('has its crusher in the middle, scrap towers and oil on the ground', () => {
    const w = makeWorld({ venue: 'venue.crumple-yard' });
    const O = w.oval!;
    const crusher = w.statics.find((s) => s.def.press);
    expect(crusher).toBeDefined();
    expect(Math.hypot(crusher!.x - O.cx, crusher!.y - O.cy)).toBeLessThan(1);
    expect(w.statics.filter((s) => s.def.topple).length).toBeGreaterThanOrEqual(16);
    expect(w.spills.filter((s) => s.def.id === 'material.oil').length).toBeGreaterThan(8);
  });

  it('starts no car inside a piece of scenery', () => {
    const w = makeWorld({ venue: 'venue.crumple-yard' });
    for (const c of w.cars)
      for (const s of w.statics)
        if (s.def.solid)
          expect(Math.hypot(c.x - s.x, c.y - s.y)).toBeGreaterThan(s.def.radius + CAR_RADIUS);
  });

  it('an all-AI derby runs to the end: towers come down and cars stay in the bowl', () => {
    const w = makeWorld({
      venue: 'venue.crumple-yard',
      car: 'car.bruiser',
      autopilot: true,
      seed: 4,
    });
    let slams = 0;
    let falls = 0;
    runUntil(
      w,
      (w) => {
        for (const e of w.takeEvents()) {
          if (e.t === 'press') slams++;
          if (e.t === 'fall') falls++;
        }
        return w.phase === 'over';
      },
      60 * 200,
    );
    expect(w.phase).toBe('over');
    expect(slams).toBeGreaterThan(5);
    expect(falls).toBeGreaterThan(0);
    const O = w.oval!;
    for (const c of w.cars)
      expect(Math.hypot((c.x - O.cx) / O.rx, (c.y - O.cy) / O.ry)).toBeLessThan(1.01);
  });
});
