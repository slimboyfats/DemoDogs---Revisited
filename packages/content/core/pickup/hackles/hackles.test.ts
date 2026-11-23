import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { rangeGive, rangeHit } from '@demodogs/sim';
import { bench, flatBench, put } from '../../../src/testing';

const plates = () => loadContent().pickup.get('pickup.hackles')!;

describe('pickup.hackles', () => {
  it('a plate takes most of a hard blow and blows off; small knocks leave them alone', () => {
    const w = bench();
    const c = w.player;
    rangeGive(w, c, plates());
    w.takeEvents();
    rangeHit(w, c, 3, c.x + 5, c.y);
    expect(c.fit.plates?.n).toBe(4);
    const hp = c.hp;
    rangeHit(w, c, 30, c.x + 5, c.y);
    expect(c.fit.plates?.n).toBe(3);
    expect(hp - c.hp).toBeLessThan(30 * 0.5);
    expect(w.takeEvents().some((e) => e.t === 'plate' && e.left === 3)).toBe(true);
    for (let i = 0; i < 3; i++) rangeHit(w, c, 10, c.x + 5, c.y);
    expect(c.fit.plates).toBeUndefined();
    expect(w.takeEvents().some((e) => e.t === 'addon' && !e.on && e.spent)).toBe(true);
  });

  it('throws the blow back at a car that rams it', () => {
    const ram = (plated: boolean) => {
      const w = flatBench();
      const c = w.player;
      const o = w.cars[1]!;
      put(o, 300, 300, 0, 150);
      put(c, 326, 300, Math.PI / 2, 0);
      if (plated) rangeGive(w, c, plates());
      // up to the first knock, before the cars have had time to meet again
      for (let i = 0; i < 5; i++) w.step();
      return { rammer: 100 - o.hp, mine: 100 - c.hp };
    };
    const bare = ram(false);
    const plated = ram(true);
    expect(plated.mine).toBeLessThan(bare.mine * 0.6);
    expect(plated.rammer).toBeGreaterThan(bare.rammer + 3);
  });

  it('is in every venue and on the black market', () => {
    for (const v of loadContent().venue.values()) expect(v.pickups).toContain('pickup.hackles');
    expect(plates().sold).toBe('market');
  });
});
