import { describe, expect, it } from 'vitest';
import type { PropLook } from '@demodogs/shared';
import { newShape, newTouch, pointGap, propShape } from '@demodogs/sim';
import { loadContent, loadLooks } from './index';

/**
 * Hit shapes against looks: what a car runs into should be what is drawn. Each solid prop's look
 * is sampled over the height a car stands (its foot), and no part of that may stick far out of
 * its hit shape, nor the shape far out past it.
 */
const C = loadContent();
const L = loadLooks();

/** How far a look may stand out of its hit shape, and the shape out past the look (art px). */
const OUT = 2.6;
const OVER = 2.6;
/** As high as a car's body stands. */
const CAR_HIGH = 8;

/**
 * Props whose shape is not their foot on purpose: trees and bushes give at the edges (the trunk
 * is what stops a car), things on legs are hit as the block their legs mark out, animals are
 * hit by their own rule, and the rest are piles with ragged edges.
 */
const LOOSE_FIT = new Set([
  'prop.pine',
  'prop.tree',
  'prop.maple',
  'prop.scarecrow',
  'prop.giant-oak',
  'prop.bush',
  'prop.pylon',
  'prop.water-tower',
  'prop.windmill',
  'prop.flyover-pillar',
  'prop.overpass-pillar',
  'prop.radar-tower',
  'prop.shopfront',
  'prop.tower-glass',
  'prop.tower-steel',
  'prop.dam-wall',
  'prop.roof-tile',
  'prop.cone',
  'prop.tumbleweed',
]);

describe('hit shapes fit what is drawn', () => {
  const S = newShape();
  const T = newTouch();
  for (const [id, def] of C.prop) {
    const lm = L.get(id);
    if (!lm || lm.look.kind !== 'prop' || !def.solid || def.critter || LOOSE_FIT.has(id)) continue;
    it(id, () => {
      const p = (lm.look as PropLook).part;
      propShape(def, 0, 0, 0, S);
      let out = 0;
      let reach = 0;
      const step = 0.5;
      for (let z = 0.5; z < Math.min(p.layers, CAR_HIGH); z += 1)
        for (let x = -p.w / 2 + step / 2; x < p.w / 2; x += step)
          for (let y = -p.h / 2 + step / 2; y < p.h / 2; y += step) {
            if (!p.fn(x, y, p.smooth ? z : Math.floor(z))) continue;
            out = Math.max(out, pointGap(S, x, y, T));
            reach = Math.max(reach, Math.abs(x), Math.abs(y));
          }
      if (reach === 0) return;
      // no part of it well outside the shape
      expect(out).toBeLessThan(OUT);
      // and the shape not well outside it
      const far = Math.max(S.a, S.b) + S.r;
      expect(far - reach).toBeLessThan(OVER);
    });
  }
});
