import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.sandstone-cliff', () => {
  it('is solid: a car driving into it bounces off', () => {
    expect(propTest('prop.sandstone-cliff', 90).blocked).toBe(true);
  });

  it('blasts bring it down, and it leaves a rockfall towards the road', () => {
    const { world: w, piece } = propTest('prop.sandstone-cliff', 0);
    const before = w.statics.length;
    for (let i = 0; i < 6 && !piece!.down; i++) explode(w, piece!.x + 14, piece!.y, 1.4, null);
    expect(piece!.down).toBe(true);
    const rocks = w.statics.slice(before).filter((s) => s.def.id === 'prop.rockfall');
    expect(rocks.length).toBeGreaterThanOrEqual(1);
    expect(rocks.every((s) => !s.down && s.hp! > 0)).toBe(true);
  });
});
