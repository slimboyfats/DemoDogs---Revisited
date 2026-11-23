import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { give, guardArena, inTheKit } from '../../../src/guard-testing';
import { put } from '../../../src/testing';
import { rangeArms, rangeRocket } from '@demodogs/sim';

const weapon = (id: string) => loadContent().weapon.get(id)!;

describe('pickup.snapper', () => {
  it('shoots a rocket out of the air before it reaches the car', () => {
    const { w, me, a, x, y } = guardArena();
    put(a, x - 220, y, 0);
    give(w, me, 'pickup.snapper');
    rangeRocket(w, weapon('weapon.rocket'), a, x - 200, y, 0);
    const events = [];
    for (let i = 0; i < 120; i++) {
      w.step();
      events.push(...w.takeEvents());
    }
    expect(w.rockets.length).toBe(0);
    expect(events.some((e) => e.t === 'explode')).toBe(false);
    const shot = events.find((e) => e.t === 'guard' && e.kind === 'flak' && e.what === 'use');
    expect(shot).toBeDefined();
    expect(me.hp).toBe(100);
    expect(me.guards.flak?.n).toBe(5);
  });

  it('brings down a lobbed shell and a sticky dart too, but leaves its own shots alone', () => {
    const { w, me, a, x, y } = guardArena();
    put(a, x - 120, y, 0);
    give(w, me, 'pickup.snapper');
    rangeArms(w, weapon('weapon.hot-dish'), a, x, y);
    for (let i = 0; i < 120; i++) w.step();
    expect(w.arms.shells.length).toBe(0);
    expect(w.blazes.length).toBe(0);
    rangeArms(w, weapon('weapon.tick'), a, x, y);
    for (let i = 0; i < 60; i++) w.step();
    expect(w.arms.stickies.length).toBe(0);
    expect(me.hp).toBe(100);
    expect(me.guards.flak?.n).toBe(4);
    // its own rocket flies on
    rangeRocket(w, weapon('weapon.rocket'), me, x + 14, y, 0);
    w.step();
    expect(w.rockets.length).toBe(1);
  });

  it('comes out of a kit crate that is in every venue', () => {
    expect(inTheKit('pickup.snapper')).toBe(true);
  });
});
