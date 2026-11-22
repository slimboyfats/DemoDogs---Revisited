import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.deck-steel', () => {
  it('is driven over, and stands the blast that holes a plank deck', () => {
    const r = propTest('prop.deck-steel', 120);
    expect(r.blocked).toBe(false);
    const s = r.piece!;
    explode(r.world, s.x + 6, s.y, 0.95, null);
    expect(s.down).toBeUndefined();
  });

  it('gives way to a few rockets in the same place', () => {
    const r = propTest('prop.deck-steel', 0, 60);
    const s = r.piece!;
    for (let i = 0; i < 4; i++) explode(r.world, s.x + 4, s.y, 0.85, null);
    expect(s.down).toBe(true);
  });
});
