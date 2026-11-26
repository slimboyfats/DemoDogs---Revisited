import { describe, expect, it } from 'vitest';
import { TRICK_KINDS } from '@demodogs/shared';
import { dip, odds } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, makeWorld, put, startRace } from '../../../src/testing';

const bag = () => loadContent().pickup.get('pickup.bag-of-tricks')!;

describe('pickup.bag-of-tricks', () => {
  it('holds one of each kind of trick', () => {
    const C = loadContent();
    const kinds = bag().kits!.map((id) => C.pickup.get(id)!.kind);
    expect([...kinds].sort()).toEqual([...TRICK_KINDS].sort());
  });

  it('sets one trick off when it is the only pickup on offer, and says which', () => {
    const w = bench();
    (w.venue as { pickups: string[] }).pickups = ['pickup.bag-of-tricks'];
    const c = w.player;
    w.pickups[0]!.on = true;
    put(c, w.pickups[0]!.x, w.pickups[0]!.y, 0);
    w.takeEvents();
    w.step();
    const ev = w.takeEvents();
    const label = (ev.find((e) => e.t === 'pickup') as { label: string }).label;
    const names = bag().kits!.map((id) => loadContent().pickup.get(id)!.meta.name.toUpperCase());
    expect(names.some((n) => label.includes(n) || label.startsWith('STOLE'))).toBe(true);
  });

  it('hands out every trick over enough bags, the same ones for the same seed', () => {
    const roll = (seed: number) => {
      const w = startRace(makeWorld({ seed }));
      const c = w.cars[2]!;
      const got: string[] = [];
      for (let i = 0; i < 200; i++) got.push(dip(w, c, bag()).kind);
      return got;
    };
    const a = roll(3);
    expect(new Set(a).size).toBe(TRICK_KINDS.length);
    expect(roll(3)).toEqual(a);
  });

  it('leans towards the car at the back: the leader seldom gets the door or the greyhound', () => {
    const C = loadContent();
    const kits = bag().kits!.map((id) => C.pickup.get(id)!);
    const share = (at: number) => {
      const total = kits.reduce((s, k) => s + odds(k, false, at), 0);
      const help = kits.filter((k) => k.kind === 'door' || k.kind === 'dash');
      return help.reduce((s, k) => s + odds(k, false, at), 0) / total;
    };
    expect(share(0)).toBeLessThan(0.06);
    expect(share(1)).toBeGreaterThan(0.3);
  });

  it('is in every venue', () => {
    for (const v of loadContent().venue.values())
      expect(v.pickups).toContain('pickup.bag-of-tricks');
  });
});
