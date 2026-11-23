import { describe, expect, it } from 'vitest';
import { propTest, runUntil } from '../../../src/testing';

describe('prop.snag', () => {
  it('has no leaves to lose, and burns down fast', () => {
    const r = propTest('prop.snag', 5);
    const w = r.world;
    const s = r.piece!;
    expect(s.leaves).toBeUndefined();
    w.blazes.push({ x: s.x, y: s.y, r: 9, t: 8, bite: 0, owner: -1 });
    runUntil(w, () => s.down === true, 60 * 8);
    expect(s.down).toBe(true);
  });
});
