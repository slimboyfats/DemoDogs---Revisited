import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { give, guardArena, inTheKit } from '../../../src/guard-testing';
import { put } from '../../../src/testing';
import { rangeRocket } from '@demodogs/sim';

const sniffer = () => loadContent().weapon.get('weapon.sniffer')!;

/** A locked seeker fired at the player from behind; returns what happened. */
function chased(withToy: boolean) {
  const { w, me, a, x, y } = guardArena();
  put(a, x - 220, y, 0);
  if (withToy) give(w, me, 'pickup.squeaker');
  rangeRocket(w, sniffer(), a, x - 200, y, 0);
  expect(w.rockets[0]!.target).toBe(me.index);
  const events = [];
  let thrown = 0;
  for (let i = 0; i < 240 && (w.rockets.length || w.decoys.length); i++) {
    w.step();
    thrown = Math.max(thrown, w.decoys.length);
    events.push(...w.takeEvents());
  }
  return { w, me, events, thrown };
}

describe('pickup.squeaker', () => {
  it('throws a decoy when a rocket comes for the car, and the rocket bursts on the decoy', () => {
    const bare = chased(false);
    expect(bare.me.hp).toBeLessThan(100);
    const toy = chased(true);
    expect(toy.thrown).toBe(1);
    expect(toy.events.some((e) => e.t === 'guard' && e.kind === 'decoy' && e.what === 'use')).toBe(
      true,
    );
    // the rocket still went off, somewhere else
    expect(toy.events.some((e) => e.t === 'explode')).toBe(true);
    expect(toy.me.hp).toBe(100);
    expect(toy.me.guards.decoy?.n).toBe(2);
  });

  it('is spent after three, and says so', () => {
    const { w, me, a, x, y } = guardArena();
    put(a, x - 220, y, 0);
    give(w, me, 'pickup.squeaker');
    const events = [];
    for (let k = 0; k < 3; k++) {
      rangeRocket(w, sniffer(), a, x - 200, y, 0);
      for (let i = 0; i < 240; i++) {
        w.step();
        events.push(...w.takeEvents());
      }
    }
    expect(me.guards.decoy).toBeUndefined();
    expect(events.some((e) => e.t === 'guard' && e.kind === 'decoy' && e.what === 'off')).toBe(
      true,
    );
    expect(me.hp).toBe(100);
  });

  it('comes out of a kit crate that is in every venue', () => {
    expect(inTheKit('pickup.squeaker')).toBe(true);
  });
});
