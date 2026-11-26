import { describe, expect, it } from 'vitest';
import {
  allVoxels,
  at,
  dentVoxels,
  detachBy,
  detachCoarse,
  detachNear,
  detachVoxels,
  hexRgb,
  lightOf,
  shatterVoxels,
  shineOf,
  tones,
  type Voxels,
} from './strips';

describe('strip shading', () => {
  it('tops are lighter than sides, sides lighter than shade', () => {
    const [shade, side, top] = tones('#808080').map((t) => hexRgb(t)[0]);
    expect(shade).toBeLessThan(side!);
    expect(side).toBeLessThan(top!);
  });

  it('a flat open top is brightest, the foot of a wall darkest, in a few hard steps', () => {
    expect(lightOf(1, 1, 1)).toBe(1);
    expect(lightOf(0, 0, 0)).toBeLessThan(0.2);
    // a slope is darker than a flat top, a wall darker still, and a shaded top darker than an open one
    expect(lightOf(0.7, 1, 0.5)).toBeLessThan(lightOf(1, 1, 0.5));
    expect(lightOf(0, 1, 0.5)).toBeLessThan(lightOf(0.7, 1, 0.5));
    expect(lightOf(1, 0.3, 0.5)).toBeLessThan(lightOf(1, 1, 0.5));
    expect(lightOf(0, 1, 1)).toBeGreaterThan(lightOf(0, 1, 0));
    const steps = new Set<number>();
    for (let f = 0; f <= 1; f += 0.01) steps.add(lightOf(f, 1, 0.5));
    expect(steps.size).toBeLessThanOrEqual(8);
  });
});

/** A solid block of red voxels, cw by ch by n texels, `res` to the art px, wrapped over rows. */
function block(cw: number, ch: number, n: number, res = 1, cols = n): Voxels {
  const W = cw * cols;
  const px = new Uint8ClampedArray(W * ch * Math.ceil(n / cols) * 4);
  const v: Voxels = { px, W, cw, ch, n, res, cols };
  for (let z = 0; z < n; z++)
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        const j = at(v, x, y, z);
        px[j] = 200;
        px[j + 3] = 255;
      }
  return v;
}
const count = (v: Voxels) => allVoxels(v).length;
const half = () => 0.5;

