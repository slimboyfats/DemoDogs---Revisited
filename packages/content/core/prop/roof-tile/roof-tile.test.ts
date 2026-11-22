import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.roof-tile', () => {
  it('burns through in a fire', () => {
    const r = propTest('prop.roof-tile', 10);
    const w = r.world;
    const s = r.piece!;
    w.blazes.push({ x: s.x, y: s.y, r: 9, t: 6, bite: 0, owner: -1 });
    for (let i = 0; i < 300; i++) w.step();
    expect(s.down).toBe(true);
  });
});
