import { describe, expect, it } from 'vitest';
import type { Strip } from '../stack';
import { StackAtlas, shelfPack } from './stack-atlas';

describe('shelfPack', () => {
  it('packs strips left to right with a texel of padding, then starts a new shelf', () => {
    const st = { x: 0, y: 0, row: 0 };
    expect(shelfPack(st, 64, 30, 10)).toEqual({ x: 0, y: 0 });
    expect(shelfPack(st, 64, 30, 14)).toEqual({ x: 31, y: 0 });
    // does not fit on the first shelf: goes below its tallest strip
    expect(shelfPack(st, 64, 20, 5)).toEqual({ x: 0, y: 15 });
  });

  it('says when the atlas is full or a strip is too wide', () => {
    const st = { x: 0, y: 0, row: 0 };
    expect(shelfPack(st, 32, 40, 4)).toBeNull();
    expect(shelfPack(st, 32, 32, 30)).toEqual({ x: 0, y: 0 });
    expect(shelfPack(st, 32, 32, 4)).toBeNull();
  });
});

/** A stand-in for WebGL that only counts uploads. */
const fakeGl = () => {
  const gl = {
    MAX_TEXTURE_SIZE: 1,
    uploads: 0,
    getParameter: () => 64,
    createTexture: () => ({}),
    bindTexture: () => {},
    texParameteri: () => {},
    texImage2D: () => {},
    pixelStorei: () => {},
    deleteTexture: () => {},
    texSubImage2D: () => {
      gl.uploads++;
    },
  };
  return gl;
};
const strip = (w: number, h: number) => ({ img: { width: w, height: h } }) as unknown as Strip;

describe('StackAtlas', () => {
  it('gives a released slot to the next strip of the same size', () => {
    const gl = fakeGl();
    const A = new StackAtlas(gl as unknown as WebGL2RenderingContext);
    const a = strip(30, 30);
    const at = A.slot(a);
    A.slot(strip(30, 30));
    A.release(a);
    expect(A.slot(strip(30, 30))).toEqual(at);
    expect(A.flushes).toBe(0);
  });

  it('starts again when it is full instead of stopping the game', () => {
    const gl = fakeGl();
    const A = new StackAtlas(gl as unknown as WebGL2RenderingContext);
    const all = Array.from({ length: 5 }, () => strip(30, 30));
    for (const s of all) A.slot(s);
    // four fit in 64 by 64; the fifth empties the atlas and takes the first place
    expect(A.flushes).toBe(1);
    expect(A.slot(all[4]!)).toEqual({ x: 0, y: 0 });
    // the others are packed and uploaded afresh when they are drawn again
    const before = gl.uploads;
    A.slot(all[0]!);
    expect(gl.uploads).toBe(before + 1);
    // one that can never fit is drawn from the corner
    expect(A.slot(strip(100, 10))).toEqual({ x: 0, y: 0 });
  });
});