describe('breaking voxels off', () => {
  it('a strip wrapped over rows holds every voxel once', () => {
    expect(count(block(5, 4, 7, 1, 3))).toBe(5 * 4 * 7);
    const v = block(5, 4, 7, 1, 3);
    v.px[at(v, 2, 1, 5) + 3] = 0;
    expect(count(v)).toBe(5 * 4 * 7 - 1);
  });

  it('a dent craters the top near the hit and keeps the floor', () => {
    const v = block(12, 8, 6);
    const before = count(v);
    const chips = dentVoxels(v, 0, 0, 4, 0.5, () => 1);
    expect(chips.length).toBeGreaterThan(0);
    expect(count(v)).toBeLessThan(before);
    for (const c of chips) {
      expect(c.z).toBeGreaterThanOrEqual(3);
      expect(Math.hypot(c.x, c.y)).toBeLessThan(4 * 0.6 + 0.01);
      expect(c.rgb).toBe(0xc80000);
    }
    expect(allVoxels(v).filter((c) => c.z === 0)).toHaveLength(12 * 8);
  });

  it('a hit on one side leaves the other side whole', () => {
    const v = block(24, 12, 6, 3);
    dentVoxels(v, 0, -2, 1.2, 1, () => 1);
    const left = allVoxels(v).filter((c) => c.y < 0).length;
    const right = allVoxels(v).filter((c) => c.y > 0).length;
    expect(left).toBeLessThan(right);
    expect(right).toBe((24 * 12 * 6) / 2);
  });

  it('what comes off is gathered into blocks, as big as what each lost', () => {
    const v = block(12, 12, 6, 3);
    const fine = dentVoxels(block(12, 12, 6, 3), 0, 0, 1.5, 1, () => 1, 1, 1);
    const coarse = dentVoxels(v, 0, 0, 1.5, 1, () => 1, 1, 3);
    expect(coarse.length).toBeLessThan(fine.length / 4);
    expect(fine.every((c) => Math.abs(c.s - 1 / 3) < 1e-9)).toBe(true);
    expect(Math.max(...coarse.map((c) => c.s))).toBeGreaterThan(0.6);
    expect(Math.max(...coarse.map((c) => c.s))).toBeLessThanOrEqual(1);
    // the same amount of stuff either way
    const vol = (cs: { s: number }[]) => cs.reduce((a, c) => a + c.s ** 3, 0);
    expect(vol(coarse)).toBeCloseTo(vol(fine));
  });

  it('a dent scuffs the rim and bares the floor of the hole', () => {
    const v = block(12, 8, 6);
    dentVoxels(v, 0, 0, 4, 0.4, () => 1);
    const all = allVoxels(v);
    // on the rim nothing is removed, and the top is darker than it was
    const rim = all.find((c) => c.z === 5 && Math.abs(c.x - 3) < 1 && Math.abs(c.y) < 1)!;
    expect(rim.rgb >> 16).toBeLessThan(200);
    // in the middle the top is gone, and what is now on show is lighter than buried paint
    const mid = all.filter((c) => Math.abs(c.x) < 1 && Math.abs(c.y) < 1);
    const top = Math.max(...mid.map((c) => c.z));
    expect(top).toBeLessThan(5);
    expect(mid.find((c) => c.z === top)!.rgb >> 16).toBeGreaterThan(200);
  });

  it('a crater is measured from the surface, so a low part loses as much as a tall one', () => {
    const tall = block(12, 8, 12);
    const low = block(12, 8, 12);
    // the low part is the same block with its top half missing
    for (let z = 6; z < 12; z++)
      for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) low.px[at(low, x, y, z) + 3] = 0;
    const a = count(tall);
    const b = count(low);
    dentVoxels(tall, 0, 0, 4, 0.2, () => 1);
    dentVoxels(low, 0, 0, 4, 0.2, () => 1);
    expect(b - count(low)).toBe(a - count(tall));
    expect(b - count(low)).toBeGreaterThan(0);
  });

  it('shattering takes whole blocks from above the floor', () => {
    const v = block(10, 6, 5);
    const chips = shatterVoxels(v, 2, half, 1, 2);
    expect(chips.reduce((a, c) => a + Math.round(c.s ** 3), 0)).toBe(10 * 6 * 4);
    expect(allVoxels(v).every((c) => c.z === 0)).toBe(true);
    expect(shatterVoxels(block(10, 6, 5), 0, half)).toHaveLength(0);
  });

  it('what is cut off from the floor comes away, what still hangs on stays', () => {
    const v = block(9, 3, 6);
    // saw through the block above the floor at x = 4, then cut the right half off its floor
    for (let z = 1; z < 6; z++) for (let y = 0; y < 3; y++) v.px[at(v, 4, y, z) + 3] = 0;
    expect(detachVoxels(v)).toHaveLength(0);
    for (let y = 0; y < 3; y++) for (let x = 5; x < 9; x++) v.px[at(v, x, y, 1) + 3] = 0;
    const loose = detachVoxels(v, 1, 1);
    expect(loose).toHaveLength(4 * 3 * 4);
    expect(loose.every((c) => c.x > 0 && c.z >= 2)).toBe(true);
    expect(count(v)).toBe(9 * 3 + 4 * 3 * 5);
    expect(detachVoxels(v)).toHaveLength(0);
  });
});

describe('breaking off near a blow', () => {
  it('takes only the piece the blow cut loose, and leaves the body', () => {
    const v = block(12, 6, 10, 2);
    // saw a slab off the top at one end: cut through layer 6 for x < 5, and down the side at x = 5
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 5; x++) v.px[at(v, x, y, 6) + 3] = 0;
      for (let z = 6; z < 10; z++) v.px[at(v, 5, y, z) + 3] = 0;
    }
    const before = count(v);
    const loose = detachNear(v, 0, 0, 6, 5, 1, 1);
    expect(loose.length).toBe(5 * 6 * 3);
    expect(count(v)).toBe(before - 5 * 6 * 3);
    // nothing else is loose
    expect(detachVoxels(v, 1).length).toBe(0);
  });

  it('a piece too big to be debris stays', () => {
    const v = block(12, 6, 10, 2);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 12; x++) v.px[at(v, x, y, 4) + 3] = 0;
    expect(detachNear(v, 0, 0, 11, 5, 1, 1, 50).length).toBe(0);
    expect(detachNear(v, 0, 0, 11, 5, 1, 1).length).toBe(12 * 6 * 5);
  });
});

