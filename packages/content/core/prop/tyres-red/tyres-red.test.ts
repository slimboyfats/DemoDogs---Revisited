import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.tyres-red', () => {
  it('is solid: a car driving into it bounces off', () => {
    const r = propTest('prop.tyres-red', 120);
    expect(r.blocked).toBe(true);
  });
});
