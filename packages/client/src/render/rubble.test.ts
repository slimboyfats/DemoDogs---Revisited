import { describe, expect, it } from 'vitest';
import { at, type Voxels } from './strips';
import {
  HARD,
  Heap,
  blank,
  chipEdges,
  crack,
  crackPlan,
  leanAt,
  stepSlab,
  type Slab,
} from './rubble';

/** A seeded 0..1 stream, so a test breaks the same way every run. */
function seeded(seed = 7): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A solid box of voxels, each coloured by where it is, so pieces can be checked against it. */
function box(cw: number, ch: number, n: number, res = 1): Voxels {
  const v = blank(cw, ch, n, res);
  for (let z = 0; z < n; z++)
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) v.px.set([x, y, z, 255], at(v, x, y, z));
  return v;
}

const count = (v: Voxels): number => {
  let k = 0;
  for (let j = 3; j < v.px.length; j += 4) if (v.px[j]) k++;
  return k;
};

describe('cracking something into pieces', () => {
  it('plans pieces about the size the material breaks into, and never too many', () => {
    expect(crackPlan([9, 79, 8], 8, 8)).toEqual([1, 8, 1]);
    expect(crackPlan([11, 11, 20], 8)).toEqual([1, 1, 3]);
    expect(crackPlan([4, 4, 4], 12)).toEqual([1, 1, 1]);
    const k = crackPlan([40, 40, 40], 4, 12);
    expect(k[0] * k[1] * k[2]).toBeLessThanOrEqual(12);
  });

  it('loses nothing: every voxel ends up in a piece or as grit', () => {
    const v = box(12, 60, 9, 3);
    const { pieces, grit } = crack(v, [1, 4, 1], seeded(), 0.5, 0.35, 20, 1);
    expect(pieces.length).toBe(4);
    const inPieces = pieces.reduce((n, p) => n + count(p.v), 0);
    expect(inPieces).toBe(pieces.reduce((n, p) => n + p.count, 0));
    expect(inPieces + grit.length).toBe(12 * 60 * 9);
    expect(grit.length).toBeGreaterThan(0);
    expect(grit.length).toBeLessThan(inPieces);
  });

  it('pieces keep their own pixels, and know where they came from', () => {
    const v = box(12, 60, 9, 3);
    const { pieces } = crack(v, [1, 4, 1], seeded(), 0.5, 0.35, 20, 1);
    for (const p of pieces) {
      // a voxel's colour is its place in the whole; its place in the piece plus the piece's
      // offset must give that back
      const x0 = Math.round(p.x * 3 + 12 / 2 - p.v.cw / 2);
      const y0 = Math.round(p.y * 3 + 60 / 2 - p.v.ch / 2);
      const z0 = Math.round(p.z * 3);
      let seen = 0;
      for (let z = 0; z < p.v.n; z++)
        for (let y = 0; y < p.v.ch; y++)
          for (let x = 0; x < p.v.cw; x++) {
            const j = at(p.v, x, y, z);
            if (!p.v.px[j + 3]) continue;
            seen++;
            expect([p.v.px[j], p.v.px[j + 1], p.v.px[j + 2]]).toEqual([x + x0, y + y0, z + z0]);
          }
      expect(seen).toBe(p.count);
    }
  });

  it('cracks are ragged, not straight cuts', () => {
    const v = box(12, 60, 9, 3);
    const { pieces } = crack(v, [1, 2, 1], seeded(3), 0.3, 0.4, 20, 1);
    const a = pieces[0]!;
    // the far face of the first piece: how far along y each column reaches
    const reach = new Set<number>();
    for (let x = 0; x < a.v.cw; x++) {
      let top = -1;
      for (let y = 0; y < a.v.ch; y++) if (a.v.px[at(a.v, x, y, 4) + 3]) top = y;
      if (top >= 0) reach.add(top);
    }
    expect(reach.size).toBeGreaterThan(1);
  });

  it('wider cracks give more grit, and bits too small to keep go as grit too', () => {
    const fine = crack(box(12, 60, 9, 3), [1, 4, 1], seeded(), 0.15, 0.35, 20, 1);
    const wide = crack(box(12, 60, 9, 3), [1, 4, 1], seeded(), 1.5, 0.35, 20, 1);
    expect(wide.grit.length).toBeGreaterThan(fine.grit.length * 2);
    const all = crack(box(6, 6, 6), [2, 2, 2], seeded(), 0.1, 0.2, 1000, 1);
    expect(all.pieces.length).toBe(0);
    expect(all.grit.length).toBe(6 * 6 * 6);
  });

  it('a hard landing knocks lumps off the corners and edges', () => {
    const v = box(12, 12, 6, 3);
    const before = count(v);
    const chips = chipEdges(v, 5, seeded(), 3);
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.length).toBeLessThanOrEqual(5);
    expect(count(v)).toBeLessThan(before);
    // the middle of the piece is untouched
    expect(v.px[at(v, 6, 6, 2) + 3]).toBe(255);
  });
});

