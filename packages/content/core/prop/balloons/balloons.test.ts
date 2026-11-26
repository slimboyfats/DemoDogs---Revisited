import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.balloons', () => {
  it('pops under a car, which does not slow', () => {
    const r = propTest('prop.balloons', 150);
    expect(r.piece!.down).toBe(true);
    expect(r.blocked).toBe(false);
    expect(r.world.player.vx).toBeGreaterThan(45);
  });
});