/** Which voxels hang on to the bottom `floor` layers, found the plain way (a check on the fast one). */
function heldPlain(v: Voxels, floor: number): Set<number> {
  const key = (x: number, y: number, z: number) => (z * v.ch + y) * v.cw + x;
  const full = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < v.cw && y < v.ch && z < v.n && v.px[at(v, x, y, z) + 3] !== 0;
  const held = new Set<number>();
  const todo: [number, number, number][] = [];
  for (let z = 0; z < floor; z++)
    for (let y = 0; y < v.ch; y++)
      for (let x = 0; x < v.cw; x++)
        if (full(x, y, z)) {
          held.add(key(x, y, z));
          todo.push([x, y, z]);
        }
  while (todo.length) {
    const [x, y, z] = todo.pop()!;
    for (const [dx, dy, dz] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ] as const) {
      const q: [number, number, number] = [x + dx, y + dy, z + dz];
      if (!full(...q) || held.has(key(...q))) continue;
      held.add(key(...q));
      todo.push(q);
    }
  }
  return held;
}

/** A block with holes knocked through it at random (the same holes for the same seed). */
function holed(seed: number, cw: number, ch: number, n: number, res: number, cols: number): Voxels {
  const v = block(cw, ch, n, res, cols);
  let s = seed;
  const dice = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let z = res; z < n; z++)
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) if (dice() < 0.62) v.px[at(v, x, y, z) + 3] = 0;
  return v;
}

describe('the fast flood fills', () => {
  it('detachVoxels takes exactly what does not hang on, on ragged parts wrapped over rows', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const v = holed(seed, 9 + (seed % 4), 7, 11, 2, 1 + (seed % 5));
      const held = heldPlain(v, 2);
      const before = count(v);
      const loose = detachVoxels(v, 1, 1);
      expect(loose.length).toBe(before - held.size);
      expect(count(v)).toBe(held.size);
      // and what is left is what the plain flood said was held
      expect(heldPlain(v, 2).size).toBe(held.size);
    }
  });

  it('detachNear over the whole part takes the same pieces', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const v = holed(seed, 10, 6 + (seed % 3), 9, 2, 1 + (seed % 4));
      const held = heldPlain(v, 2);
      const before = count(v);
      const loose = detachNear(v, 0, 0, v.cw - 1, v.ch - 1, 1, 1);
      expect(loose.length).toBe(before - held.size);
      expect(count(v)).toBe(held.size);
    }
  });
});

describe('breaking off round the voxels a dent took', () => {
  it('takes the same pieces as looking through the whole box round the dent', () => {
    let s = 5;
    const dice = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    let loose = 0;
    for (let go = 0; go < 30; go++) {
      // a wall down the middle with thin beams sticking out of it at two heights: a dent on a
      // beam cuts it through, and its outer end is left hanging on to nothing
      const a = block(30, 16, 24, 2, 5);
      for (let z = 2; z < 24; z++)
        for (let y = 0; y < 16; y++)
          for (let x = 0; x < 30; x++) {
            const wall = y === 7 || y === 8;
            const beam = x % 3 === 0 && (z === 8 || z === 9 || z === 16 || z === 17);
            if (!wall && !beam) a.px[at(a, x, y, z) + 3] = 0;
          }
      const b: Voxels = { ...a, px: a.px.slice() };
      delete b.zo;
      const lx = (dice() - 0.5) * 12;
      const ly = (dice() - 0.5) * 6;
      const r = 1 + dice() * 3;
      const power = 0.3 + dice() * 0.6;
      const seedNow = s;
      // a the new way: asked straight after the dent, whatever the box
      dentVoxels(a, lx, ly, r, power, dice, 1);
      detachNear(a, 0, 0, 0, 0, 1, 1);
      s = seedNow;
      dentVoxels(b, lx, ly, r, power, dice, 1);
      // b the old way: every voxel of the box round the dent (asked of other pixels in between,
      // so that it forgets the dent)
      detachNear(block(2, 2, 2), 0, 0, 1, 1);
      const cx = b.cw / 2 + lx * b.res;
      const cy = b.ch / 2 + ly * b.res;
      const R = r * b.res + 2;
      const box = [Math.floor(cx - R), Math.floor(cy - R), Math.ceil(cx + R), Math.ceil(cy + R)];
      loose += detachNear(b, box[0]!, box[1]!, box[2]!, box[3]!, 1, 1).length;
      expect(count(a)).toBe(count(b));
      expect(Array.from(a.px)).toEqual(Array.from(b.px));
    }
    // (and the dents did cut pieces free: the check is not an empty one)
    expect(loose).toBeGreaterThan(30);
  });

  it('finds a piece cut loose by the voxels named', () => {
    const v = block(8, 4, 8, 2);
    // cut through layer 4 by hand and name what was cut
    const gone: number[] = [];
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 8; x++) {
        v.px[at(v, x, y, 4) + 3] = 0;
        gone.push(4 * 8 * 4 + y * 8 + x);
      }
    expect(detachBy(v, Int32Array.from(gone), gone.length, 1, 1).length).toBe(8 * 4 * 3);
    expect(count(v)).toBe(8 * 4 * 4);
  });
});

