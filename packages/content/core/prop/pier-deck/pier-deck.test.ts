import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.pier-deck', () => {
  it('carries cars across', () => {
    expect(propTest('prop.pier-deck', 60).blocked).toBe(false);
  });

  it('a blast breaks through it and the water comes in', () => {
    const r = propTest('prop.pier-deck', 0);
    const s = r.piece!;
    const w = r.world;
    explode(w, s.x + 4, s.y, 1, null);
    expect(s.down).toBe(true);
    expect(w.spills.some((p) => p.def.id === 'material.brine')).toBe(true);
  });

  it('burns', () => {
    const r = propTest('prop.pier-deck', 0);
    const s = r.piece!;
    r.world.blazes.push({ x: s.x, y: s.y, r: 8, t: 6, bite: 0, owner: -1 });
    for (let i = 0; i < 300; i++) r.world.step();
    expect(s.down).toBe(true);
  });
});
