import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.crystal', () => {
  it('stops a car, and a blast shatters it', () => {
    const r = propTest('prop.crystal', 50);
    const s = r.piece!;
    expect(r.blocked).toBe(true);
    for (let i = 0; i < 6 && !s.down; i++) explode(r.world, s.x + 6, s.y, 1.5, null);
    expect(s.down).toBe(true);
  });
});
