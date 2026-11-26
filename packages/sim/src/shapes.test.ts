import { describe, expect, it } from 'vitest';
import { extent, newShape, newTouch, pointGap, shapeGap, type Shape } from './shapes';

const shape = (x: number, y: number, h: number, a: number, b: number, r: number): Shape => ({
  ...newShape(),
  x,
  y,
  cs: Math.cos(h),
  sn: Math.sin(h),
  a,
  b,
  r,
});

describe('hit shapes', () => {
  it('measures a point against a circle, a box and a turned box', () => {
    const T = newTouch();
    expect(pointGap(shape(0, 0, 0, 0, 0, 5), 8, 0, T)).toBeCloseTo(3);
    expect([T.nx, T.ny, T.px, T.py]).toEqual([1, 0, 5, 0]);
    // a box 20 by 8 with corners rounded by 1: its side, its end, and inside it
    const box = shape(0, 0, 0, 9, 3, 1);
    expect(pointGap(box, 0, 7, T)).toBeCloseTo(3);
    expect(pointGap(box, 13, 0, T)).toBeCloseTo(3);
    expect(pointGap(box, 0, 3, T)).toBeCloseTo(-1);
    expect(T.ny).toBe(1);
    // turned a quarter, its long side lies up and down
    const up = shape(0, 0, Math.PI / 2, 9, 3, 1);
    expect(pointGap(up, 7, 0, T)).toBeCloseTo(3);
    expect(pointGap(up, 0, 13, T)).toBeCloseTo(3);
  });

  it('finds where two shapes touch and the way to push them apart', () => {
    const T = newTouch();
    // a car-sized box nose on to a wall across its way, a px into it
    const car = shape(0, 0, 0, 9, 3, 3);
    const wall = shape(13, 0, Math.PI / 2, 4, 0.9, 0.6);
    expect(shapeGap(car, wall, T)).toBeCloseTo(-0.5);
    expect(T.nx).toBeCloseTo(-1);
    // two circles
    expect(shapeGap(shape(0, 0, 0, 0, 0, 3), shape(10, 0, 0, 0, 0, 4), T)).toBeCloseTo(3);
    expect(T.nx).toBeCloseTo(-1);
  });

  it('sees a thin wall lying across the middle of a box, no corner of either in the other', () => {
    const T = newTouch();
    const car = shape(0, 0, 0, 9, 3, 3);
    const wall = shape(0, 0, Math.PI / 2, 12, 0.9, 0.6);
    expect(shapeGap(car, wall, T)).toBeLessThan(-5);
  });

  it('never calls shapes that are apart touching', () => {
    const T = newTouch();
    for (let i = 0; i < 400; i++) {
      // (a fixed scatter: boxes a set distance apart along a turning line)
      const h = i * 0.37;
      const a = shape(0, 0, i * 0.11, 9, 3, 3);
      const far = extent(a, Math.cos(h), Math.sin(h));
      const b = shape(0, 0, i * 0.23, 4, 1, 0.6);
      const need = far + extent(b, Math.cos(h), Math.sin(h)) + 1;
      b.x = Math.cos(h) * need;
      b.y = Math.sin(h) * need;
      expect(shapeGap(a, b, T)).toBeGreaterThan(0);
    }
  });
});
