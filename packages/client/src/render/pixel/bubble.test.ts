import { describe, expect, it } from 'vitest';
import { DOME, SHIELD_HOT, drawBubble } from './bubble';
import type { Put } from './particles';

function cells(...args: [number, number, number, { a: number; t: number }[]]) {
  const out: { x: number; y: number; z: number; rgb: number; a: number }[] = [];
  const glow: Put = (x, y, z, _d, rgb, a) => out.push({ x, y, z, rgb, a });
  drawBubble(
    100,
    50,
    0,
    { rx: 12, ry: 8, rz: 9, h: 0.4 },
    args[0],
    args[1],
    args[2],
    args[3],
    glow,
  );
  return out;
}

describe('the shield bubble', () => {
  it('is a dome of single cells round the car', () => {
    expect(DOME.length % 3).toBe(0);
    const c = cells(0.3, 1, 0, []);
    expect(c.length).toBeGreaterThan(DOME.length / 3 / 2);
    for (const p of c) {
      const dx = p.x - 100;
      const dy = p.y - 50;
      const lx = dx * Math.cos(0.4) + dy * Math.sin(0.4);
      const ly = -dx * Math.sin(0.4) + dy * Math.cos(0.4);
      expect((lx / 12) ** 2 + (ly / 8) ** 2).toBeLessThanOrEqual(1.001);
      expect(p.z).toBeGreaterThanOrEqual(0);
      expect(p.z).toBeLessThanOrEqual(9.01);
    }
  });

  it('thins out as it is worn down and blinks as it fades', () => {
    expect(cells(0.3, 0.1, 0, []).length).toBeLessThan(cells(0.3, 1, 0, []).length);
    let blank = 0;
    for (let t = 0; t < 1; t += 0.01) if (cells(t, 1, 1, []).length === 0) blank++;
    expect(blank).toBeGreaterThan(20);
  });

  it('lights up where a blow lands', () => {
    const hot = cells(0.3, 1, 0, [{ a: 0, t: 0.02 }]).filter((p) => p.rgb === SHIELD_HOT);
    expect(hot.length).toBeGreaterThan(0);
    expect(cells(0.3, 1, 0, [{ a: 0, t: 1 }]).some((p) => p.rgb === SHIELD_HOT)).toBe(false);
  });
});
