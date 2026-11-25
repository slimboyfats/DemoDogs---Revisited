import { describe, expect, it } from 'vitest';
import { SNAP } from './light-block';
import { LEVELS, PROBE, levels, reach } from './traced-light';

describe('the traced light’s levels of probes', () => {
  const lv = levels();

  it('walks one whole ray between them: each stretch starts where the last ends', () => {
    expect(lv[0]!.from).toBe(0);
    for (let i = 1; i < lv.length; i++)
      expect(lv[i]!.from).toBe(lv[i - 1]!.from + lv[i - 1]!.length);
    const last = lv[lv.length - 1]!;
    expect(last.from + last.length).toBe(reach());
  });

  it('gives each level four times the directions and a quarter of the probes', () => {
    for (let i = 1; i < lv.length; i++) {
      expect(lv[i]!.side ** 2).toBe(4 * lv[i - 1]!.side ** 2);
      expect(lv[i]!.spacing).toBe(2 * lv[i - 1]!.spacing);
    }
    // so every level fills the same texture: directions times probes is the same number
    const texels = lv.map((l) => l.side ** 2 / l.spacing ** 2);
    for (const t of texels) expect(t).toBe(texels[0]);
  });

  it('steps no further than the scene is blurred for it, and never past the shader’s limit', () => {
    for (const l of lv) {
      expect(l.length / l.steps).toBeLessThanOrEqual(2 ** l.lod * 2);
      expect(l.steps).toBeLessThanOrEqual(32);
    }
  });

  it('reaches most of a phone’s view from any spot', () => {
    expect(LEVELS).toBe(lv.length);
    expect(reach()).toBeGreaterThan(300);
  });

  it('has probes that stand still on the ground as the map moves', () => {
    // the map's corner moves in steps of SNAP: the coarsest probes must be that far apart or nearer
    expect(SNAP % lv[lv.length - 1]!.spacing).toBe(0);
    expect(lv[0]!.spacing).toBe(PROBE);
  });
});
