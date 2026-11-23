import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.armco', () => {
  it('holds a car that slides into it', () => {
    const r = propTest('prop.armco', 40);
    expect(r.blocked).toBe(true);
  });

  it('is flattened by blasts a concrete barrier would stand', () => {
    const r = propTest('prop.armco', 10);
    const s = r.piece!;
    for (let i = 0; i < 4; i++) explode(r.world, s.x + 6, s.y, 1.2, null);
    expect(s.down).toBe(true);
  });
});
