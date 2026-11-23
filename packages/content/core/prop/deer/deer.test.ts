import { describe, expect, it } from 'vitest';
import { critterTest } from '../../../src/testing';

describe('prop.deer', () => {
  it('is too heavy to throw: a car that does catch one bounces off', () => {
    const r = critterTest('prop.deer', 170, -3, true, 150, 20);
    expect(r.flung).toBe(0);
    expect(r.bumped).toBeGreaterThan(0);
    expect(r.slowest).toBeLessThan(60);
  });
  it('moves off when a fast car comes close', () => {
    const r = critterTest('prop.deer', 150, 30);
    expect(r.fled).toBeGreaterThan(0);
  });
});
