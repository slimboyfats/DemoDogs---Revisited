import { describe, expect, it } from 'vitest';
import { critterTest } from '../../../src/testing';

describe('prop.cow', () => {
  it('stands its ground: the car that hits it bounces off', () => {
    const r = critterTest('prop.cow', 170, 0, true);
    expect(r.flung).toBe(0);
    expect(r.bumped).toBeGreaterThan(0);
    expect(r.slowest).toBeLessThan(60);
  });
  it('moves off when a fast car comes close', () => {
    const r = critterTest('prop.cow', 150, 10);
    expect(r.fled).toBeGreaterThan(0);
  });
});
