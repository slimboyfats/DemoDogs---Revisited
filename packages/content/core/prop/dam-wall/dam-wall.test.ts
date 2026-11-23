import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.dam-wall', () => {
  it('stops a car dead and shrugs off one rocket', () => {
    const r = propTest('prop.dam-wall', 170);
    expect(r.blocked).toBe(true);
    const s = r.piece!;
    explode(r.world, s.x + 6, s.y, 0.85, null);
    expect(s.down).toBeUndefined();
  });

  it('a couple of powder kegs at its foot breach it', () => {
    const r = propTest('prop.dam-wall', 0, 60);
    const s = r.piece!;
    explode(r.world, s.x + 10, s.y, 1.5, null);
    explode(r.world, s.x - 10, s.y + 4, 1.5, null);
    expect(s.down).toBe(true);
  });
});
