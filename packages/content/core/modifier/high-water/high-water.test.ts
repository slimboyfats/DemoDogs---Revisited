import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { makeWorld, startRace } from '../../../src/testing';

const def = loadContent().modifier.get('modifier.high-water')!;
const P = def.pools!;

describe('modifier.high-water', () => {
  it('starts as small pools on the road, clear of the grid', () => {
    const w = makeWorld({ modifiers: [def.id] });
    const pools = w.spills.filter((s) => s.def.id === P.material && s.r === P.r[0]);
    expect(pools.length).toBe(P.start);
    for (const s of pools) {
      expect(w.offroad(s.x, s.y)).toBe(false);
      for (const c of w.cars) expect(Math.hypot(c.x - s.x, c.y - s.y)).toBeGreaterThan(40);
    }
  });

  it('rises to its full width over the race and then holds', () => {
    const w = startRace(makeWorld({ rivals: 0, modifiers: [def.id] }));
    const pools = w.mods[0]!.pools;
    let told = 0;
    for (let i = 0; i < 60 * (P.rise! / 2); i++) {
      w.step();
      told += w.takeEvents().filter((e) => e.t === 'flood').length;
    }
    const half = pools[0]!.r;
    expect(half).toBeGreaterThan(P.r[0] + 10);
    expect(half).toBeLessThan(P.r[1] - 10);
    for (let i = 0; i < 60 * P.rise!; i++) w.step();
    for (const s of pools) expect(s.r).toBeCloseTo(P.r[1], 5);
    // the client is told in steps, not every tick
    expect(told).toBeLessThan(pools.length * 30);
    expect(told).toBeGreaterThan(pools.length * 5);
  });

  it('drowns a fire the water reaches', () => {
    const w = startRace(makeWorld({ rivals: 0, modifiers: [def.id] }));
    const s = w.mods[0]!.pools[0]!;
    w.blazes.push({ x: s.x + 20, y: s.y, r: 6, t: 999, bite: 0.25, owner: -1 });
    for (let i = 0; i < 60 * P.rise!; i++) w.step();
    expect(w.blazes.length).toBe(0);
  });
});
