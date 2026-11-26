import { describe, expect, it } from 'vitest';
import type { CarLook, PropLook } from '@demodogs/shared';
import {
  bound,
  carGap,
  carPoint,
  grant,
  newShape,
  newTouch,
  pieces,
  pointGap,
  propPoint,
  propShape,
} from '@demodogs/sim';
import { makeWorld } from './testing';
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

/**
 * Cars: what a shot meets is the body as it is drawn at the height the shot flies, slice by
 * slice (`carPoint`), at whatever size and heading the car has. What it bumps with stays its hull.
 */
describe('a shot meets a car as it is drawn', () => {
  const T = newTouch();
  const UP = 0.6;
  for (const [id, def] of C.car) {
    const lm = L.get(id);
    if (!lm || lm.look.kind !== 'car') continue;
    it(id, () => {
      expect(def.hit, 'baked: pnpm hitboxes:bake').toBeDefined();
      const p = (lm.look as CarLook).body;
      for (const [size, h] of [
        [1, 0],
        [2, 0.9],
        [0.5, -2],
      ] as const) {
        const w = makeWorld({ car: id });
        const c = w.cars.find((o) => o.isPlayer)!;
        c.size = size;
        c.h = h;
        c.z = 3;
        const cs = Math.cos(h);
        const sn = Math.sin(h);
        let out = 0;
        let over = 0;
        for (let z = 0; z < p.layers; z++) {
          const lo = c.z + (UP + z + 0.25) * size;
          const hi = c.z + (UP + z + 0.75) * size;
          const drawn: [number, number][] = [];
          for (let x = -p.w / 2 + 0.25; x < p.w / 2; x += 0.5)
            for (let y = -p.h / 2 + 0.25; y < p.h / 2; y += 0.5)
              if (p.fn(x, y, p.smooth ? z + 0.5 : z)) drawn.push([x, y]);
          // (a speck is no slice: the baker leaves it out)
          if (drawn.length < 2) continue;
          for (const [x, y] of drawn) {
            const wx = c.x + (x * cs - y * sn) * size;
            const wy = c.y + (x * sn + y * cs) * size;
            out = Math.max(out, carPoint(c, wx, wy, T, lo, hi) / size);
          }
          // and nothing of it far from what is drawn in that slice
          for (let x = -p.w / 2; x < p.w / 2; x += 1)
            for (let y = -p.h / 2; y < p.h / 2; y += 1) {
              const wx = c.x + (x * cs - y * sn) * size;
              const wy = c.y + (x * sn + y * cs) * size;
              if (carPoint(c, wx, wy, T, lo, hi) >= 0) continue;
              let d = Infinity;
              for (const [vx, vy] of drawn) d = Math.min(d, Math.hypot(vx - x, vy - y));
              over = Math.max(over, d);
            }
        }
        expect(out).toBeLessThan(OUT);
        // (a hollow walled all round is filled: the bed of a truck, hit at its walls anyway)
        expect(over).toBeLessThan(6);
        // over its roof, and under its wheels, nothing
        expect(carPoint(c, c.x, c.y, T, c.z + 12 * size, c.z + 13 * size)).toBeGreaterThan(1e5);
        expect(carPoint(c, c.x, c.y, T, c.z - 2, c.z - 1)).toBeGreaterThan(1e5);
      }
    });
  }

  it("a rocket over the pickup's open bed is in it, not against it", () => {
    const w = makeWorld({ car: 'car.mutt' });
    const c = w.cars.find((o) => o.isPlayer)!;
    c.h = 0;
    // (the bed: behind the cab, cut out above its floor)
    expect(carGap(c, c.x - 7, c.y)).toBeLessThan(0);
    expect(carPoint(c, c.x - 7, c.y, T, c.z + 3.6, c.z + 5)).toBeGreaterThan(0);
    // the cab is there at that height
    expect(carPoint(c, c.x + 1, c.y, T, c.z + 3.6, c.z + 5)).toBeLessThan(0);
  });

  it('and what is bolted on and stands out of it: jaws across its nose, plates on its flanks', () => {
    const w = makeWorld({ car: 'car.mutt' });
    const c = w.cars.find((o) => o.isPlayer)!;
    c.h = 0;
    const hl = c.def.body.halfLength;
    const hw = c.def.body.halfWidth;
    const shot = (x: number, y: number) => carPoint(c, c.x + x, c.y + y, T, c.z + 3.5, c.z + 5);
    // bare: ahead of its nose and beside its doors is clear air
    expect(shot(hl + 2.5, 5)).toBeGreaterThan(1);
    expect(shot(2.8, hw + 0.8)).toBeGreaterThan(0);
    for (const id of ['pickup.scrap-jaws', 'pickup.hackles']) {
      const def = C.pickup.get(id)!;
      // (the box in the manifest is the look's own, where it is bolted)
      const p = (L.get(id)!.look as PropLook).part;
      let ax = 0;
      let ay = 0;
      for (let x = -p.w / 2; x <= p.w / 2; x += 0.25)
        for (let y = -p.h / 2; y <= p.h / 2; y += 0.25)
          for (let z = 0; z < p.layers; z++)
            if (p.fn(x, y, z + 0.5)) {
              ax = Math.max(ax, Math.abs(x));
              ay = Math.max(ay, Math.abs(y));
            }
      expect(Math.abs(def.hit!.halfLength - ax)).toBeLessThan(0.6);
      expect(Math.abs(def.hit!.halfWidth - ay)).toBeLessThan(0.6);
      grant(w, c, def);
    }
    expect(shot(hl + 2.5, 5)).toBeLessThan(0);
    expect(shot(2.8, hw + 0.8)).toBeLessThan(0);
    expect(shot(2.8, -hw - 0.8)).toBeLessThan(0);
    // twice the size, twice as far out
    c.size = 2;
    expect(shot((hl + 2.5) * 2, 10)).toBeLessThan(0);
    c.size = 1;
    // a plate blown off is gone from the shape: the first to go is the last bolted on
    c.fit.plates!.n = 1;
    expect(shot(2.8, hw + 0.8)).toBeLessThan(0);
    expect(shot(2.8, -hw - 0.8)).toBeGreaterThan(0);
    // and bumping is the hull's business still
    expect(carGap(c, c.x + hl + 2.5, c.y + 5)).toBeGreaterThan(0);
  });
});
