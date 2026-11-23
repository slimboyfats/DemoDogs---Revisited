import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.hay-bale', () => {
  it('rolls off when it is nudged', () => {
    const r = propTest('prop.hay-bale', 60);
    expect(r.prop.alive).toBe(true);
    expect(r.prop.x).toBeGreaterThan(r.start + 3);
  });
  it('bursts when it is hit hard', () => {
    const r = propTest('prop.hay-bale', 175);
    expect(r.prop.alive).toBe(false);
    expect(r.world.player.score).toBe(10);
  });
});
