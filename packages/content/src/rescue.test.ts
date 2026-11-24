import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, NO_CONTROLS } from '@demodogs/shared';
import { rescueIn, type World } from '@demodogs/sim';
import { bench, makeWorld, put, startRace } from './testing';

const { rescueGrace: RESCUE_GRACE, rescueCount: RESCUE_COUNT } = DEFAULT_TUNING;
const WAIT = (RESCUE_GRACE + RESCUE_COUNT) * 60;

/** Run n ticks with nobody driving; how many times a car was put back. */
function idle(w: World, n: number): number {
  let got = 0;
  for (let k = 0; k < n; k++) {
    w.step(NO_CONTROLS);
    got += w.takeEvents().filter((e) => e.t === 'rescue').length;
  }
  return got;
}

/** A point `d` px to the side of track sample k. */
function beside(w: World, k: number, d: number): [number, number] {
  const T = w.track!;
  return [T.x[k]! - Math.sin(T.a[k]!) * d, T.y[k]! + Math.cos(T.a[k]!) * d];
}

describe('back on the road', () => {
  it('a car left off the course in a race is counted down and put back on the road beside it', () => {
    const w = bench();
    const T = w.track!;
    const c = w.player;
    idle(w, 5);
    const k = (c.idx + 30) % T.n;
    // (it drove off the road here: this is the last road it was on)
    c.onIdx = k;
    put(c, ...beside(w, k, w.road / 2 + 150), T.a[k]!, 0);
    // a while to turn round in before anything is said
    expect(idle(w, RESCUE_GRACE * 60 - 5)).toBe(0);
    expect(rescueIn(w, c)).toBe(0);
    idle(w, 10);
    expect(Math.ceil(rescueIn(w, c))).toBe(RESCUE_COUNT);
    expect(idle(w, WAIT - RESCUE_GRACE * 60 - 15)).toBe(0);
    expect(Math.ceil(rescueIn(w, c))).toBe(1);
    expect(idle(w, 20)).toBe(1);
    expect(rescueIn(w, c)).toBe(0);
    expect(Math.hypot(c.x - T.x[k]!, c.y - T.y[k]!)).toBeLessThan(w.road / 2 + 40);
    expect(idle(w, 300)).toBe(0);
  });

  it('never further on than the car has driven: across a short cut it goes back to where it left', () => {
    const w = bench();
    const T = w.track!;
    const c = w.player;
    idle(w, 5);
    // it left the road at `left` and cut across to beside road 200 samples further on
    const left = (c.idx + 40) % T.n;
    const k = left + 200;
    put(c, ...beside(w, k, w.road / 2 + 100), T.a[k]!, 0);
    c.idx = k;
    c.onIdx = left;
    expect(idle(w, WAIT + 10)).toBe(1);
    expect(Math.abs(c.idx - left)).toBeLessThan(6);
    expect(Math.hypot(c.x - T.x[left]!, c.y - T.y[left]!)).toBeLessThan(w.road);
  });

  it('driving back onto the road stops the count, and the verge is not off the course', () => {
    const w = bench();
    const T = w.track!;
    const c = w.player;
    idle(w, 5);
    const k = (c.idx + 30) % T.n;
    put(c, ...beside(w, k, w.road / 2 + 150), T.a[k]!, 0);
    idle(w, RESCUE_GRACE * 60 + 60);
    expect(rescueIn(w, c)).toBeGreaterThan(0);
    put(c, ...beside(w, k, w.road / 2 + 20), T.a[k]!, 0);
    expect(idle(w, WAIT + 60)).toBe(0);
    expect(rescueIn(w, c)).toBe(0);
  });

  it('runs on the numbers it is given: a longer count, a wider margin, or none at all', () => {
    const off = (tuning: Partial<typeof DEFAULT_TUNING>, d: number, ticks: number): number => {
      const w = bench({ tuning });
      const c = w.player;
      idle(w, 5);
      const k = (c.idx + 30) % w.track!.n;
      c.onIdx = k;
      put(c, ...beside(w, k, w.road / 2 + d), w.track!.a[k]!, 0);
      return idle(w, ticks);
    };
    expect(off({}, 150, WAIT + 10)).toBe(1);
    expect(off({ rescueCount: 10 }, 150, WAIT + 10)).toBe(0);
    expect(off({ rescueCount: 10 }, 150, WAIT + 310)).toBe(1);
    expect(off({ rescueGrace: 0, rescueCount: 2 }, 150, 130)).toBe(1);
    expect(off({ verge: 200 }, 150, WAIT + 60)).toBe(0);
    expect(off({ rescueCount: 0 }, 150, WAIT * 3)).toBe(0);
    // changed in a race under way, it is felt at once
    const w = bench();
    const c = w.player;
    idle(w, 5);
    const k = (c.idx + 30) % w.track!.n;
    c.onIdx = k;
    put(c, ...beside(w, k, w.road / 2 + 150), w.track!.a[k]!, 0);
    idle(w, 200);
    w.tuning = { ...w.tuning, rescueCount: 2 };
    expect(idle(w, 20)).toBe(1);
  });

  it('a derby has no course to leave', () => {
    const w = startRace(makeWorld({ venue: 'venue.bench-pit', rivals: 0 }));
    put(w.player, 40, 40, 0, 0);
    expect(idle(w, WAIT + 60)).toBe(0);
  });
});
