import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@demodogs/shared';
import { stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, flatBench, openSpot, put } from '../../../src/testing';

const GO = { steer: 0, throttle: 1, brake: false, boost: false, fire: false };
const blade = () => loadContent().pickup.get('pickup.blade')!;

describe('pickup.blade', () => {
  it('bolts a blade on when it is the only pickup on offer, and it falls off when its time is up', () => {
    const w = bench();
    (w.venue as { pickups: string[] }).pickups = ['pickup.blade'];
    const c = w.player;
    w.pickups[0]!.on = true;
    put(c, w.pickups[0]!.x, w.pickups[0]!.y, 0);
    w.step();
    expect(c.blade?.def.id).toBe('pickup.blade');
    expect(w.takeEvents().some((e) => e.t === 'blade' && e.on)).toBe(true);
    w.pickups.length = 0;
    for (let i = 0; i < 60 * (blade().seconds! + 0.5); i++) w.step();
    expect(c.blade).toBeNull();
    expect(w.takeEvents().some((e) => e.t === 'blade' && !e.on)).toBe(true);
  });

  it('grinds through a brick wall that stops a car without one, chipping it as it goes', () => {
    const ram = (withBlade: boolean) => {
      const w = bench();
      const wall = loadContent().prop.get('prop.brick-wall')!;
      const [x, y] = openSpot(w, 100);
      const s = stand(w, wall, x, y, 0, 0);
      const c = w.player;
      // (and no crate in the way to hand it something that breaks walls)
      w.pickups.length = 0;
      put(c, x - 40, y, 0, 60);
      if (withBlade) c.blade = { def: blade(), t: 8, cd: 0 };
      const events: SimEvent[] = [];
      for (let i = 0; i < 240; i++) {
        w.step(GO);
        events.push(...w.takeEvents());
      }
      return { s, c, events, hp: c.hp };
    };
    const bare = ram(false);
    const bladed = ram(true);
    expect(bare.s.down).toBeFalsy();
    expect(bladed.s.down).toBe(true);
    expect(bladed.events.filter((e) => e.t === 'chip').length).toBeGreaterThan(3);
    // the blade takes the knocks, not the car
    expect(bladed.hp).toBeGreaterThanOrEqual(bare.hp);
  });

  it('bites a rival in front of it and shoves it aside', () => {
    const w = flatBench();
    const c = w.player;
    const o = w.cars[1]!;
    put(c, 300, 300, 0, 90);
    put(o, 326, 303, Math.PI / 2, 0);
    c.blade = { def: blade(), t: 8, cd: 0 };
    const hp = o.hp;
    const hits: SimEvent[] = [];
    for (let i = 0; i < 30; i++) {
      w.step(GO);
      hits.push(...w.takeEvents().filter((e) => e.t === 'hit' && e.car === o.index));
    }
    expect(hits.length).toBeGreaterThan(0);
    expect(o.hp).toBeLessThan(hp);
    // pushed forward and off to the side it was caught on
    expect(o.x).toBeGreaterThan(326);
    expect(o.y).toBeGreaterThan(303);
  });

  it('is in every venue', () => {
    for (const v of loadContent().venue.values()) expect(v.pickups).toContain('pickup.blade');
  });
});
