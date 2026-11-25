import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';
import look from './look';

describe('prop.banner', () => {
  it('snaps under a car', () => {
    const r = propTest('prop.banner', 150);
    expect(r.piece!.down).toBe(true);
  });
  it('has a cloth that follows the wind', () => {
    const L = look.look;
    if (L.kind !== 'prop' || !L.rig) throw new Error('no rig');
    expect(L.rig.bones[0]!.move?.kind).toBe('wind');
  });
});
