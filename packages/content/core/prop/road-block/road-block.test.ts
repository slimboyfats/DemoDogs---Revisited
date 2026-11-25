import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.road-block', () => {
  it('stops a car that drives into it', () => {
    const r = propTest('prop.road-block', 60);
    expect(r.blocked).toBe(true);
    expect(r.piece!.down).toBeFalsy();
  });

  it('is scarred by a blast but stands', () => {
    const r = propTest('prop.road-block', 10);
    const s = r.piece!;
    explode(r.world, s.x + 8, s.y, 1.2, null);
    expect(s.down).toBeUndefined();
    expect(s.hp!).toBeLessThan(70);
  });
});
