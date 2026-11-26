import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.sandcastle', () => {
  it('is flattened by a car that barely slows', () => {
    const r = propTest('prop.sandcastle', 150);
    expect(r.piece!.down).toBe(true);
    expect(r.blocked).toBe(false);
    expect(r.world.player.vx).toBeGreaterThan(45);
  });
});
