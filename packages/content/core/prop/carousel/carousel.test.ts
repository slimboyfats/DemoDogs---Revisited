import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';
import look from './look';

describe('prop.carousel', () => {
  it('stops a car', () => {
    expect(propTest('prop.carousel', 150).blocked).toBe(true);
  });
  it('turns: the horses and the canopy are one bone going round', () => {
    const L = look.look;
    if (L.kind !== 'prop' || !L.rig) throw new Error('no rig');
    expect(L.rig.bones.map((b) => b.move?.kind)).toEqual(['turn']);
    // a horse out on the deck, and the canopy over it
    expect(L.part.fn(6.4, 0, 5.6)).toBeTruthy();
    expect(L.part.fn(4, 0, 11.5)).toBeTruthy();
    expect(L.rig.bare.fn(6.4, 0, 5.6)).toBeNull();
  });
});
