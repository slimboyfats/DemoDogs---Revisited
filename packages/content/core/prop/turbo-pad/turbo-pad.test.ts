import { describe, expect, it } from 'vitest';
import { padTest } from '../../../src/testing';

describe('prop.turbo-pad', () => {
  it('kicks a car along its arrow and lifts its top speed for a while', () => {
    const plain = padTest(null, 150);
    const r = padTest('prop.turbo-pad', 150);
    expect(r.events).toContain('pad');
    expect(r.top).toBeGreaterThan(plain.top + 30);
    expect(r.car.x).toBeGreaterThan(plain.car.x + 20);
  });
  it('pushes the way it points, whichever way the car came', () => {
    const r = padTest('prop.turbo-pad', 120, Math.PI);
    expect(r.car.vx).toBeGreaterThan(-100);
  });
});
