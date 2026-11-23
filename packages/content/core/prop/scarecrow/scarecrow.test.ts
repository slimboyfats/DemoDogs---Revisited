import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';
import look from './look';

describe('prop.scarecrow', () => {
  it('is knocked to bits by a car, which drives on', () => {
    const r = propTest('prop.scarecrow', 150);
    expect(r.piece!.down).toBe(true);
    expect(r.blocked).toBe(false);
  });
  it('has a head that turns to watch the cars', () => {
    const L = look.look;
    if (L.kind !== 'prop' || !L.rig) throw new Error('no rig');
    expect(L.rig.bones[0]!.move?.kind).toBe('watch');
    // the whole scarecrow still has its head and hat; the bare pole has not
    expect(L.part.fn(0, 0, 10.5)).toBe('straw');
    expect(L.part.fn(0, 0, 12.5)).toBe('black');
    expect(L.rig.bare.fn(0, 0, 9.9)).toBeNull();
  });
});
