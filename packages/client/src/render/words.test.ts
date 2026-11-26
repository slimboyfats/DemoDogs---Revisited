import { describe, expect, it } from 'vitest';
import { fitWords, type Word } from './words';

const W = 800;
const H = 400;
const word = (x: number, y: number, w = 120, h = 20): Word => ({ x, y, w, h });
const apart = (a: Word, b: Word): boolean =>
  Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2;

describe('floating words', () => {
  it('are left alone where there is room', () => {
    const a = word(300, 200);
    const b = word(600, 200);
    fitWords([a, b], W, H, 8);
    expect([a.x, a.y, b.x, b.y]).toEqual([300, 200, 600, 200]);
  });

  it('are kept whole on the screen', () => {
    const a = word(-30, 200);
    const b = word(790, -50);
    const c = word(400, 500);
    fitWords([a, b, c], W, H, 8);
    for (const t of [a, b, c]) {
      expect(t.x - t.w / 2).toBeGreaterThanOrEqual(8);
      expect(t.x + t.w / 2).toBeLessThanOrEqual(W - 8);
      expect(t.y - t.h / 2).toBeGreaterThanOrEqual(8);
      expect(t.y + t.h / 2).toBeLessThanOrEqual(H - 8);
    }
  });

  it('never lie over one another: the later one steps up a line', () => {
    const list = [word(400, 200), word(410, 204), word(395, 198, 200), word(400, 200)];
    fitWords(list, W, H, 8);
    for (let i = 0; i < list.length; i++)
      for (let j = 0; j < i; j++) expect(apart(list[i]!, list[j]!)).toBe(true);
    expect(list[1]!.y).toBeLessThan(list[0]!.y);
  });

  it('step down when the top of the screen is in the way', () => {
    const a = word(400, 18);
    const b = word(400, 18);
    fitWords([a, b], W, H, 8);
    expect(apart(a, b)).toBe(true);
    expect(b.y).toBeGreaterThan(a.y);
  });

  it('a word wider than the screen is put in the middle', () => {
    const a = word(100, 100, 900);
    fitWords([a], W, H, 8);
    expect(a.x).toBe(W / 2);
  });

  it('keep off what is taken already: a car, the gauges', () => {
    const car = word(400, 200, 50, 50);
    const list = [word(400, 200), word(400, 200)];
    fitWords(list, W, H, 8, [car]);
    for (const t of list) expect(apart(t, car)).toBe(true);
    expect(apart(list[0]!, list[1]!)).toBe(true);
    expect(list[0]!.y).toBeLessThan(car.y);
  });
});
