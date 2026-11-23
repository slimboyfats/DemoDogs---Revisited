import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { give, guardArena, inTheKit } from '../../../src/guard-testing';
import { put } from '../../../src/testing';
import { rangeBlast, rangeHowl } from '@demodogs/sim';

const GO = { steer: 0, throttle: 1, brake: false, boost: false, fire: false };

describe('pickup.dig-in', () => {
  it('holds the car where a blast would throw it', () => {
    const run = (claws: boolean) => {
      const { w, me, x, y } = guardArena();
      if (claws) give(w, me, 'pickup.dig-in');
      rangeBlast(w, x - 20, y, 1);
      let top = 0;
      for (let i = 0; i < 60; i++) {
        w.step();
        top = Math.max(top, me.z);
      }
      return { moved: Math.hypot(me.x - x, me.y - y), top, hp: me.hp };
    };
    const bare = run(false);
    const dug = run(true);
    expect(bare.moved).toBeGreaterThan(30);
    expect(dug.moved).toBeLessThan(bare.moved * 0.25);
    expect(dug.top).toBeLessThan(bare.top * 0.25);
    // it is held, not armoured: the blast still hurts
    expect(dug.hp).toBeLessThan(100);
  });

  it('lets a shockwave go over it, and says it is holding', () => {
    const run = (claws: boolean) => {
      const { w, me, a, x, y } = guardArena();
      if (claws) give(w, me, 'pickup.dig-in');
      w.takeEvents();
      rangeHowl(w, loadContent().weapon.get('weapon.howl')!, a, x - 30, y);
      const events = [];
      let top = 0;
      for (let i = 0; i < 60; i++) {
        w.step();
        top = Math.max(top, me.z);
        events.push(...w.takeEvents());
      }
      return { moved: Math.hypot(me.x - x, me.y - y), top, events };
    };
    const bare = run(false);
    const dug = run(true);
    expect(dug.moved).toBeLessThan(bare.moved * 0.25);
    expect(dug.top).toBeLessThan(bare.top * 0.25);
    expect(dug.events.some((e) => e.t === 'guard' && e.kind === 'anchor' && e.what === 'use')).toBe(
      true,
    );
  });

  it('is three times the car to ram', () => {
    const run = (claws: boolean) => {
      const { w, me, a, x, y } = guardArena();
      put(a, x + 60, y, 0);
      if (claws) give(w, a, 'pickup.dig-in');
      put(me, x, y, 0, 150);
      for (let i = 0; i < 40; i++) w.step(GO);
      return a.x - (x + 60);
    };
    expect(run(true)).toBeLessThan(run(false) * 0.6);
  });

  it('comes out of a kit crate that is in every venue', () => {
    expect(inTheKit('pickup.dig-in')).toBe(true);
  });
});
