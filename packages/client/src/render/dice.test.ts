import { describe, expect, it } from 'vitest';
import { roll, seedDice } from './dice';

describe('the effects dice', () => {
  it('rolls from 0 up to 1, evenly', () => {
    seedDice(7);
    const bins = new Array<number>(10).fill(0);
    let sum = 0;
    for (let i = 0; i < 100000; i++) {
      const r = roll();
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
      bins[Math.floor(r * 10)]!++;
      sum += r;
    }
    expect(sum / 100000).toBeCloseTo(0.5, 2);
    for (const b of bins) expect(Math.abs(b - 10000)).toBeLessThan(400);
  });

  it('rolls the same from the same seed, and never sticks at a seed of 0', () => {
    seedDice(42);
    const a = [roll(), roll(), roll()];
    seedDice(42);
    expect([roll(), roll(), roll()]).toEqual(a);
    seedDice(0);
    expect(roll()).not.toBe(roll());
  });
});
