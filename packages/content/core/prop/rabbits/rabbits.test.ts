import { describe, expect, it } from 'vitest';
import { critterTest } from '../../../src/testing';

describe('prop.rabbits', () => {
  it('runs from a fast car that comes near', () => {
    const r = critterTest('prop.rabbits', 150, 26);
    expect(r.fled).toBeGreaterThan(0);
    expect(r.flung).toBe(0);
  });
  it('is knocked flying by a car that hits it, lands and gets up', () => {
    const r = critterTest('prop.rabbits', 170, 0, true, 150, 16);
    expect(r.flung).toBeGreaterThan(0);
    expect(r.blocked).toBe(false);
    expect(r.critters.every((k) => k.z === 0 && k.state !== 'air')).toBe(true);
  });
});
