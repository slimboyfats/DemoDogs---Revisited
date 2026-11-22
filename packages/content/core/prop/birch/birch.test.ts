import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.birch', () => {
  it('a blast nearby tears leaves off it and leaves it standing', () => {
    const r = propTest('prop.birch', 5);
    const w = r.world;
    const s = r.piece!;
    expect(s.leaves).toBe(1);
    w.takeEvents();
    explode(w, s.x + 60, s.y, 1, null);
    expect(s.down).toBeUndefined();
    expect(s.leaves).toBeLessThan(0.85);
    const e = w.takeEvents().find((e) => e.t === 'strip');
    expect(e && e.t === 'strip' && e.by).toBe('blast');
  });

  it('is thin: a fast car snaps it', () => {
    const r = propTest('prop.birch', 190);
    expect(r.piece!.down).toBe(true);
  });
});
