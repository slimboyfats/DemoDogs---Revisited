import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.big-top', () => {
  it('stops a car, and comes down under enough blasts', () => {
    const r = propTest('prop.big-top', 150);
    const s = r.piece!;
    expect(r.blocked).toBe(true);
    expect(s.down).toBeFalsy();
    for (let i = 0; i < 20 && !s.down; i++) explode(r.world, s.x + 15, s.y, 1.5, null);
    expect(s.down).toBe(true);
  });
});
