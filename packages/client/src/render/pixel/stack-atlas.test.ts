import { describe, expect, it } from 'vitest';
import { shelfPack } from './stack-atlas';

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
