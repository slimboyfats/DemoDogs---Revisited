import { describe, expect, it } from 'vitest';
import { grant, odds, place } from '@demodogs/sim';
import { loadContent } from './index';
import { flatBench, makeWorld, put, startRace } from './testing';

const GO = { steer: 0, throttle: 1, brake: false, boost: false, fire: false };
const HELP = new Set(['grow', 'shrink', 'wind', 'collar', 'bones']);

describe('catch-up', () => {
  it('knows how far back a car is running: 0 in front, 1 at the back, 0.5 in a derby', () => {
    const w = startRace(makeWorld());
    for (let i = 0; i < 30; i++) w.step();
    const order = w.standings();
    expect(place(w, order[0]!)).toBe(0);
    expect(place(w, order[order.length - 1]!)).toBe(1);
    expect(place(w, order[1]!)).toBeCloseTo(1 / (order.length - 1), 9);
    const d = flatBench();
    expect(place(d, d.player)).toBe(0.5);
  });

  it('leans the odds: the back of the field rolls catch-up items many times as often as the front', () => {
    const C = loadContent();
    const kinds = C.venue.get('venue.kennel-loop')!.pickups.map((id) => C.pickup.get(id)!);
    const share = (at: number) => {
      const total = kinds.reduce((s, k) => s + odds(k, false, at), 0);
      return (
        kinds.filter((k) => HELP.has(k.kind)).reduce((s, k) => s + odds(k, false, at), 0) / total
      );
    };
    expect(share(0)).toBeLessThan(0.05);
    expect(share(1)).toBeGreaterThan(0.35);
    expect(share(0.5)).toBeGreaterThan(share(0));
    expect(share(1)).toBeGreaterThan(share(0.5));
    // and an untouched pickup's odds are its weight
    const repair = C.pickup.get('pickup.repair')!;
    expect(odds(repair, false, 0)).toBe(repair.weight);
    expect(odds(repair, true, 1)).toBe(repair.hurtWeight);
  });

  it('what a pickup rolls follows the odds: the last car gets help the leader does not', () => {
    const count = (who: 'first' | 'last') => {
      const w = startRace(makeWorld({ seed: 4 }));
      for (let i = 0; i < 30; i++) w.step();
      const order = w.standings();
      const c = who === 'first' ? order[0]! : order[order.length - 1]!;
      w.pickups.length = 1;
      const p = w.pickups[0]!;
      let n = 0;
      let all = 0;
      for (let i = 0; i < 400; i++) {
        // hold the field still, and put the car on the pickup again and again
        p.on = true;
        for (const o of w.cars) put(o, o.x, o.y, o.h, 0);
        p.x = c.x;
        p.y = c.y;
        p.z = c.deck;
        w.step();
        for (const e of w.takeEvents())
          if (e.t === 'pickup' && e.car === c.index) {
            all++;
            if (HELP.has(e.kind)) n++;
          }
      }
      expect(all).toBeGreaterThan(100);
      return n / all;
    };
    expect(count('last')).toBeGreaterThan(0.3);
    expect(count('first')).toBeLessThan(0.08);
  });

  it('helps a human far behind along, and nobody who is close', () => {
    const w = startRace(makeWorld());
    const chase = w.mode.chase!;
    const c = w.player;
    const T = w.track!;
    const lead = w.cars.reduce((a, b) => (b.progress > a.progress ? b : a));
    // drop the player half a lap back
    const i = (lead.idx + Math.floor(T.n / 2)) % T.n;
    w.placeOnTrack(c, i, 0);
    c.lap = lead.lap - 1;
    w.step(GO);
    w.step(GO);
    expect(lead.progress - c.progress).toBeGreaterThan(chase.gap);
    expect(c.pace).toBeGreaterThan(1);
    expect(c.pace).toBeLessThanOrEqual(chase.pace);
    for (const o of w.cars) if (!o.isPlayer) expect(o.pace).toBe(1);
    expect(lead.pace).toBe(1);
  });

  it('two runs of a race full of catch-up items land on the same state', () => {
    const run = () => {
      const C = loadContent();
      const w = startRace(makeWorld({ seed: 11, autopilot: true }));
      const give = ['big-dog', 'runt-ray', 'second-wind', 'lead-collar', 'bone-shower'];
      for (let i = 0; i < 60 * 25; i++) {
        if (i % 90 === 0) {
          const c = w.cars[(i / 90) % w.cars.length]!;
          const d = C.pickup.get(`pickup.${give[(i / 90) % give.length]}`)!;
          if (!c.wrecked) grant(w, c, d);
        }
        w.step();
      }
      return w.hash();
    };
    expect(run()).toBe(run());
  });
});
