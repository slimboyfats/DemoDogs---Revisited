import { describe, expect, it } from 'vitest';
import {
  Field,
  KERB_FROM,
  bends,
  hash2,
  makeFields,
  measure,
  paintBowl,
  paintGully,
  paintRoad,
  paintTerrain,
  paintWilds,
  terrainOf,
  type GroundColors,
  type Line,
  type Terrain,
} from './terrain';

const GRASS: GroundColors = {
  ground: '#4f7a37',
  ground2: '#5c8a3f',
  dirt: '#8a6d45',
  outside: '#2d3a24',
};

/**
 * A closed loop on a 300x160 map: a straight along y = 40 from x = 60 to 240, a half turn of
 * radius 40 round (240, 80), a straight back along y = 120, and a half turn round (60, 80).
 */
function hook(step = 4): Line {
  const x: number[] = [];
  const y: number[] = [];
  const a: number[] = [];
  const half = Math.PI * 40;
  for (let s = 0; s < 180; s += step) {
    x.push(60 + s);
    y.push(40);
    a.push(0);
  }
  for (let s = 0; s < half; s += step) {
    const t = s / 40;
    x.push(240 + Math.sin(t) * 40);
    y.push(80 - Math.cos(t) * 40);
    a.push(t);
  }
  for (let s = 0; s < 180; s += step) {
    x.push(240 - s);
    y.push(120);
    a.push(Math.PI);
  }
  for (let s = 0; s < half; s += step) {
    const t = s / 40;
    x.push(60 - Math.sin(t) * 40);
    y.push(80 + Math.cos(t) * 40);
    a.push(Math.PI + t);
  }
  return { x, y, a, n: x.length, step };
}

const at = (px: Uint8ClampedArray, w: number, x: number, y: number): [number, number, number] => [
  px[(y * w + x) * 4]!,
  px[(y * w + x) * 4 + 1]!,
  px[(y * w + x) * 4 + 2]!,
];

describe('terrainOf', () => {
  it('reads the country off the ground colour', () => {
    expect(terrainOf(GRASS)).toBe('grass');
    expect(terrainOf({ ...GRASS, ground: '#c4ced4' })).toBe('snow');
    expect(terrainOf({ ...GRASS, ground: '#d29a62' })).toBe('dirt');
    expect(terrainOf({ ...GRASS, ground: '#e6c48e' })).toBe('sand');
    expect(terrainOf({ ...GRASS, ground: '#7d7a70' })).toBe('gravel');
    expect(terrainOf({ ...GRASS, ground: '#7b6446' })).toBe('dirt');
  });

  it('takes the manifest at its word', () => {
    expect(terrainOf({ ...GRASS, terrain: 'paved' })).toBe('paved');
  });
});

