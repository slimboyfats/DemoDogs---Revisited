import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { makeWorld, startRace } from '../../../src/testing';

const def = loadContent().modifier.get('modifier.greased')!;
const P = def.pools!;
const oil = (w: ReturnType<typeof makeWorld>) => w.spills.filter((s) => s.def.id === P.material);

describe('modifier.greased', () => {
  it('starts with oil on the road, clear of the grid', () => {
    const w = makeWorld({ modifiers: [def.id] });
    const dry = makeWorld().spills.filter((s) => s.def.id === P.material).length;
    expect(oil(w).length - dry).toBe(P.start);
    for (const s of oil(w).filter((s) => s.fixed)) {
      expect(w.offroad(s.x, s.y)).toBe(false);
      for (const c of w.cars) expect(Math.hypot(c.x - s.x, c.y - s.y)).toBeGreaterThan(30);
    }
  });

  it('seeps more as the race goes on, up to its limit', () => {
    const w = startRace(makeWorld({ rivals: 0, modifiers: [def.id] }));
    const start = oil(w).length;
    for (let i = 0; i < 60 * 40; i++) w.step();
    expect(oil(w).length).toBeGreaterThan(start + 2);
    for (let i = 0; i < 60 * 120; i++) w.step();
    expect(w.mods[0]!.laid).toBe(P.max);
  });

  it('burns at the first spark', () => {
    const w = startRace(makeWorld({ rivals: 0, modifiers: [def.id] }));
    const s = oil(w).find((s) => s.fixed)!;
    explode(w, s.x, s.y, 0.5, null);
    expect(w.blazes.length).toBeGreaterThan(0);
  });
});
