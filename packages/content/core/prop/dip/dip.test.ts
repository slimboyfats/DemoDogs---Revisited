import { describe, expect, it } from 'vitest';
import { moundTest } from '../../../src/testing';

describe('prop.dip', () => {
  it('takes a slow car down into it nose first and up out again', () => {
    const r = moundTest('prop.dip', 45, 0.25);
    expect(r.minPitch).toBeLessThan(-0.1);
    expect(r.maxPitch).toBeGreaterThan(0.1);
    expect(r.maxZ).toBeLessThan(1);
  });
  it('throws a fast car off its far lip', () => {
    const r = moundTest('prop.dip', 190);
    expect(r.events).toContain('jolt');
    expect(r.maxZ).toBeGreaterThan(2.5);
    expect(r.car.z).toBe(0);
  });
});
