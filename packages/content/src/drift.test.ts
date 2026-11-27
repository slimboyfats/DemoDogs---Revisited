import { DRIFT, type Controls } from '@demodogs/shared';
import { describe, expect, it } from 'vitest';
import { flatBench, makeWorld, put, startRace } from './testing';

/**
 * Drifting: the brake held with the power on, into a bend. It turns the car tighter than plain
 * steering does at speed, keeps its speed, and held long enough pays a burst when it is let go.
 */
describe('drifting', () => {
  const ctl = (c: Partial<Controls>): Controls => ({
    steer: 0,
    throttle: 1,
    brake: false,
    boost: false,
    fire: false,
    ...c,
  });
  /** A car in the middle of open ground, at speed. */
  const fast = (v = 150) => {
    const w = flatBench();
    const c = w.player;
    put(c, w.oval!.cx - 150, w.oval!.cy - 100, 0, v);
    w.takeEvents();
    return { w, c };
  };
  const run = (w: ReturnType<typeof flatBench>, n: number, k: Controls) => {
    const seen = [];
    for (let i = 0; i < n; i++) {
      w.step(k);
      for (const e of w.takeEvents()) if (e.t === 'drift') seen.push(e);
    }
    return seen;
  };

  it('held to its first stage and let go, a drift pays a burst of speed', () => {
    const { w, c } = fast();
    const held = run(w, 75, ctl({ steer: 1, brake: true }));
    expect(c.drift).toBe(1);
    expect(c.charge).toBeGreaterThanOrEqual(DRIFT.stage[0]);
    expect(held).toEqual([{ t: 'drift', car: c.index, stage: 1, go: false }]);
    // (it has not been slowed as the brake alone would slow it)
    expect(Math.hypot(c.vx, c.vy)).toBeGreaterThan(125);
    const let_ = run(w, 1, ctl({ steer: 0 }));
    expect(let_).toEqual([{ t: 'drift', car: c.index, stage: 1, go: true }]);
    expect(c.drift).toBe(0);
    expect(c.surge).toBeGreaterThan(0.5);
    expect(c.surgeK).toBeCloseTo(DRIFT.burst[0]);
    // and the burst is speed it would not have had
    run(w, 40, ctl({}));
    const { w: w2, c: plain } = fast();
    run(w2, 75, ctl({ steer: 1 }));
    run(w2, 41, ctl({}));
    expect(c.vf).toBeGreaterThan(plain.vf + 8);
  });

  it('held longer it pays the big one', () => {
    const { w, c } = fast();
    run(w, 130, ctl({ steer: 1, brake: true }));
    expect(c.charge).toBeCloseTo(DRIFT.stage[1]);
    expect(run(w, 1, ctl({})).at(-1)).toEqual({ t: 'drift', car: c.index, stage: 2, go: true });
    expect(c.surgeK).toBeCloseTo(DRIFT.burst[1]);
  });

  it('let go too soon, or knocked out of it, a drift pays nothing', () => {
    const { w, c } = fast();
    run(w, 15, ctl({ steer: -1, brake: true }));
    expect(c.drift).toBe(-1);
    expect(run(w, 1, ctl({}))).toEqual([]);
    expect(c.surge).toBe(0);
    // off the power with the brake on it is braking, not drifting
    const { w: w3, c: b } = fast();
    run(w3, 30, ctl({ steer: 1, brake: true, throttle: 0 }));
    expect(b.drift).toBe(0);
    expect(b.vf).toBeLessThan(60);
  });

  it('a drift turns the car tighter than its wheels alone can at speed', () => {
    const turned = (brake: boolean) => {
      const { w, c } = fast(160);
      run(w, 60, ctl({ steer: 1, brake }));
      // (the way it is going, not the way it points)
      return Math.atan2(c.vy, c.vx);
    };
    expect(turned(true)).toBeGreaterThan(turned(false) * 1.25);
  });

  it('a car flat out runs wide of a bend a slower car holds', () => {
    // a quarter turn to the right with the wheels hard over: how far out it carries
    const wide = (v: number) => {
      const { w, c } = fast(v);
      const y0 = c.y;
      const x0 = c.x;
      for (let i = 0; i < 300 && c.h < Math.PI / 2; i++) w.step(ctl({ steer: 1 }));
      return Math.hypot(c.x - x0, c.y - y0);
    };
    expect(wide(150)).toBeGreaterThan(wide(90) * 1.5);
  });

  it('rivals drift too, on a track with bends for it', () => {
    const w = startRace(makeWorld({ venue: 'venue.kennel-loop', autopilot: true, laps: 9 }));
    const who = new Set<number>();
    for (let t = 0; t < 60 * 60; t++) {
      w.step();
      for (const e of w.takeEvents()) if (e.t === 'drift' && e.go) who.add(e.car);
    }
    expect(who.size).toBeGreaterThanOrEqual(3);
  });
});
