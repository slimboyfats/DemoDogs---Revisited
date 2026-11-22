import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.water-tower', () => {
  it('floods the ground when it is brought down', () => {
    const r = propTest('prop.water-tower', 10);
    const w = r.world;
    const s = r.piece!;
    for (let i = 0; i < 6 && !s.down; i++) explode(w, s.x + 9, s.y, 1.5, null);
    expect(s.down).toBe(true);
    expect(w.spills.filter((p) => p.def.id === 'material.water').length).toBe(9);
  });
});
