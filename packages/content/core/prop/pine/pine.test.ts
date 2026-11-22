import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.pine', () => {
  it('is solid: a car driving into it bounces off', () => {
    const r = propTest('prop.pine', 120);
    expect(r.blocked).toBe(true);
  });
});
