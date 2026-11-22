import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.cone', () => {
  it('flies when hit', () => {
    const r = propTest('prop.cone', 120, 6);
    expect(r.maxZ).toBeGreaterThan(5);
    expect(r.prop.alive).toBe(true);
  });
});
