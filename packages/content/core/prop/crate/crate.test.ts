import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.crate', () => {
  it('splinters when hit hard, scoring for the car', () => {
    const r = propTest('prop.crate', 150);
    expect(r.prop.alive).toBe(false);
    expect(r.events).toContain('break');
    expect(r.world.player.score).toBe(25);
  });
});
