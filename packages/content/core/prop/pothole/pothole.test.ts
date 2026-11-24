import { describe, expect, it } from 'vitest';
import { moundTest } from '../../../src/testing';

describe('prop.pothole', () => {
  it('jolts a fast car: it loses speed and bucks', () => {
    const plain = moundTest(null, 170);
    const r = moundTest('prop.pothole', 170);
    expect(r.events).toContain('jolt');
    expect(r.car.x).toBeLessThan(plain.car.x - 4);
    expect(r.maxZ).toBeGreaterThan(1.5);
    expect(r.minPitch).toBeLessThan(-0.05);
  });
  it('knocks the car askew, away from the side the wheel dropped in', () => {
    expect(moundTest('prop.pothole', 170, 1, 3).car.h).toBeLessThan(-0.02);
    expect(moundTest('prop.pothole', 170, 1, -3).car.h).toBeGreaterThan(0.02);
  });
  it('lets a car that creeps through it be', () => {
    const r = moundTest('prop.pothole', 30, 0.15);
    expect(r.events).not.toContain('jolt');
  });
});
