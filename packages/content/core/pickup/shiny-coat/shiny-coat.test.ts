import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { give, guardArena, inTheKit } from '../../../src/guard-testing';
import { put } from '../../../src/testing';
import { rangeArms } from '@demodogs/sim';

const weapon = (id: string) => loadContent().weapon.get(id)!;

describe('pickup.shiny-coat', () => {
  it('sends gun rounds back at the car that fired them', () => {
    const run = (coat: boolean) => {
      const { w, me, a, x, y } = guardArena();
      put(a, x + 60, y, 0);
      if (coat) give(w, a, 'pickup.shiny-coat');
      me.rounds = 20;
      const events = [];
      for (let i = 0; i < 200; i++) {
        w.step();
        events.push(...w.takeEvents());
      }
      return { me, a, events };
    };
    const bare = run(false);
    expect(bare.a.hp).toBeLessThan(100);
    expect(bare.me.hp).toBe(100);
    const coat = run(true);
    expect(coat.a.hp).toBe(100);
    expect(coat.me.hp).toBeLessThan(100);
    expect(
      coat.events.some((e) => e.t === 'guard' && e.kind === 'mirror' && e.what === 'use'),
    ).toBe(true);
  });

  it('turns a rail slug, and bats a sticky dart back to its thrower', () => {
    const { w, me, a, x, y } = guardArena();
    put(a, x + 80, y, 0);
    give(w, a, 'pickup.shiny-coat');
    rangeArms(w, weapon('weapon.long-bark'), me, a.x, a.y);
    expect(a.hp).toBe(100);
    expect(me.hp).toBeLessThan(100);
    const hp = me.hp;
    rangeArms(w, weapon('weapon.tick'), me, a.x, a.y);
    for (let i = 0; i < 60 && w.arms.stickies[0]?.car !== me.index; i++) w.step();
    expect(w.arms.stickies[0]!.car).toBe(me.index);
    for (let i = 0; i < 240; i++) w.step();
    expect(me.hp).toBeLessThan(hp);
  });

  it('wears off', () => {
    const { w, a } = guardArena();
    give(w, a, 'pickup.shiny-coat');
    for (let i = 0; i < 60 * 10.2; i++) w.step();
    expect(a.guards.mirror).toBeUndefined();
  });

  it('comes out of a kit crate that is in every venue', () => {
    expect(inTheKit('pickup.shiny-coat')).toBe(true);
  });
});
