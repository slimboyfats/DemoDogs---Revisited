import { describe, expect, it } from 'vitest';
import type { PropLook } from '@demodogs/shared';
import { bound, newShape, newTouch, pieces, pointGap, propPoint, propShape } from '@demodogs/sim';
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
    if (!lm || lm.look.kind !== 'prop' || !def.solid || def.critter) continue;
    // (a shape in pieces was baked from the look, slice by slice: it is held to it at every
    // height, whatever the thing is)
    const baked = pieces(def) > 1;
    if (!baked && LOOSE_FIT.has(id)) continue;
    it(id, () => {
      const p = (lm.look as PropLook).part;
      propShape(def, 0, 0, 0, S);
      const trunk = def.crown ? def.crown.trunk + 0.75 : Infinity;
      let out = 0;
      let reach = 0;
      const step = 0.5;
      for (let z = 0.5; z < (baked ? p.layers : Math.min(p.layers, CAR_HIGH)); z += 1)
        for (let x = -p.w / 2 + step / 2; x < p.w / 2; x += step)
          for (let y = -p.h / 2 + step / 2; y < p.h / 2; y += step) {
            if (!p.fn(x, y, p.smooth ? z : Math.floor(z))) continue;
            if (Math.hypot(x, y) > trunk) continue;
            out = Math.max(
              out,
              baked ? propPoint(def, 0, 0, 0, x, y, T, z - 0.5, z + 0.5) : pointGap(S, x, y, T),
            );
            reach = Math.max(reach, Math.abs(x), Math.abs(y));
          }
      if (reach === 0) return;
      // no part of it well outside the shape
      expect(out).toBeLessThan(OUT);
      // and the shape not well outside it
      if (!baked) expect(Math.max(S.a, S.b) + S.r - reach).toBeLessThan(OVER);
      else expect(bound(def) - Math.hypot(reach, reach)).toBeLessThan(OVER);
    });
  }
});

/**
 * And the other way about, slice by slice: where a car can be (under `CAR_HIGH`), no part of a
 * baked hit shape is far from what is drawn in that very slice. Only a gap no car could get into
 * is hit as if it were filled: between the wheels of a wreck, the posts of a rail, the legs of a
 * stand.
 */
describe('hit shapes stand out of no slice', () => {
  const T = newTouch();
  /** Half a car's width, near enough: a gap narrower than a car is no gap. */
  const GAP = 4.5;
  for (const [id, def] of C.prop) {
    const lm = L.get(id);
    if (!lm || lm.look.kind !== 'prop' || !def.solid || def.critter || pieces(def) < 2) continue;
    it(id, () => {
      const p = (lm.look as PropLook).part;
      const trunk = def.crown ? def.crown.trunk + 0.75 : Infinity;
      const step = 0.5;
      let worst = 0;
      let inside = 0;
      let empty = 0;
      for (let z = 0; z < Math.min(p.layers, CAR_HIGH - 1); z++) {
        const drawn: [number, number][] = [];
        for (let x = -p.w / 2 + step / 2; x < p.w / 2; x += step)
          for (let y = -p.h / 2 + step / 2; y < p.h / 2; y += step)
            if (Math.hypot(x, y) <= trunk && p.fn(x, y, p.smooth ? z + 0.5 : z)) drawn.push([x, y]);
        for (let x = -p.w / 2 - 3; x < p.w / 2 + 3; x += step)
          for (let y = -p.h / 2 - 3; y < p.h / 2 + 3; y += step) {
            if (propPoint(def, 0, 0, 0, x, y, T, z, z + 1) >= 0) continue;
            let d = Infinity;
            for (const [vx, vy] of drawn) d = Math.min(d, Math.hypot(vx - x, vy - y));
            inside++;
            if (d > 1.5) empty++;
            worst = Math.max(worst, d);
          }
      }
      expect(worst).toBeLessThan(GAP);
      // (and little of it is such a gap)
      expect(empty / Math.max(1, inside)).toBeLessThan(0.25);
    });
  }
});
