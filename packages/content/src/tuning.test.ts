import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, NO_CONTROLS, TUNABLES, type Tuning } from '@demodogs/shared';
import { damage, type World } from '@demodogs/sim';
import { bench, makeWorld, put, startRace } from './testing';

/** A bench with these numbers tuned, the player at rest on the road. */
function tuned(tuning: Partial<Tuning>): World {
  const w = bench({ tuning });
  const T = w.track!;
  const k = w.player.idx;
  put(w.player, T.x[k]!, T.y[k]!, T.a[k]!, 0);
  return w;
}

/** The fastest the player gets in n ticks flat out along the road. */
function fastest(w: World, n: number, boost = false): number {
  const T = w.track!;
  let most = 0;
  for (let k = 0; k < n; k++) {
    const c = w.player;
    const a = (c.idx + 8) % T.n;
    const want = Math.atan2(T.y[a]! - c.y, T.x[a]! - c.x) - c.h;
    const steer = Math.max(-1, Math.min(1, Math.atan2(Math.sin(want), Math.cos(want)) * 2.5));
    w.step({ ...NO_CONTROLS, throttle: 1, steer, boost });
    most = Math.max(most, Math.hypot(c.vx, c.vy));
  }
  return most;
}

describe('rule numbers tuned by hand', () => {
  it('every one has a group, a label and a hint, and no two share a key', () => {
    expect(new Set(TUNABLES.map((t) => t.key)).size).toBe(TUNABLES.length);
    for (const t of TUNABLES) {
      expect(t.label.length).toBeGreaterThan(2);
      expect(t.hint.length).toBeGreaterThan(10);
      expect(t.group.length).toBeGreaterThan(2);
    }
  });

  it('left alone, the world is the game as it is', () => {
    expect(tuned({}).hash()).toBe(tuned({ ...DEFAULT_TUNING }).hash());
    const a = tuned({});
    const b = tuned({ ...DEFAULT_TUNING });
    fastest(a, 200);
    fastest(b, 200);
    expect(a.hash()).toBe(b.hash());
  });

  it('top speed, acceleration and boost power move the cars', () => {
    const plain = fastest(tuned({}), 240);
    expect(fastest(tuned({ topSpeed: 1.5 }), 240)).toBeGreaterThan(plain * 1.2);
    expect(fastest(tuned({ topSpeed: 0.5 }), 240)).toBeLessThan(plain * 0.7);
    expect(fastest(tuned({ accel: 2 }), 40)).toBeGreaterThan(fastest(tuned({}), 40) * 1.2);
    const boosted = fastest(tuned({}), 120, true);
    expect(fastest(tuned({ boostPower: 1.8 }), 120, true)).toBeGreaterThan(boosted * 1.1);
  });

  it('boost drains and refills at the tuned rates', () => {
    const left = (tuning: Partial<Tuning>): number => {
      const w = tuned(tuning);
      fastest(w, 60, true);
      return w.player.nitro;
    };
    expect(left({ boostDrain: 3 })).toBeLessThan(left({}));
    const w = tuned({ boostRefill: 6 });
    w.player.nitro = 0;
    const v = tuned({});
    v.player.nitro = 0;
    fastest(w, 120);
    fastest(v, 120);
    expect(w.player.nitro).toBeGreaterThan(v.player.nitro * 3);
  });

  it('gravity sets how long a car hangs in the air', () => {
    const air = (tuning: Partial<Tuning>): number => {
      const w = tuned(tuning);
      w.player.z = 20;
      let n = 0;
      while (w.player.z > 0.01 && n < 600) {
        w.step(NO_CONTROLS);
        n++;
      }
      return n;
    };
    expect(air({ gravity: 0.3 })).toBeGreaterThan(air({}) * 1.5);
    expect(air({ gravity: 2 })).toBeLessThan(air({}));
  });

  it('damage scales every blow, down to none', () => {
    const hit = (tuning: Partial<Tuning>): number => {
      const w = tuned(tuning);
      const c = w.player;
      c.invuln = 0;
      damage(w, c, 20, null, c.x, c.y);
      return 100 - c.hp;
    };
    expect(hit({})).toBeGreaterThan(5);
    expect(hit({ damage: 2 })).toBeGreaterThan(hit({}) * 1.6);
    expect(hit({ damage: 0 })).toBe(0);
  });

  it('laps and rivals are taken from the next race on', () => {
    const plain = startRace(makeWorld());
    expect(plain.cars.length).toBe(6);
    const small = startRace(makeWorld({ tuning: { rivals: 2, laps: 7 } }));
    expect(small.cars.length).toBe(3);
    expect(small.laps).toBe(7);
    // a derby has no laps to set
    expect(startRace(makeWorld({ venue: 'venue.bench-pit', tuning: { laps: 7 } })).laps).toBe(
      startRace(makeWorld({ venue: 'venue.bench-pit' })).laps,
    );
  });

  it('crates come back sooner or later', () => {
    const back = (tuning: Partial<Tuning>): number => {
      const w = startRace(makeWorld({ rivals: 0, tuning }));
      const p = w.pickups[0]!;
      p.on = false;
      p.t = 0;
      let n = 0;
      while (!p.on && n < 5000) {
        w.step(NO_CONTROLS);
        n++;
      }
      return n;
    };
    expect(back({ crateTime: 0.5 })).toBeLessThan(back({}) * 0.6);
    expect(back({ crateTime: 2 })).toBeGreaterThan(back({}) * 1.8);
  });
});
