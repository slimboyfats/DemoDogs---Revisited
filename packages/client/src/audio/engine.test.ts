import { describe, expect, it } from 'vitest';
import { GEARS, gearFor, revs } from './engine';

describe('engine gears', () => {
  it('changes up as the car gathers speed and the revs drop on each change', () => {
    let gear = 0;
    let last = revs(0, 0);
    let changes = 0;
    for (let f = 0; f <= 1; f += 0.005) {
      const g = gearFor(f, gear);
      const r = revs(f, g);
      if (g !== gear) {
        changes++;
        expect(r).toBeLessThan(last - 0.2);
      } else expect(r).toBeGreaterThanOrEqual(last);
      gear = g;
      last = r;
    }
    expect(changes).toBe(GEARS.length - 1);
    expect(last).toBeGreaterThan(0.85);
  });

  it('does not hunt between two gears at the speed of a change', () => {
    const up = gearFor(GEARS[1] + 0.01, 1);
    expect(up).toBe(2);
    expect(gearFor(GEARS[1] - 0.01, up)).toBe(2);
    expect(gearFor(GEARS[1] - 0.08, up)).toBe(1);
  });

  it('ticks over at a standstill and comes down through the gears', () => {
    expect(revs(0, 0)).toBeLessThan(0.2);
    expect(gearFor(0, 4)).toBe(0);
    expect(gearFor(2, 0)).toBe(GEARS.length - 1);
  });
});
