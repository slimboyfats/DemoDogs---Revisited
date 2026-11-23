import { describe, expect, it } from 'vitest';
import { rangeRocket } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

const pup = () => loadContent().weapon.get('weapon.pup')!;

describe('weapon.pup', () => {
  it('flies through a car it starts on until it arms, then pops small', () => {
    const w = flatBench();
    const me = w.player;
    const them = w.cars.find((c) => c !== me)!;
    const x = w.oval!.cx;
    const y = w.oval!.cy;
    put(me, x - 200, y, 0);
    put(them, x, y, 0);
    them.ai = null;
    rangeRocket(w, pup(), me, x, y, 0);
    w.step();
    expect(w.rockets.length).toBe(1);
    for (let i = 0; i < 60 && w.rockets.length; i++) w.step();
    expect(w.rockets.length).toBe(0);
    // it popped clear of the car: a scratch at most, nowhere near a rocket's blow
    expect(them.hp).toBeGreaterThan(80);
  });

  it('is only ever thrown by a cluster, never handed out', () => {
    const c = loadContent();
    for (const p of c.pickup.values()) expect(p.weapons ?? []).not.toContain('weapon.pup');
    expect([...c.weapon.values()].some((w) => w.cluster?.bomblet === 'weapon.pup')).toBe(true);
  });
});
