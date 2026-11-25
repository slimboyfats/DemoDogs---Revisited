import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.crater', () => {
  it('stops a car, and no blast brings it down', () => {
    const r = propTest('prop.crater', 200);
    expect(r.blocked).toBe(true);
    for (let i = 0; i < 6; i++) explode(r.world, r.piece!.x + 20, r.piece!.y, 2, null);
    expect(r.piece!.down).toBeFalsy();
  });
});
