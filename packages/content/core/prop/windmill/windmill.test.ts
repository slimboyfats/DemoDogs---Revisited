import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';
import look from './look';

describe('prop.windmill', () => {
  it('stops a car, and comes down under enough blasts', () => {
    const r = propTest('prop.windmill', 150);
    const s = r.piece!;
    expect(r.blocked).toBe(true);
    expect(s.down).toBeFalsy();
    for (let i = 0; i < 12 && !s.down; i++) explode(r.world, s.x + 9, s.y, 1.5, null);
    expect(s.down).toBe(true);
  });
  it('has a cap that follows the wind and four sails that roll on it', () => {
    const L = look.look;
    if (L.kind !== 'prop' || !L.rig) throw new Error('no rig');
    expect(L.rig.bones.map((b) => b.move?.kind)).toEqual(['wind', 'roll']);
    expect(L.rig.bones[1]!.on).toBe(0);
    // at rest the whole mill holds its sails: one reaches out past the tower, high up
    expect(L.part.fn(12, 7.8, 41.5)).toBeTruthy();
    expect(L.rig.bare.fn(12, 7.8, 41.5)).toBeNull();
  });
});
