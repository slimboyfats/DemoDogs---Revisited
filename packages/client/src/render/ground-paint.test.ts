import { describe, expect, it } from 'vitest';
import { makeWorld } from '@demodogs/content/testing';
import { NEAR_Q, NONE, OFF, bakePaint, nearest, toneAt } from './ground-paint';
import { paintGlsl } from './pixel/ground-paint-glsl';
import { makeFields, type Line } from './terrain';

/** A straight line of samples along y = 50, from x = 20 to 180. */
function straight(): Line {
  const x: number[] = [];
  const y: number[] = [];
  const a: number[] = [];
  for (let s = 20; s <= 180; s += 4) {
    x.push(s);
    y.push(50);
    a.push(0);
  }
  return { x, y, a, n: x.length, step: 4 };
}

describe('nearest', () => {
  it('gives each block the sample it is nearest to, and none beyond the reach', () => {
    const T = straight();
    const gw = 100;
    const gh = 50;
    const out = new Uint16Array(gw * gh * 2).fill(NONE);
    nearest(
      T,
      200,
      100,
      NEAR_Q,
      () => 30,
      () => true,
      out,
      gw,
      gh,
      0,
    );
    // (the block at x = 100, y = 60 is nearest the sample at x = 100)
    const at = (x: number, y: number) =>
      out[(Math.floor(y / NEAR_Q) * gw + Math.floor(x / NEAR_Q)) * 2];
    expect(T.x[at(101, 61)!]).toBe(100);
    expect(T.x[at(61, 41)!]).toBe(60);
    expect(at(100, 95)).toBe(NONE);
    // the other channel was left alone
    expect(out[1]).toBe(NONE);
  });

  it('leaves out the samples it is told to', () => {
    const T = straight();
    const out = new Uint16Array(100 * 50 * 2).fill(NONE);
    nearest(
      T,
      200,
      100,
      NEAR_Q,
      () => 30,
      (i) => T.x[i]! < 100,
      out,
      100,
      50,
      0,
    );
    for (let k = 0; k < out.length; k += 2)
      if (out[k] !== NONE) expect(T.x[out[k]!]).toBeLessThan(100);
  });
});

describe('bakePaint', () => {
  const w = makeWorld();
  const F = makeFields(w.w, w.h, w.venue.seed);
  const P = bakePaint(w, F);

  it('carries the noise, the line and the map of what is nearest', () => {
    expect(P.fields.data.length).toBe(P.fields.gw * P.fields.gh * 4);
    const L = P.line!;
    expect(L.n).toBe(w.track!.n);
    expect(L.samples.length).toBe(L.n * 12);
    expect(L.samples[0]).toBeCloseTo(w.track!.x[0]!, 3);
    expect(L.samples[2]).toBeCloseTo(w.track!.a[0]!, 5);
    // on the road's own line the nearest sample is that one, give or take a neighbour
    const i = 10;
    const k = Math.floor(w.track!.y[i]! / NEAR_Q) * L.near.gw + Math.floor(w.track!.x[i]! / NEAR_Q);
    const got = L.near.data[k * 2]!;
    expect(Math.min(Math.abs(got - i), L.n - Math.abs(got - i))).toBeLessThanOrEqual(1);
    // far from the road there is none, and the wilds know how far it is
    expect(L.near.data.includes(NONE)).toBe(true);
    expect(Math.max(...L.wild.data)).toBeLessThanOrEqual(L.wildTo);
    for (let s = 0; s < L.n; s++) expect(L.samples[s * 4 + 3]).not.toBe(OFF);
  });

  it('says about what colour the ground is: grey on the road, the country off it', () => {
    const T = w.track!;
    const road = toneAt(w, P, F, T.x[20]!, T.y[20]!);
    expect(Math.abs(road[0] - road[1])).toBeLessThan(12);
    const off = toneAt(w, P, F, 3, 3);
    expect(off.every((v) => v >= 0 && v <= 255)).toBe(true);
  });

  it('writes a painter for the venue: its terrain, its road, and no more', () => {
    const src = paintGlsl(P);
    expect(src).toContain('#define ROAD');
    expect(src).toContain('vec3 groundPaint(vec2 wp, ivec2 gc)');
    expect(src).not.toContain('#define BOWL');
    const bowl = paintGlsl({ ...P, line: null, oval: { cx: 1, cy: 1, rx: 1, ry: 1 } });
    expect(bowl).toContain('#define BOWL');
    expect(bowl).not.toContain('#define ROAD');
    expect(paintGlsl({ ...P, terrain: 'snow' })).toContain('#define TERRAIN 3');
  });

  it('paints the bright look when asked, and says a lighter colour for it', () => {
    expect(paintGlsl(P)).not.toContain('#define BRIGHT\n');
    expect(paintGlsl({ ...P, bright: true })).toContain('#define BRIGHT\n');
    const sum = (c: readonly number[]) => c[0]! + c[1]! + c[2]!;
    for (const [x, y] of [
      [3, 3],
      [w.w / 2, w.h / 2],
    ] as const) {
      const lit = toneAt(w, { ...P, bright: true }, F, x, y);
      expect(sum(lit)).toBeGreaterThan(sum(toneAt(w, P, F, x, y)));
      expect(lit.every((v) => v >= 0 && v <= 255)).toBe(true);
    }
  });
});
