import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.tennis-ball', () => {
  it('is sent bounding away by a car, which drives on, and is never broken', () => {
    const r = propTest('prop.tennis-ball', 140);
    expect(r.maxZ).toBeGreaterThan(8);
    expect(r.prop.alive).toBe(true);
    expect(r.blocked).toBe(false);
  });
});
