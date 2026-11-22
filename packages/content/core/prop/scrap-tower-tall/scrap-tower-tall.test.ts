import { describe, expect, it } from 'vitest';
import { batter, stand } from '@demodogs/sim';
import { flatBench } from '../../../src/testing';
import { loadContent } from '../../../src/index';

describe('prop.scrap-tower-tall', () => {
  it('drops five slabs that land further out than a short tower’s', () => {
    const w = flatBench();
    const def = loadContent().prop.get('prop.scrap-tower-tall')!;
    const s = stand(w, def, w.oval!.cx, w.oval!.cy, 0, 0);
    const before = w.props.length;
    batter(w, s, 1000, 'blast', s.x, s.y - 8);
    const slabs = w.props.slice(before);
    expect(slabs.length).toBe(5);
    for (let i = 0; i < 150; i++) w.step();
    expect(Math.max(...slabs.map((p) => p.y - s.y))).toBeGreaterThan(15);
  });
});
