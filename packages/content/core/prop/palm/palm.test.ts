import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';
import look from './look';

describe('prop.palm', () => {
  it('is solid at the trunk: a car bounces off', () => {
    expect(propTest('prop.palm', 110).blocked).toBe(true);
  });
  it('has a crown of fronds well above a bare trunk', () => {
    const L = look.look;
    if (L.kind !== 'prop') throw new Error('not a prop');
    let low = 0;
    let high = 0;
    for (let x = -12; x <= 12; x += 0.5)
      for (let y = -12; y <= 12; y += 0.5) {
        if (Math.hypot(x, y) < 4) continue;
        for (let z = 0; z < 25; z += 0.5)
          if (L.part.fn(x, y, z)) {
            if (z < 12) low++;
            else high++;
          }
      }
    expect(low).toBe(0);
    expect(high).toBeGreaterThan(400);
  });
});
