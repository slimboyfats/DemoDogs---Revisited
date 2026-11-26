import { describe, expect, it } from 'vitest';
import { buildRelief } from './relief';
import { sampleTrack } from './track';

const T = sampleTrack(
  [
    [200, 200],
    [600, 200],
    [600, 600],
    [200, 600],
  ],
  4,
);
const spec = { hills: 0, wave: 520, banks: 24, from: 20, spread: 60, step: 12 };
const make = (s: Parameters<typeof buildRelief>[0] = spec, seed = 5) =>
  buildRelief(s, seed, 800, 800, T, 60, null);

describe('relief', () => {
  it('leaves the road and its verge level and stands full height far from it', () => {
    const R = make();
    for (let i = 0; i < T.n; i += 7) {
      expect(R.at(T.x[i]!, T.y[i]!)).toBe(0);
      expect(R.at(T.x[i]! + 20, T.y[i]!)).toBe(0);
    }
    expect(R.at(400, 400)).toBe(24);
    expect(R.at(10, 10)).toBe(24);
    expect(R.max).toBe(24);
  });

  it('with infield off, rises only outside the loop and leaves the inside one level', () => {
    const R = make({ ...spec, infield: false });
    expect(R.at(400, 400)).toBe(0);
    expect(R.at(330, 300)).toBe(0);
    expect(R.at(10, 10)).toBe(24);
    expect(R.at(790, 400)).toBe(24);
  });

  it('rises in level terraces with sheer faces between', () => {
    const R = make();
    // straight out from the road: every height is a terrace or a point on a face
    const seen = new Set<number>();
    let steepest = 0;
    for (let x = 600; x < 800; x += 0.5) {
      const v = R.at(x, 400);
      if (v % 12 === 0) seen.add(v);
      steepest = Math.max(steepest, Math.hypot(...R.edge(x, 400)));
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 12, 24]);
    expect(steepest).toBeGreaterThan(2);
    // and never falls on the way out
    for (let x = 601; x < 800; x++)
      expect(R.at(x, 400)).toBeGreaterThanOrEqual(R.at(x - 1, 400) - 1e-6);
  });

  it('rolls hills under the road, smooth enough to drive', () => {
    const R = make({ ...spec, banks: 0, hills: 40 });
    let most = 0;
    let slope = 0;
    for (let i = 0; i < T.n; i++) {
      most = Math.max(most, R.at(T.x[i]!, T.y[i]!));
      slope = Math.max(slope, Math.hypot(R.dx(T.x[i]!, T.y[i]!), R.dy(T.x[i]!, T.y[i]!)));
    }
    expect(most).toBeGreaterThan(8);
    expect(most).toBeLessThanOrEqual(40);
    expect(slope).toBeGreaterThan(0.02);
    expect(slope).toBeLessThan(0.5);
  });

  it('is the same for the same seed, different for another, and reads off the map', () => {
    const a = make({ ...spec, hills: 30 });
    const b = make({ ...spec, hills: 30 });
    const c = make({ ...spec, hills: 30 }, 6);
    expect([...a.hills]).toEqual([...b.hills]);
    expect([...a.hills]).not.toEqual([...c.hills]);
    expect(a.at(-50, -50)).toBe(a.at(0, 0));
    expect(a.at(9000, 9000)).toBe(a.at(800, 800));
  });

  it('banks round a derby bowl', () => {
    const R = buildRelief(spec, 1, 800, 600, null, 0, { cx: 400, cy: 300, rx: 250, ry: 160 });
    expect(R.at(400, 300)).toBe(0);
    expect(R.at(400 + 240, 300)).toBe(0);
    expect(R.at(790, 590)).toBe(24);
  });

  it('raises a trail off the road with sheer sides, climbing where its points say, and ending in a drop', () => {
    const R = make({
      ...spec,
      banks: 0,
      trails: [
        {
          wide: 40,
          points: [
            [260, 400, 0],
            [400, 400, 30],
            [500, 400, 30],
          ],
        },
      ],
    });
    // half way up the climb, and level along the top
    expect(R.at(330, 400)).toBeCloseTo(15, 0);
    expect(R.at(450, 400)).toBeCloseTo(30, 0);
    expect(R.at(450, 412)).toBeCloseTo(30, 0);
    // the sides and the far end are sheer: full height, then nothing a few px on
    expect(R.at(450, 400 + 20 + 12)).toBe(0);
    expect(R.at(500 + 20 + 12, 400)).toBe(0);
    expect(R.platAt(450, 400)).toBeCloseTo(30, 0);
    expect(R.max).toBeCloseTo(30, 0);
  });
});
