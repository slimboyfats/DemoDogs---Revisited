import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { give, guardArena, inTheKit } from '../../../src/guard-testing';
import { put } from '../../../src/testing';
import { rangeRocket } from '@demodogs/sim';

const sniffer = () => loadContent().weapon.get('weapon.sniffer')!;

describe('pickup.dog-whistle', () => {
  it('cannot be locked onto, and a rocket already locked loses it', () => {
    const { w, me, a, x, y } = guardArena();
    put(a, x - 220, y, 0);
    rangeRocket(w, sniffer(), a, x - 200, y + 30, 0);
    expect(w.rockets[0]!.target).toBe(me.index);
    give(w, me, 'pickup.dog-whistle');
    w.step();
    expect(w.rockets[0]!.target).toBeUndefined();
    rangeRocket(w, sniffer(), a, x - 200, y - 30, 0);
    expect(w.rockets[1]!.target).toBeUndefined();
    for (let i = 0; i < 200; i++) w.step();
    expect(me.hp).toBe(100);
  });

  it('is not picked out by a gun, until it wears off', () => {
    const { w, me, a, x, y } = guardArena();
    put(a, x + 60, y, 0);
    give(w, a, 'pickup.dog-whistle');
    me.rounds = 20;
    for (let i = 0; i < 120; i++) w.step();
    expect(me.rounds).toBe(20);
    expect(a.hp).toBe(100);
    for (let i = 0; i < 60 * 10; i++) w.step();
    expect(a.guards.jam).toBeUndefined();
    expect(me.rounds).toBeLessThan(20);
    expect(a.hp).toBeLessThan(100);
  });

  it('comes out of a kit crate that is in every venue', () => {
    expect(inTheKit('pickup.dog-whistle')).toBe(true);
  });
});
