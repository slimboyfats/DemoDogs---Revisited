import { describe, expect, it } from 'vitest';
import { grant } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench, makeWorld, openSpot, put, startRace } from '../../../src/testing';

const GO = { steer: 0, throttle: 1, brake: false, boost: false, fire: false };
const def = () => loadContent().pickup.get('pickup.second-wind')!;

describe('pickup.second-wind', () => {
  it('carries the car faster than it could go by itself, for a few seconds', () => {
    const top = (wind: boolean) => {
      const w = bench();
      const c = w.player;
      const T = w.track!;
      // the longest straight is good enough: measure the best speed over two seconds
      put(c, T.x[0]!, T.y[0]!, T.a[0]!, 150);
      c.idx = 0;
      if (wind) grant(w, c, def());
      let best = 0;
      for (let i = 0; i < 90; i++) {
        w.step(GO);
        best = Math.max(best, c.vf);
      }
      return best;
    };
    expect(top(true)).toBeGreaterThan(top(false) * 1.15);
    const w = bench();
    grant(w, w.player, def());
    for (let i = 0; i < 60 * 10; i++) w.step();
    expect(w.player.wind).toBeNull();
    expect(w.player.pace).toBe(1);
    expect(openSpot(w)).toBeTruthy();
  });

  it('blows longer for the car at the back than for the car in front', () => {
    const w = startRace(makeWorld());
    for (let i = 0; i < 30; i++) w.step();
    const order = w.standings();
    const first = order[0]!;
    const last = order[order.length - 1]!;
    grant(w, first, def());
    grant(w, last, def());
    expect(last.wind!.t).toBeGreaterThan(first.wind!.t * 1.5);
  });

  it('is at every race venue', () => {
    for (const v of loadContent().venue.values())
      expect(v.pickups.includes('pickup.second-wind')).toBe(v.mode === 'mode.race');
  });
});
