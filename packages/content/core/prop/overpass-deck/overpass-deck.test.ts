import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.overpass-deck', () => {
  it('is high enough to drive under', () => {
    const r = propTest('prop.overpass-deck', 90);
    expect(r.blocked).toBe(false);
    expect(r.piece!.down).toBeFalsy();
    expect(r.world.player.x).toBeGreaterThan(r.piece!.x + 10);
  });
});
