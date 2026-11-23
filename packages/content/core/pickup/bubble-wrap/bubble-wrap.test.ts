import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { give, guardArena, inTheKit } from '../../../src/guard-testing';
import { openSpot, put, bench } from '../../../src/testing';
import { rangeGive, stand } from '@demodogs/sim';

const GO = { steer: 0, throttle: 1, brake: false, boost: false, fire: false };

describe('pickup.bubble-wrap', () => {
  it('takes the knock of a wall the car drives into, one pad a crash', () => {
    const ram = (wrapped: boolean) => {
      const w = bench();
      w.pickups.length = 0;
      const wall = loadContent().prop.get('prop.concrete-wall')!;
      const [x, y] = openSpot(w, 100);
      stand(w, wall, x, y, 0, 0);
      const c = w.player;
      put(c, x - 50, y, 0, 150);
      if (wrapped) rangeGive(w, c, loadContent().pickup.get('pickup.bubble-wrap')!);
      const events = [];
      for (let i = 0; i < 60; i++) {
        w.step();
        events.push(...w.takeEvents());
      }
      return { c, events };
    };
    const bare = ram(false);
    expect(bare.c.hp).toBeLessThan(100);
    const wrapped = ram(true);
    expect(wrapped.c.hp).toBe(100);
    expect(wrapped.c.guards.pads?.n).toBe(4);
    expect(
      wrapped.events.filter((e) => e.t === 'guard' && e.kind === 'pads' && e.what === 'use').length,
    ).toBe(1);
  });

  it('does nothing against a blow from a rival', () => {
    const { w, me, a, x, y } = guardArena();
    put(a, x + 60, y, 0);
    give(w, a, 'pickup.bubble-wrap');
    put(me, x, y, 0, 180);
    for (let i = 0; i < 40; i++) w.step(GO);
    expect(a.hp).toBeLessThan(100);
    expect(a.guards.pads?.n).toBe(5);
  });

  it('is lost with the car', () => {
    const { w, me } = guardArena();
    give(w, me, 'pickup.bubble-wrap');
    me.wrecked = true;
    w.step();
    expect(me.guards.pads).toBeUndefined();
  });

  it('comes out of a kit crate that is in every venue', () => {
    expect(inTheKit('pickup.bubble-wrap')).toBe(true);
  });
});
