import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.deck-plank', () => {
  it('is driven over, not into', () => {
    const r = propTest('prop.deck-plank', 120);
    expect(r.blocked).toBe(false);
    expect(r.piece!.down).toBeUndefined();
  });

  it('a mine-sized blast puts a hole in it', () => {
    const r = propTest('prop.deck-plank', 0, 60);
    const s = r.piece!;
    explode(r.world, s.x + 6, s.y, 0.95, null);
    expect(s.down).toBe(true);
  });

  it('burns through', () => {
    const r = propTest('prop.deck-plank', 0, 60);
    const s = r.piece!;
    const w = r.world;
    w.blazes.push({ x: s.x, y: s.y, r: 8, t: 8, bite: 0, owner: -1 });
    for (let i = 0; i < 400 && !s.down; i++) w.step();
    expect(s.down).toBe(true);
  });
});
