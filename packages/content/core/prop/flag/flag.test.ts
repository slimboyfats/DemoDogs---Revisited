import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';
import look from './look';

describe('prop.flag', () => {
  it('is snapped off by a car, which drives on', () => {
    const r = propTest('prop.flag', 150);
    expect(r.piece!.down).toBe(true);
    expect(r.blocked).toBe(false);
  });
  it('has a cloth that streams out with the wind, off the pole along +y at rest', () => {
    const L = look.look;
    if (L.kind !== 'prop' || !L.rig) throw new Error('no rig');
    expect(L.rig.bones[0]!.move?.kind).toBe('wind');
    expect(L.part.fn(0.48, 4, 15)).toBeTruthy();
    expect(L.part.fn(4, 0, 15)).toBeNull();
    expect(L.rig.bare.fn(0, 0, 15)).toBe('paintw');
  });
});
