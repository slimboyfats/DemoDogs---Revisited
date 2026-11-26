import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.castle-tower', () => {
  it('stops a car, and comes down only under a great many blasts', () => {
    const r = propTest('prop.castle-tower', 180);
    const s = r.piece!;
    expect(r.blocked).toBe(true);
    for (let i = 0; i < 3; i++) explode(r.world, s.x + 8, s.y, 1.5, null);
    expect(s.down).toBeFalsy();
    for (let i = 0; i < 30 && !s.down; i++) explode(r.world, s.x + 8, s.y, 1.5, null);
    expect(s.down).toBe(true);
  });
});
