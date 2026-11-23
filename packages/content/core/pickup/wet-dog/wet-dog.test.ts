import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { give, guardArena, inTheKit } from '../../../src/guard-testing';
import { put } from '../../../src/testing';
import { rangeArms } from '@demodogs/sim';

const weapon = (id: string) => loadContent().weapon.get(id)!;

describe('pickup.wet-dog', () => {
  it('puts out the fire it stands in, and is not burnt by it', () => {
    const run = (wet: boolean) => {
      const { w, me, x, y } = guardArena();
      if (wet) give(w, me, 'pickup.wet-dog');
      w.blazes.push({ x: x + 4, y, r: 12, t: 6, bite: 0.1, owner: -1 });
      w.blazes.push({ x: x + 200, y, r: 12, t: 6, bite: 0.1, owner: -1 });
      const events = [];
      for (let i = 0; i < 90; i++) {
        w.step();
        events.push(...w.takeEvents());
      }
      return { w, me, events };
    };
    const dry = run(false);
    expect(dry.me.hp).toBeLessThan(100);
    const wet = run(true);
    expect(wet.me.hp).toBe(100);
    expect(wet.events.some((e) => e.t === 'quench')).toBe(true);
    // only the fire in reach: the one far off burns on
    expect(wet.w.blazes.length).toBe(1);
  });

  it('is not scalded by a flame jet', () => {
    const run = (wet: boolean) => {
      const { w, me, a, x, y } = guardArena();
      put(a, x - 50, y, 0);
      if (wet) give(w, me, 'pickup.wet-dog');
      rangeArms(w, weapon('weapon.hot-breath'), a, x, y);
      for (let i = 0; i < 120; i++) w.step();
      return me.hp;
    };
    expect(run(false)).toBeLessThan(100);
    expect(run(true)).toBe(100);
  });

  it('shakes off a sticky bomb that was clinging to the car', () => {
    const { w, me, a, x, y } = guardArena();
    put(a, x - 80, y, 0);
    rangeArms(w, weapon('weapon.tick'), a, x, y);
    for (let i = 0; i < 60 && w.arms.stickies[0]?.car !== me.index; i++) w.step();
    expect(w.arms.stickies[0]!.car).toBe(me.index);
    give(w, me, 'pickup.wet-dog');
    expect(w.arms.stickies[0]!.car).toBe(-1);
  });

  it('comes out of a kit crate that is in every venue', () => {
    expect(inTheKit('pickup.wet-dog')).toBe(true);
  });
});
