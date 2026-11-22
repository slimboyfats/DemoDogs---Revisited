import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.chimney', () => {
  it('takes blast after blast before it comes down', () => {
    const r = propTest('prop.chimney', 10);
    const w = r.world;
    const s = r.piece!;
    let n = 0;
    while (!s.down && n < 12) {
      explode(w, s.x + 9, s.y, 1.2, null);
      n++;
    }
    expect(s.down).toBe(true);
    expect(n).toBeGreaterThan(3);
  });
});
