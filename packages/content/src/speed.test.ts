import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, HELD } from '@demodogs/shared';
import type { World } from '@demodogs/sim';
import { bench, put } from './testing';

const GO = { steer: 0, throttle: 1, brake: false, boost: false, fire: false };

/** A point `past` px beyond the road's edge, beside track sample i, and the road's heading there. */
function beside(w: World, i: number, past: number): [number, number, number] {
  const T = w.track!;
  const a = T.a[i]!;
  const d = w.road / 2 + past;
  return [T.x[i]! - Math.sin(a) * d, T.y[i]! + Math.cos(a) * d, a];
}

/** The speed a car settles at, held at one spot at full throttle for four seconds. */
function cruise(w: World, at: [number, number, number]): number {
  const c = w.player;
  for (let i = 0; i < 240; i++) {
    put(c, at[0], at[1], at[2], c.vf);
    w.step(GO);
  }
  return c.vf;
}

describe('what slows a car', () => {
  it('keeps most of its speed off the road, and says so', () => {
    const road = bench();
    const v = cruise(road, beside(road, 40, -road.road / 2));
    expect(road.player.held).toBe(0);
    const off = bench();
    const r = cruise(off, beside(off, 40, 60));
    expect(off.player.held & HELD.rough).toBeTruthy();
    expect(r).toBeGreaterThan(v * 0.65);
    expect(r).toBeLessThan(v * 0.85);
  });

  it('pays for rough ground a little at a time past the edge, not all at once', () => {
    const at = (past: number) => {
      const w = bench();
      return cruise(w, beside(w, 40, past));
    };
    const on = at(-4);
    const edge = at(4);
    const far = at(60);
    expect(edge).toBeGreaterThan(far + (on - far) * 0.5);
  });

  it('says when damage holds it back', () => {
    const w = bench();
    w.player.hp = 20;
    cruise(w, beside(w, 40, -w.road / 2));
    expect(w.player.held & HELD.hurt).toBeTruthy();
  });

  it('runs off the road as it was told to by the tuning', () => {
    const w = bench({ tuning: { ...DEFAULT_TUNING, offroadPace: 1, offroadDrag: 0 } });
    const r = cruise(w, beside(w, 40, 60));
    const road = bench();
    const v = cruise(road, beside(road, 40, -road.road / 2));
    expect(r).toBeCloseTo(v, 0);
    expect(w.player.held & HELD.rough).toBeFalsy();
  });
});
