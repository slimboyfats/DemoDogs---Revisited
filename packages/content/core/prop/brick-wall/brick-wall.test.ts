import { describe, expect, it } from 'vitest';
import { batter, explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.brick-wall', () => {
  it('stops a slow car and loses bricks to a hard one', () => {
    expect(propTest('prop.brick-wall', 40).blocked).toBe(true);
    const r = propTest('prop.brick-wall', 150);
    const s = r.piece!;
    expect(r.events).toContain('chip');
    expect(s.hp!).toBeLessThan(70);
  });

  it('comes down in a blast, and then nothing is in the way', () => {
    const r = propTest('prop.brick-wall', 10);
    const w = r.world;
    const s = r.piece!;
    explode(w, s.x + 8, s.y, 1.2, null);
    explode(w, s.x + 8, s.y, 1.2, null);
    expect(s.down).toBe(true);
    expect(w.takeEvents().map((e) => e.t)).toContain('fall');
    expect(w.free(s.x, s.y, 2)).toBe(true);
    expect(batter(w, s, 50, 'blast', s.x, s.y)).toBe(false);
  });
});
