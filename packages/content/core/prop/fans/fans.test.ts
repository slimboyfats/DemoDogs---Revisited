import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';
import look from './look';

describe('prop.fans', () => {
  it('stands behind a barrier that stops a car', () => {
    const r = propTest('prop.fans', 120);
    expect(r.blocked).toBe(true);
    expect(r.piece!.down).toBeFalsy();
  });
  it('is five spectators who cheer the cars that go by', () => {
    const L = look.look;
    if (L.kind !== 'prop' || !L.rig) throw new Error('no rig');
    expect(L.rig.bones).toHaveLength(5);
    for (const b of L.rig.bones) expect(b.move?.kind).toBe('cheer');
  });
});
