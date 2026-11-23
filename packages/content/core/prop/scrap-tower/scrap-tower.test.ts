import { describe, expect, it } from 'vitest';
import { batter, stand } from '@demodogs/sim';
import { flatBench, propTest } from '../../../src/testing';
import { loadContent } from '../../../src/index';

describe('prop.scrap-tower', () => {
  it('is solid: a slow car bounces off', () => {
    expect(propTest('prop.scrap-tower', 60).blocked).toBe(true);
  });

  it('topples: its slabs drop off and tumble away from what knocked it', () => {
    const w = flatBench();
    const def = loadContent().prop.get('prop.scrap-tower')!;
    const s = stand(w, def, w.oval!.cx, w.oval!.cy, 0, 0);
    const before = w.props.length;
    // struck from the west
    expect(batter(w, s, 1000, 'blast', s.x - 7, s.y)).toBe(true);
    const slabs = w.props.slice(before);
    expect(slabs.length).toBe(3);
    expect(slabs.every((p) => p.z > 0)).toBe(true);
    for (let i = 0; i < 120; i++) w.step();
    expect(slabs.every((p) => p.z === 0)).toBe(true);
    expect(slabs.reduce((m, p) => m + p.x, 0) / 3).toBeGreaterThan(s.x + 4);
  });

  it('a falling slab can bring down the tower next to it', () => {
    const w = flatBench();
    const def = loadContent().prop.get('prop.scrap-tower')!;
    const a = stand(w, def, w.oval!.cx, w.oval!.cy, 0, 0);
    const b = stand(w, def, a.x + 13, a.y, 0, 0);
    b.hp = 4;
    batter(w, a, 1000, 'blast', a.x - 7, a.y);
    for (let i = 0; i < 120; i++) w.step();
    expect(b.down).toBe(true);
  });
});
