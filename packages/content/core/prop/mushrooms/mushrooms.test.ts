import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.mushrooms', () => {
  it('goes down under a car that drives over it, without slowing it', () => {
    const r = propTest('prop.mushrooms', 120);
    expect(r.blocked).toBe(false);
    expect(r.piece!.down).toBe(true);
    expect(r.events).toContain('trample');
    expect(r.world.player.vx).toBeGreaterThan(55);
  });
});