describe('a heap of grit', () => {
  it('piles up where grains land, and spreads into a mound rather than a tower', () => {
    const h = new Heap();
    for (let i = 0; i < 400; i++) h.lay(10.5, 10.5, 1);
    const peak = h.at(10, 10);
    expect(peak).toBeGreaterThan(2);
    expect(peak).toBeLessThan(40);
    expect(h.at(13, 10)).toBeGreaterThan(0);
    expect(h.at(10, 10)).toBeGreaterThanOrEqual(h.at(14, 10));
    expect(h.size).toBeGreaterThan(9);
  });

  it('a grain lands on top of what is there, and can be taken off again', () => {
    const h = new Heap();
    const [, , z0] = h.lay(3, 3, 0.5);
    expect(z0).toBe(0);
    h.lay(3, 3, 0.5);
    expect(h.at(3, 3)).toBeGreaterThan(0);
    h.lift(3, 3, 0.5);
    h.lift(3, 3, 0.5);
    expect(h.at(3, 3)).toBe(0);
    expect(h.size).toBe(0);
  });
});

describe('a falling piece', () => {
  const slab = (): Slab => ({
    x: 0,
    y: 0,
    z: 20,
    vx: 12,
    vy: 0,
    vz: 0,
    rot: 0,
    spin: 1,
    tilt: 0,
    dir: 0,
    tumble: 3,
    phase: 0,
    r: 5,
    tall: 8,
    still: false,
    bounce: 0.2,
    hits: 0,
    age: 0,
  });

  it('falls, hits hard, bounces, tumbles and comes to rest leaning', () => {
    const s = slab();
    let hardest = 0;
    let leaned = 0;
    for (let i = 0; i < 900 && !s.still; i++) {
      hardest = Math.max(
        hardest,
        stepSlab(s, 1 / 60, () => 0),
      );
      leaned = Math.max(leaned, s.tilt);
    }
    expect(hardest).toBeGreaterThan(HARD);
    expect(s.hits).toBeGreaterThan(0);
    expect(leaned).toBeGreaterThan(0.2);
    expect(s.still).toBe(true);
    expect(s.z).toBe(0);
    expect(s.x).toBeGreaterThan(0);
  });

  it('lands on rubble that is in the way', () => {
    const s = slab();
    for (let i = 0; i < 900 && !s.still; i++) stepSlab(s, 1 / 60, () => 6);
    expect(s.z).toBe(6);
  });

  it('is drawn sheared over the way it leans', () => {
    const s = { ...slab(), tilt: Math.PI / 6, dir: 0, x: 10, y: 5, z: 2 };
    const [x, y, z] = leanAt(s, 4);
    expect(x).toBeCloseTo(12, 6);
    expect(y).toBeCloseTo(5, 6);
    expect(z).toBeCloseTo(2 + 4 * Math.cos(Math.PI / 6), 6);
  });
});
