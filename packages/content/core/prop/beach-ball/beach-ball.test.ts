import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.beach-ball', () => {
  it('is knocked high and far by a car, which hardly slows', () => {
    const r = propTest('prop.beach-ball', 150);
    expect(r.blocked).toBe(false);
    expect(r.maxZ).toBeGreaterThan(6);
    expect(r.prop.x).toBeGreaterThan(r.start + 30);
    expect(r.world.player.vx).toBeGreaterThan(60);
  });
});
