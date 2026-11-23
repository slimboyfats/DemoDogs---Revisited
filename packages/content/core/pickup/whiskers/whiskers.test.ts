import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { give, guardArena, inTheKit } from '../../../src/guard-testing';
import { put } from '../../../src/testing';
import { rangeDrop, rangeMine } from '@demodogs/sim';

const GO = { steer: 0, throttle: 1, brake: false, boost: false, fire: false };
const weapon = (id: string) => loadContent().weapon.get(id)!;

describe('pickup.whiskers', () => {
  it("trips a mine ahead from a feeler's length, and the car drives on unhurt", () => {
    const run = (feelers: boolean) => {
      const { w, me, a, x, y } = guardArena();
      put(me, x, y, 0, 100);
      if (feelers) give(w, me, 'pickup.whiskers');
      rangeMine(w, weapon('weapon.mine'), a, x + 90, y);
      const events = [];
      for (let i = 0; i < 120; i++) {
        w.step(GO);
        events.push(...w.takeEvents());
      }
      return { w, me, events };
    };
    const bare = run(false);
    expect(bare.me.hp).toBeLessThan(100);
    const swept = run(true);
    expect(swept.w.mines.length).toBe(0);
    expect(swept.me.hp).toBe(100);
    expect(
      swept.events.some((e) => e.t === 'guard' && e.kind === 'sweep' && e.what === 'use'),
    ).toBe(true);
    // the mine went off as a pop: nothing to dig a crater with
    expect(swept.events.some((e) => e.t === 'explode')).toBe(true);
    expect(swept.w.craters.length).toBe(0);
  });

  it('flicks spikes off the road in front of it', () => {
    const { w, me, a, x, y } = guardArena();
    put(me, x, y, 0, 100);
    give(w, me, 'pickup.whiskers');
    rangeDrop(w, weapon('weapon.tacks'), a, x + 90, y, 0);
    expect(w.spikes.length).toBeGreaterThan(4);
    for (let i = 0; i < 120; i++) w.step(GO);
    expect(me.flat ?? 0).toBe(0);
    expect(me.hp).toBe(100);
  });

  it('leaves a mine behind the car alone', () => {
    const { w, me, a, x, y } = guardArena();
    give(w, me, 'pickup.whiskers');
    rangeMine(w, weapon('weapon.mine'), a, x - 28, y);
    w.step();
    expect(w.mines.length).toBe(1);
  });

  it('comes out of a kit crate that is in every venue', () => {
    expect(inTheKit('pickup.whiskers')).toBe(true);
  });
});
