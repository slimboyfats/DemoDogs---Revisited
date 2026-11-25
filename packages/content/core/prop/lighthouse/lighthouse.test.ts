import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';
import look from './look';

describe('prop.lighthouse', () => {
  it('stops a car dead and stands', () => {
    const r = propTest('prop.lighthouse', 200);
    expect(r.blocked).toBe(true);
    expect(r.piece!.down).toBeFalsy();
  });
  it('has a lantern that turns on top of the tower', () => {
    const L = look.look;
    if (L.kind !== 'prop' || !L.rig) throw new Error('no rig');
    expect(L.rig.bones.map((b) => b.move?.kind)).toEqual(['turn']);
    expect(L.part.layers).toBeGreaterThan(48);
    expect(L.part.fn(0, 0, 43)).toBeTruthy();
    expect(L.rig.bare.fn(0, 0, 39)).toBeTruthy();
  });
});