describe('dropping what a wreck left hanging, an art pixel at a time', () => {
  it('takes a piece cut off from the floor whole and leaves the body', () => {
    const v = block(12, 6, 12, 2);
    // saw through at layers 6 and 7 (one art pixel): the top two art px are cut off
    for (let z = 6; z < 8; z++)
      for (let y = 0; y < 6; y++) for (let x = 0; x < 12; x++) v.px[at(v, x, y, z) + 3] = 0;
    const loose = detachCoarse(v, 1, 1);
    expect(loose.length).toBe(12 * 6 * 4);
    expect(count(v)).toBe(12 * 6 * 6);
    expect(detachVoxels(v)).toHaveLength(0);
  });

  it('leaves alone what still hangs on, and the floor itself', () => {
    const v = block(12, 6, 12, 2);
    // the same cut, but for a post left standing at one corner
    for (let z = 6; z < 8; z++)
      for (let y = 0; y < 6; y++)
        for (let x = 0; x < 12; x++) if (x >= 2 || y >= 2) v.px[at(v, x, y, z) + 3] = 0;
    const before = count(v);
    expect(detachCoarse(v, 1, 1)).toHaveLength(0);
    expect(count(v)).toBe(before);
    // nothing above the floor at all: the floor stays
    const flat = block(8, 4, 2, 2);
    expect(detachCoarse(flat)).toHaveLength(0);
    expect(count(flat)).toBe(8 * 4 * 2);
  });

  it('agrees with the fine look on a part blown apart cube by cube', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const a = block(16, 8, 12, 2, 3);
      let s = seed;
      const dice = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
      shatterVoxels(a, 0.6, dice, 1, 2);
      const b: Voxels = { ...a, px: a.px.slice() };
      delete b.zo;
      const fine = detachVoxels(a, 1, 1).length;
      const coarse = detachCoarse(b, 1, 1).length;
      // the coarse look never takes what holds, and leaves at most the odd crumb the fine one took
      expect(coarse).toBeLessThanOrEqual(fine);
      expect(fine - coarse).toBeLessThanOrEqual(fine * 0.1 + 8);
    }
  });
});

describe('a material with a finish of its own', () => {
  const glows = { light: 7 };
  const glosses = { paint: 1, chrome: 3 };

  it('shines the way the palette says its colour does when it has none', () => {
    expect(shineOf('paint', glows, glosses)).toEqual([0, 1]);
    expect(shineOf('light', glows, glosses)).toEqual([7, 0]);
    expect(shineOf('wood', glows, glosses)).toEqual([0, 0]);
  });

  it('takes its own finish over its colour: red paint that is metal, chrome that is dull', () => {
    expect(shineOf('paint@metal', glows, glosses)).toEqual([0, 2]);
    expect(shineOf('wood@chrome', glows, glosses)).toEqual([0, 3]);
    expect(shineOf('chrome@matte', glows, glosses)).toEqual([0, 0]);
    // a lamp made dull is a lamp no more
    expect(shineOf('light@paint', glows, glosses)).toEqual([0, 1]);
  });

  it('gives light off when it is named for fire or light, listed or not', () => {
    expect(shineOf('campfire', glows, glosses)[0]).toBeGreaterThan(0);
    expect(shineOf('flame2', glows, glosses)[0]).toBeGreaterThan(0);
    expect(shineOf('streetlamp', glows, glosses)[0]).toBeGreaterThan(0);
    // (a finish still wins: a lamp made dull is dark)
    expect(shineOf('flame@matte', glows, glosses)[0]).toBe(0);
  });

  it("glows when told to, and keeps its colour's shine", () => {
    expect(shineOf('paint@glow', glows, glosses)).toEqual([7, 1]);
    expect(shineOf('wood@glow', glows, glosses)).toEqual([7, 0]);
  });
});
