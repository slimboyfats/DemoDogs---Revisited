import { describe, expect, it } from 'vitest';
import { padTest } from '../../../src/testing';

describe('prop.paw-pad', () => {
  it('kicks a car along its arrows and lifts its top speed for a while', () => {
    const plain = padTest(null, 150);
    const r = padTest('prop.paw-pad', 150);
    expect(r.events).toContain('pad');
    expect(r.top).toBeGreaterThan(plain.top + 30);
    expect(r.car.x).toBeGreaterThan(plain.car.x + 20);
  });
});
