import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.tumbleweed', () => {
  it('is thrown high and far by a car, and is never broken', () => {
    const r = propTest('prop.tumbleweed', 140);
    expect(r.maxZ).toBeGreaterThan(12);
    expect(r.prop.alive).toBe(true);
    expect(r.blocked).toBe(false);
  });
});
