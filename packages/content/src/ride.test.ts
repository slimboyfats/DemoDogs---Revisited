import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { groundAt, moundAt, putProp, stand } from '@demodogs/sim';
import { loadContent } from './index';
import { bench, flatBench, makeWorld, put } from './testing';

/** How cars lie on the ground under them: ramps, the shapes in the road, hills and decks. */
describe('the ride', () => {
  const prop = (id: string) => loadContent().prop.get(id)!;
  const settle = (w: ReturnType<typeof flatBench>, n = 90) => {
    for (let i = 0; i < n; i++) w.step(NO_CONTROLS);
  };

  it('a car parked on a ramp lies nose up, or tail up, or tipped to one side, as it stands on it', () => {
    for (const [h, pitch, bank] of [
      [0, 1, 0],
      [Math.PI, -1, 0],
      [Math.PI / 2, 0, -1],
      [-Math.PI / 2, 0, 1],
    ] as const) {
      const w = flatBench();
      const x = w.oval!.cx;
      const y = w.oval!.cy;
      stand(w, prop('prop.ramp'), x, y, 0, 0);
      put(w.player, x, y, h);
      settle(w);
      const c = w.player;
      expect(Math.sign(Math.round(c.pitch * 10)), `pitch ${h}`).toBe(pitch);
      expect(Math.sign(Math.round(c.bank * 10)), `bank ${h}`).toBe(bank);
      expect(c.pitchV).toBeCloseTo(0, 1);
    }
  });

  it('a huge car reads the ground over its own length, a shrunk one over its own', () => {
    const lie = (size: number) => {
      const w = flatBench();
      const x = w.oval!.cx;
      const y = w.oval!.cy;
      stand(w, prop('prop.speed-bump'), x + 15, y, 0, 0);
      put(w.player, x, y, 0);
      w.player.morph = {
        def: [...loadContent().pickup.values()].find(
          (d) => d.kind === (size > 1 ? 'grow' : 'shrink'),
        )!,
        t: 99,
      };
      settle(w, 240);
      return w.player;
    };
    const big = lie(2);
    const small = lie(0.5);
    expect(big.size).toBeGreaterThan(1.3);
    expect(small.size).toBeLessThan(0.8);
    // the bump is under the big car's nose, and out ahead of the small one
    expect(big.pitch).toBeGreaterThan(0.03);
    expect(small.pitch).toBeCloseTo(0, 2);
  });

  it('the ground is the lie of the land with the shapes in the road on it', () => {
    const w = makeWorld({ venue: 'venue.kennel-loop' });
    // its jump's ramps, and a speed bump laid across the road a third of the way round
    expect(w.mounds.length).toBeGreaterThanOrEqual(4);
    const T = w.track!;
    const k = Math.floor(T.n / 3);
    putProp(w, loadContent().prop.get('prop.speed-bump')!, T.x[k]!, T.y[k]!, T.a[k]!, w.rng);
    const s = w.mounds.find((m) => m.def.mound!.shape === 'bar' && m.def.mound!.high > 0)!;
    expect(moundAt(w, s.x, s.y)).toBeCloseTo(s.def.mound!.high, 1);
    expect(groundAt(w, s.x, s.y)).toBeCloseTo(w.relief!.at(s.x, s.y) + s.def.mound!.high, 1);
    // and each lies on the road, clear of the grid
    for (const m of w.mounds) {
      expect(w.offroad(m.x, m.y), m.def.id).toBe(false);
      expect(w.grid!.nearest(m.x, m.y), m.def.id).toBeGreaterThan(20);
    }
  });

  it('a car on the climb to a flyover lies nose up, and nose down coming off it', () => {
    const w = bench({ venue: 'venue.knotwood', rivals: 1 });
    const T = w.track!;
    const H = w.deckH!;
    let up = 0;
    let down = 0;
    for (let i = 4; i < T.n - 4; i++) {
      if (H[i - 3]! <= 0 || H[i + 3]! <= 0) continue;
      if (H[i + 3]! - H[i - 3]! > H[up + 3]! - H[up - 3]! || !up) up = i;
      if (H[i + 3]! - H[i - 3]! < H[down + 3]! - H[down - 3]! || !down) down = i;
    }
    const c = w.player;
    const at = (i: number) => {
      put(c, T.x[i]!, T.y[i]!, T.a[i]!);
      c.idx = i;
      c.z = H[i]!;
      c.pitch = c.pitchV = 0;
      for (let k = 0; k < 20; k++) w.step(NO_CONTROLS);
      return c.pitch;
    };
    expect(at(up)).toBeGreaterThan(0.1);
    expect(at(down)).toBeLessThan(-0.1);
  });

  it('a wreck lies as the ground does and is not thrown about', () => {
    const w = flatBench();
    const x = w.oval!.cx;
    const y = w.oval!.cy;
    stand(w, prop('prop.pothole'), x, y, 0, 0);
    const c = w.player;
    put(c, x - 30, y, 0, 150);
    c.wrecked = true;
    const seen: string[] = [];
    for (let i = 0; i < 60; i++) {
      w.step(NO_CONTROLS);
      for (const e of w.takeEvents()) seen.push(e.t);
    }
    expect(seen).not.toContain('jolt');
  });
});
