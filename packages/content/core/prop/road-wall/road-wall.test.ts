import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.road-wall', () => {
  it('stops a car that drives into it', () => {
    const r = propTest('prop.road-wall', 60);
    expect(r.blocked).toBe(true);
    expect(r.piece!.down).toBeFalsy();
  });

  it('is not brought down by blasts', () => {
    const r = propTest('prop.road-wall', 10);
    const s = r.piece!;
    for (let k = 0; k < 6; k++) explode(r.world, s.x + 8, s.y, 1.6, null);
    expect(s.down).toBeFalsy();
  });
});
