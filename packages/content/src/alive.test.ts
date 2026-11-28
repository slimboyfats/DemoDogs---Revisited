import { describe, expect, it } from 'vitest';
import { offWay } from '@demodogs/sim';
import { loadContent } from './index';
import { makeWorld } from './testing';

/**
 * What travels (the `trek` rule) has its way to itself. Scenery laid by a rule keeps off a way of
 * its own accord, but what a venue puts down by hand (`place`: a castle's walls) stands where it
 * was told, so a way must be laid clear of it: a tractor does not drive through a wall.
 */
describe('nothing stands on the way of what travels', () => {
  for (const v of loadContent().venue.values()) {
    if (!v.scenery.some((r) => r.rule === 'trek')) continue;
    it(v.id, () => {
      const w = makeWorld({ venue: v.id, rivals: 0 });
      const found: string[] = [];
      for (const K of w.treks)
        for (const s of w.statics) {
          if (!s.def.solid || s.def.pad || s.def.id === K.rule.ends) continue;
          if (offWay(K, s.x, s.y) < K.size + s.def.radius)
            found.push(
              `${s.def.id} at ${Math.round(s.x)}, ${Math.round(s.y)} on the way of ${K.rule.prop}`,
            );
        }
      expect(found).toEqual([]);
    });
  }
});
