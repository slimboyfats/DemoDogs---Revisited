import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { propTest } from '../../../src/testing';
import look, { SPIN } from './look';

describe('prop.sprinkler', () => {
  it('is nothing to a car that drives over it', () => {
    const r = propTest('prop.sprinkler', 120);
    expect(r.blocked).toBe(false);
    expect(r.world.player.vx).toBeGreaterThan(55);
  });
  it('throws its jets off the arm: the water turns as fast as the arm does', () => {
    const def = loadContent().prop.get('prop.sprinkler')!;
    expect(def.spout!.what).toBe('jets');
    expect(def.spout!.spin).toBe(SPIN);
    const L = look.look;
    if (L.kind !== 'prop' || !L.rig) throw new Error('no rig');
    expect(L.rig.bones[0]!.move).toEqual({ kind: 'turn', rate: SPIN });
  });
});
