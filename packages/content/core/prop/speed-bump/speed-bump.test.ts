import { describe, expect, it } from 'vitest';
import { moundTest } from '../../../src/testing';

describe('prop.speed-bump', () => {
  it('tips a car nose up and then tail up as it rolls over', () => {
    const r = moundTest('prop.speed-bump', 50, 0.3);
    expect(r.maxPitch).toBeGreaterThan(0.08);
    expect(r.minPitch).toBeLessThan(-0.08);
    expect(r.maxZ).toBeLessThan(1);
    expect(Math.abs(r.car.pitch)).toBeLessThan(0.02);
  });
  it('throws a fast car off the ground, and it lands again', () => {
    const r = moundTest('prop.speed-bump', 190);
    expect(r.events).toContain('jolt');
    expect(r.maxZ).toBeGreaterThan(2.5);
    expect(r.maxZ).toBeLessThan(14);
    expect(r.car.z).toBe(0);
  });
  it('leaves a car on bare ground alone', () => {
    const r = moundTest(null, 190);
    expect(r.maxZ).toBe(0);
    expect(r.maxPitch).toBe(0);
  });
});