describe('noise', () => {
  it('is the same every time and stays in 0..1', () => {
    expect(hash2(3, 9, 4)).toBe(hash2(3, 9, 4));
    expect(hash2(3, 9, 4)).not.toBe(hash2(4, 9, 4));
    const f = new Field(200, 120, 40, 7);
    const g = new Field(200, 120, 40, 7);
    let lo = 1;
    let hi = 0;
    for (let y = -5; y < 130; y += 3)
      for (let x = -5; x < 210; x += 3) {
        const v = f.at(x, y);
        expect(v).toBe(g.at(x, y));
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
    // it fills most of the range, so thresholds on it mean something
    expect(hi - lo).toBeGreaterThan(0.6);
  });
});

describe('paintTerrain', () => {
  const kinds: Terrain[] = ['grass', 'dirt', 'sand', 'snow', 'gravel', 'paved'];
  it.each(kinds)('%s is not one flat colour, and is the same for the same seed', (terrain) => {
    const w = 320;
    const h = 240;
    const one = new Uint8ClampedArray(w * h * 4);
    const two = new Uint8ClampedArray(w * h * 4);
    paintTerrain(one, w, h, { ...GRASS, terrain }, makeFields(w, h, 5));
    paintTerrain(two, w, h, { ...GRASS, terrain }, makeFields(w, h, 5));
    expect(one).toEqual(two);
    const tones = new Set<number>();
    for (let k = 0; k < one.length; k += 4) {
      tones.add((one[k]! << 16) | (one[k + 1]! << 8) | one[k + 2]!);
      expect(one[k + 3]).toBe(255);
    }
    expect(tones.size).toBeGreaterThan(6);
  });

  it('differs from seed to seed', () => {
    const w = 160;
    const h = 120;
    const one = new Uint8ClampedArray(w * h * 4);
    const two = new Uint8ClampedArray(w * h * 4);
    paintTerrain(one, w, h, GRASS, makeFields(w, h, 5));
    paintTerrain(two, w, h, GRASS, makeFields(w, h, 6));
    expect(one).not.toEqual(two);
  });
});

describe('measure', () => {
  it('finds how far each pixel is from the line and which sample is nearest', () => {
    const T = hook();
    const N = measure(T, 300, 160, 30, () => true);
    // on the straight, 10 px below the line at x = 100
    const k = 50 * 300 + 100;
    expect(N.dist[k]).toBeGreaterThan(9);
    expect(N.dist[k]).toBeLessThan(11.5);
    expect(T.x[N.near[k]!]).toBeCloseTo(100, -1);
    // far from the line nothing is measured
    expect(N.near[80 * 300 + 150]).toBe(0xffff);
    // samples that are left out do not count
    const none = measure(T, 300, 160, 30, () => false);
    expect(none.near[k]).toBe(0xffff);
  });
});

describe('bends', () => {
  it('is nothing on a straight and strong through a bend, signed by the way it turns', () => {
    const T = hook();
    const B = bends(T);
    expect(B[22]).toBe(0);
    const mid = 45 + 15;
    expect(B[mid]).toBeGreaterThanOrEqual(KERB_FROM);
    const flipped: Line = { ...T, a: Array.from(T.a, (v) => -v) };
    expect(bends(flipped)[mid]).toBeLessThanOrEqual(-KERB_FROM);
  });

  it('takes up a kerb too short to be a bend', () => {
    // a single kink in a long straight
    const n = 120;
    const a = new Array<number>(n).fill(0);
    for (let i = 60; i < n; i++) a[i] = 0.26;
    const T: Line = { x: a.map((_, i) => i * 4), y: a.map(() => 0), a, n, step: 4 };
    const B = bends(T);
    let run = 0;
    let best = 0;
    for (let i = 0; i < n; i++) {
      run = B[i] !== 0 ? run + 1 : 0;
      best = Math.max(best, run);
    }
    // whatever is kerbed is a whole run (56 px or more), never a stub
    expect(best === 0 || best >= 14).toBe(true);
  });
});

describe('paintRoad', () => {
  const w = 300;
  const h = 160;
  const lay = (colors: GroundColors): Uint8ClampedArray => {
    const px = new Uint8ClampedArray(w * h * 4);
    const F = makeFields(w, h, 5);
    paintTerrain(px, w, h, colors, F);
    paintRoad(px, w, h, { T: hook(), road: 40, colors, F, use: () => true });
    return px;
  };
  const grey = ([r, g, b]: [number, number, number]) =>
    Math.max(r, g, b) - Math.min(r, g, b) < 26 && r < 130;

  it('lays grey tarmac across the road and leaves the country beyond the verge alone', () => {
    const px = lay(GRASS);
    const bare = new Uint8ClampedArray(w * h * 4);
    paintTerrain(bare, w, h, GRASS, makeFields(w, h, 5));
    // in a lane of the straight
    expect(grey(at(px, w, 100, 46))).toBe(true);
    // well off the road it is still the grass that was there
    expect(at(px, w, 150, 80)).toEqual(at(bare, w, 150, 80));
    // and just past the edge it is no longer tarmac
    expect(grey(at(px, w, 100, 65))).toBe(false);
  });

  it('paints a line down each edge and dashes down the middle', () => {
    const px = lay(GRASS);
    const bright = (x: number, y: number) => at(px, w, x, y)[0] > 150;
    let edge = 0;
    let centre = 0;
    for (let x = 70; x < 230; x++) {
      if (bright(x, 40 - 17) || bright(x, 40 - 18)) edge++;
      if (bright(x, 40) || bright(x, 39)) centre++;
    }
    // the edge line is nearly unbroken; the middle is dashed, about half on
    expect(edge).toBeGreaterThan(120);
    expect(centre).toBeGreaterThan(40);
    expect(centre).toBeLessThan(110);
  });

  it('kerbs the bend in red and white, and not the straight', () => {
    const px = lay(GRASS);
    const red = ([r, g, b]: [number, number, number]) => r > 150 && g < 90 && b < 90;
    let onBend = 0;
    let onStraight = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (red(at(px, w, x, y))) {
          if (x > 250 || x < 50) onBend++;
          else if (x > 110 && x < 190) onStraight++;
        }
    expect(onBend).toBeGreaterThan(40);
    expect(onStraight).toBe(0);
  });

  it('a dirt road has no paint on it', () => {
    const px = lay({ ...GRASS, road: 'dirt' });
    for (let x = 70; x < 230; x++)
      for (let y = 24; y < 57; y++) {
        const [r, g, b] = at(px, w, x, y);
        // nothing white, nothing red: only earth (and a blade of grass on the hump)
        expect(r + g + b).toBeLessThan(560);
        expect(r > 170 && g < 90).toBe(false);
      }
  });

  it('skips the samples that are up on a flyover', () => {
    const colors = GRASS;
    const px = new Uint8ClampedArray(w * h * 4);
    const F = makeFields(w, h, 5);
    paintTerrain(px, w, h, colors, F);
    const before = px.slice();
    paintRoad(px, w, h, { T: hook(), road: 40, colors, F, use: () => false });
    expect(px).toEqual(before);
    paintGully(px, w, h, hook(), 40, colors, 5, () => true);
    // the gully is the venue's dirt, in shade down the middle
    const [r, g] = at(px, w, 100, 40);
    expect(r).toBeGreaterThan(g);
    expect(at(px, w, 150, 80)).toEqual(at(before, w, 150, 80));
  });
});

describe('paintBowl', () => {
  it('darkens outside the wall and leaves a floor inside', () => {
    const w = 200;
    const h = 160;
    const C: GroundColors = { ...GRASS, ground: '#7b6446', ground2: '#866e4e', dirt: '#6a5439' };
    const px = new Uint8ClampedArray(w * h * 4);
    const F = makeFields(w, h, 3);
    paintTerrain(px, w, h, C, F);
    paintBowl(px, w, h, { cx: 100, cy: 80, rx: 70, ry: 50 }, C, F);
    const sum = (p: [number, number, number]) => p[0] + p[1] + p[2];
    expect(sum(at(px, w, 4, 4))).toBeLessThan(sum(at(px, w, 100, 80)));
    // outside is the venue's outside colour, more or less (green here)
    const [r, g] = at(px, w, 4, 4);
    expect(g).toBeGreaterThan(r);
  });
});

describe('depth', () => {
  it('throws a shadow beside the road on the side away from the light', () => {
    // the light is at the top left: below the top straight the verge is in the road's shadow,
    // above it the verge is lit
    const w = 300;
    const h = 160;
    const px = new Uint8ClampedArray(w * h * 4);
    const F = makeFields(w, h, 5);
    paintTerrain(px, w, h, GRASS, F);
    paintRoad(px, w, h, { T: hook(), road: 40, colors: GRASS, F, use: () => true });
    let above = 0;
    let below = 0;
    for (let x = 120; x < 200; x++) {
      const up = at(px, w, x, 18);
      const down = at(px, w, x, 61);
      above += up[0] + up[1] + up[2];
      below += down[0] + down[1] + down[2];
    }
    expect(below).toBeLessThan(above * 0.8);
  });

  it('stripes an industrial bend in yellow and black, not red', () => {
    const w = 300;
    const h = 160;
    const C: GroundColors = { ...GRASS, ground: '#5d5f63', terrain: 'gravel' };
    const px = new Uint8ClampedArray(w * h * 4);
    const F = makeFields(w, h, 5);
    paintTerrain(px, w, h, C, F);
    paintRoad(px, w, h, { T: hook(), road: 40, colors: C, F, use: () => true });
    let yellow = 0;
    let red = 0;
    for (let k = 0; k < px.length; k += 4) {
      if (px[k]! > 190 && px[k + 1]! > 140 && px[k + 2]! < 70) yellow++;
      if (px[k]! > 170 && px[k + 1]! < 80 && px[k + 2]! < 80) red++;
    }
    expect(yellow).toBeGreaterThan(40);
    expect(red).toBe(0);
  });

  it('sinks the country far from the road into the outside colour', () => {
    const w = 600;
    const h = 160;
    const px = new Uint8ClampedArray(w * h * 4).fill(200);
    paintWilds(px, w, h, hook(), 60, 200, GRASS, 5);
    // near the road nothing changes; at the far edge it is darker and greener (the outside)
    expect(at(px, w, 150, 80)).toEqual([200, 200, 200]);
    const far = at(px, w, 590, 80);
    expect(far[0]).toBeLessThan(150);
    expect(far[1]).toBeGreaterThan(far[0]);
  });
});
