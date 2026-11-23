import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.concrete-wall', () => {
  it('stands the blast that brings a brick wall down', () => {
    const r = propTest('prop.concrete-wall', 10);
    const w = r.world;
    const s = r.piece!;
    explode(w, s.x + 8, s.y, 1.2, null);
    explode(w, s.x + 8, s.y, 1.2, null);
    expect(s.down).toBeUndefined();
    expect(s.hp!).toBeLessThan(110);
  });
});
