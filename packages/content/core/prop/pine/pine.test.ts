import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.pine', () => {
  it('is solid like any tree', () => {
    expect(propTest('prop.pine', 120).blocked).toBe(true);
  });

  it('holds its needles harder than a tree holds its leaves', () => {
    const left = (id: string) => {
      const r = propTest(id, 5);
      explode(r.world, r.piece!.x + 60, r.piece!.y, 1, null);
      return r.piece!.leaves!;
    };
    expect(left('prop.pine')).toBeLessThan(1);
    expect(left('prop.pine')).toBeGreaterThan(left('prop.tree'));
  });
});
