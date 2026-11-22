import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.brick-post', () => {
  it('takes more than the wall does', () => {
    const r = propTest('prop.brick-post', 10);
    const w = r.world;
    const s = r.piece!;
    explode(w, s.x + 8, s.y, 1.2, null);
    explode(w, s.x + 8, s.y, 1.2, null);
    expect(s.down).toBeUndefined();
    explode(w, s.x + 8, s.y, 1.2, null);
    expect(s.down).toBe(true);
  });
});
