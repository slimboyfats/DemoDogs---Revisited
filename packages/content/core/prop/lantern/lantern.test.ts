import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.lantern', () => {
  it('goes down under a car, which drives on', () => {
    const r = propTest('prop.lantern', 150);
    expect(r.piece!.down).toBe(true);
    expect(r.blocked).toBe(false);
    expect(r.world.player.vx).toBeGreaterThan(45);
  });
});
