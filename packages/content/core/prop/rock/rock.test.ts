import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.rock', () => {
  it('is solid: a car driving into it bounces off', () => {
    const r = propTest('prop.rock', 120);
    expect(r.blocked).toBe(true);
  });
});
