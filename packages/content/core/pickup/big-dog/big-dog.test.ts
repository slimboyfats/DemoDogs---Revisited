import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@demodogs/shared';
import { grant, hull, stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, flatBench, openSpot, put } from '../../../src/testing';

const GO = { steer: 0, throttle: 1, brake: false, boost: false, fire: false };
const def = () => loadContent().pickup.get('pickup.big-dog')!;

describe('pickup.big-dog', () => {
  it('swells the car to its scale, and lets it down again when the time is up', () => {
    const w = flatBench();
    const c = w.player;
    const r0 = hull(c);
    expect(grant(w, c, def())).toMatch(/^BIG DOG/);
    for (let i = 0; i < 60; i++) w.step();
    expect(c.size).toBeCloseTo(def().scale!, 5);
    expect(hull(c)).toBeCloseTo(r0 * def().scale!, 5);
    expect(c.pace).toBeCloseTo(def().pace!, 5);
    for (let i = 0; i < 60 * def().seconds!; i++) w.step();
    expect(c.size).toBe(1);
    expect(c.pace).toBe(1);
    const said = w.takeEvents().flatMap((e) => (e.t === 'catchup' ? [e.what] : []));
    expect(said).toEqual(['grow', 'back']);
  });

  it('drives over a car of ordinary size, flattening it, and is barely slowed', () => {
    const run = (big: boolean) => {
      const w = flatBench();
      const c = w.player;
      const o = w.cars[1]!;
      put(c, 300, 300, 0, 0);
      put(o, 420, 300, Math.PI / 2, 0);
      if (big) grant(w, c, def());
      const events: SimEvent[] = [];
      for (let i = 0; i < 150; i++) {
        w.step(GO);
        events.push(...w.takeEvents());
      }
      return { c, o, events };
    };
    const plain = run(false);
    const big = run(true);
    const squashed = (r: typeof big) =>
      r.events.some((e) => e.t === 'catchup' && e.what === 'squash' && e.car === r.o.index);
    expect(squashed(plain)).toBe(false);
    expect(squashed(big)).toBe(true);
    expect(big.o.hp).toBeLessThan(plain.o.hp);
    // the big car went on through; the plain one was held up by the bump
    expect(big.c.x).toBeGreaterThan(plain.c.x + 20);
    expect(big.c.hp).toBeGreaterThanOrEqual(plain.c.hp);
  });

  it('goes through a brick wall that stops the same car at the same speed', () => {
    const ram = (big: boolean) => {
      const w = bench();
      const wall = loadContent().prop.get('prop.brick-wall')!;
      const [x, y] = openSpot(w, 100);
      const s = stand(w, wall, x, y, 0, 0);
      const c = w.player;
      put(c, x - 60, y, 0, 70);
      if (big) {
        c.morph = { def: def(), t: 8 };
        c.size = def().scale!;
      }
      for (let i = 0; i < 120; i++) w.step(GO);
      return { s, c };
    };
    expect(ram(false).s.down).toBeFalsy();
    const big = ram(true);
    expect(big.s.down).toBe(true);
    expect(big.c.wrecked).toBe(false);
  });

  it('is in every venue, the derbies too', () => {
    for (const v of loadContent().venue.values()) expect(v.pickups).toContain('pickup.big-dog');
  });
});
