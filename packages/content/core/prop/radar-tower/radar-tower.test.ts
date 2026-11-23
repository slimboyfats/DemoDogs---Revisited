import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';
import look from './look';

describe('prop.radar-tower', () => {
  it('stops a car that drives into it', () => {
    const r = propTest('prop.radar-tower', 150);
    expect(r.blocked).toBe(true);
    expect(r.piece!.down).toBeFalsy();
  });
  it('has a dish that turns round and round on top of the mast', () => {
    const L = look.look;
    if (L.kind !== 'prop' || !L.rig) throw new Error('no rig');
    const [bone] = L.rig.bones;
    expect(bone!.move).toEqual({ kind: 'turn', rate: 1.5 });
    expect(bone!.at[2]).toBeGreaterThan(10);
    expect(L.part.layers).toBeGreaterThan(L.rig.bare.layers);
  });
});
