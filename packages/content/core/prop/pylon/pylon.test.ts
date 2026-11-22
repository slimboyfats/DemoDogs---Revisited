import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.pylon', () => {
  it('a car cannot ram it down, but explosives can', () => {
    const r = propTest('prop.pylon', 190);
    expect(r.blocked).toBe(true);
    const w = r.world;
    const s = r.piece!;
    expect(s.down).toBeUndefined();
    for (let i = 0; i < 12 && !s.down; i++) explode(w, s.x + 9, s.y, 1.5, null);
    expect(s.down).toBe(true);
  });
});
