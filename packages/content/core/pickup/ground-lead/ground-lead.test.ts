import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { give, guardArena, inTheKit } from '../../../src/guard-testing';
import { put } from '../../../src/testing';
import { rangeArms, rangePulse } from '@demodogs/sim';

const weapon = (id: string) => loadContent().weapon.get(id)!;

describe('pickup.ground-lead', () => {
  it('takes a shock pulse to ground: the engine keeps running and nothing is lost', () => {
    const run = (lead: boolean) => {
      const { w, me, a, x, y } = guardArena();
      put(a, x - 40, y, 0);
      if (lead) give(w, me, 'pickup.ground-lead');
      rangePulse(w, weapon('weapon.shock-pulse'), a);
      const events = [];
      for (let i = 0; i < 30; i++) {
        w.step();
        events.push(...w.takeEvents());
      }
      return { me, events };
    };
    const bare = run(false);
    expect(bare.events.some((e) => e.t === 'stall')).toBe(true);
    expect(bare.me.hp).toBeLessThan(100);
    const led = run(true);
    expect(led.events.some((e) => e.t === 'stall')).toBe(false);
    expect(led.me.stall ?? 0).toBe(0);
    expect(led.me.hp).toBe(100);
    expect(led.events.some((e) => e.t === 'guard' && e.kind === 'earth' && e.what === 'use')).toBe(
      true,
    );
  });

  it('shrugs off lightning from a coil, and restarts an engine that was already cut', () => {
    const { w, me, a, x, y } = guardArena();
    put(a, x - 60, y, 0);
    me.stall = 2;
    give(w, me, 'pickup.ground-lead');
    expect(me.stall).toBe(0);
    rangeArms(w, weapon('weapon.zap-collar'), a, x, y);
    for (let i = 0; i < 60; i++) w.step();
    expect(me.hp).toBe(100);
  });

  it('comes out of a kit crate that is in every venue', () => {
    expect(inTheKit('pickup.ground-lead')).toBe(true);
  });
});
