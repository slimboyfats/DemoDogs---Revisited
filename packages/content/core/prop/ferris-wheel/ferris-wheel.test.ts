import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';
import look from './look';

describe('prop.ferris-wheel', () => {
  it('stops a car and stands', () => {
    const r = propTest('prop.ferris-wheel', 180);
    expect(r.blocked).toBe(true);
    expect(r.piece!.down).toBeFalsy();
  });
  it('is a frame with a wheel that rolls on it, the same every quarter turn', () => {
    const L = look.look;
    if (L.kind !== 'prop' || !L.rig) throw new Error('no rig');
    const M = L.rig.bones[0]!.move;
    expect(M?.kind).toBe('roll');
    if (M?.kind === 'roll') expect(M.fold).toBe(4);
    // at rest the whole thing holds the wheel: a car out on the rim, high over the frame
    expect(L.part.fn(18, 0, 22)).toBeTruthy();
    expect(L.part.fn(0, 0, 40)).toBeTruthy();
    expect(L.rig.bare.fn(0, 0, 40)).toBeNull();
  });
});
