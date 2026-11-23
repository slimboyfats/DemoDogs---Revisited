import { describe, expect, it } from 'vitest';
import { STRIDE, beastBody, beastLook, type Beast } from './beasts';

const B: Beast = {
  len: 12,
  wid: 5.6,
  deep: 5.4,
  leg: 2.6,
  head: 2,
  neck: 0.3,
  coat: 'feather',
  face: 'hide2',
  legs: 'fawn',
};

describe('beasts', () => {
  it('walks through a whole stride, and its head is a bone that watches', () => {
    const L = beastLook(B);
    expect(1 + L.alts!.length).toBe(STRIDE);
    expect(L.rig!.alts!.length).toBe(STRIDE - 1);
    expect(L.rig!.bones.map((b) => b.move?.kind)).toEqual(['watch']);
    // the whole animal has its head out in front; the bare body has none
    const hx = B.len / 2 + B.head * 0.55;
    const hz = B.leg + B.deep * 0.62 + B.neck;
    expect(L.part.fn(hx, 0, hz)).toBe('hide2');
    expect(L.rig!.bare.fn(hx, 0, hz)).toBeNull();
  });
  it('stands square at the start of a stride and swings diagonal legs together', () => {
    const fore = B.len * 0.3;
    const side = B.wid * 0.27;
    const foot = (stride: number, x: number, y: number) => beastBody(B, stride).fn(x, y, 0.3);
    expect(foot(0, fore, side)).toBe('black');
    expect(foot(0, -fore, -side)).toBe('black');
    // a quarter of the way through, one diagonal pair is forward of where it stood, the other back
    expect(foot(0.25, fore + 0.9, side)).toBe('black');
    expect(foot(0.25, -fore + 0.9, -side)).toBe('black');
    expect(foot(0.25, fore - 0.9, -side)).toBe('black');
    expect(foot(0.75, fore - 0.9, side)).toBe('black');
  });
});
