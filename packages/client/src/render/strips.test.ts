import { describe, expect, it } from 'vitest';
import { hexRgb, toneOf, tones } from './strips';

describe('strip shading', () => {
  it('tops are lighter than sides, sides lighter than shade', () => {
    const [shade, side, top] = tones('#808080').map((t) => hexRgb(t)[0]);
    expect(shade).toBeLessThan(side!);
    expect(side).toBeLessThan(top!);
  });

  it('a voxel with nothing above is a top; low covered voxels are in shade', () => {
    expect(toneOf(false, 0, 9)).toBe(2);
    expect(toneOf(true, 0, 9)).toBe(0);
    expect(toneOf(true, 5, 9)).toBe(1);
  });
});
