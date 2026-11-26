import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.blast-wall', () => {
  it('does not give to a car however hard it is rammed', () => {
    const r = propTest('prop.blast-wall', 300);
    expect(r.blocked).toBe(true);
    expect(r.piece!.down).toBeFalsy();
  });
  it('comes down to a rocket blast beside it, and is built again later', () => {
    const r = propTest('prop.blast-wall', 0);
    const s = r.piece!;
    explode(r.world, s.x - 14, s.y, 0.85, null);
    expect(s.down).toBe(true);
    expect(s.def.rebuild).toBeGreaterThan(10);
  });
});
