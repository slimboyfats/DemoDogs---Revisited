import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

const C = loadContent();

describe('material.sandstone', () => {
  it('is softer than stone against blasts and rams, and does not burn', () => {
    const sand = C.material.get('material.sandstone')!.strength;
    const stone = C.material.get('material.stone')!.strength;
    expect(sand.blast).toBeLessThan(stone.blast);
    expect(sand.impact).toBeLessThan(stone.impact);
    expect(sand.heat).toBeGreaterThan(5);
  });
});
