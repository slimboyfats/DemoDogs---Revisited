import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.pumpkin', () => {
  it('bursts under a car, for a few points', () => {
    const r = propTest('prop.pumpkin', 120);
    expect(r.prop.alive).toBe(false);
    expect(r.world.player.score).toBe(5);
  });
});
