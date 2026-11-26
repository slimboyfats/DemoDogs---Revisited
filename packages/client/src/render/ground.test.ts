import { describe, expect, it } from 'vitest';
import { markGround, type Ground } from './ground';

describe('markGround', () => {
  it('grows one box around what is painted close together', () => {
    const g = { dirty: null } as unknown as Ground;
    markGround(g, 10, 10, 2);
    expect(g.dirty).toEqual([[8, 8, 12, 12]]);
    markGround(g, 30.5, 4, 1);
    expect(g.dirty).toEqual([[8, 3, 32, 12]]);
  });

  it('keeps marks far apart in boxes of their own, up to a point', () => {
    const g = { dirty: null } as unknown as Ground;
    markGround(g, 10, 10, 2);
    markGround(g, 900, 700, 2);
    markGround(g, 905, 703, 2);
    expect(g.dirty).toEqual([
      [8, 8, 12, 12],
      [898, 698, 907, 705],
    ]);
    // however many there are, the boxes kept stay few, and nothing painted is left out
    for (let i = 0; i < 200; i++) markGround(g, (i * 397) % 2000, (i * 211) % 1500, 3);
    expect(g.dirty!.length).toBeLessThanOrEqual(24);
    for (let i = 0; i < 200; i++) {
      const x = (i * 397) % 2000;
      const y = (i * 211) % 1500;
      expect(
        g.dirty!.some((d) => d[0] <= x - 3 && d[1] <= y - 3 && d[2] >= x + 3 && d[3] >= y + 3),
      ).toBe(true);
    }
  });
});
