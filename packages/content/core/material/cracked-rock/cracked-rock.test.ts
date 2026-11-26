import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('material.cracked-rock', () => {
  it('gives to a blast as easily as wood does, and to nothing else', () => {
    const C = loadContent();
    const m = C.material.get('material.cracked-rock')!;
    const stone = C.material.get('material.stone')!;
    expect(m.strength.blast).toBeLessThan(stone.strength.blast);
    expect(m.strength.impact).toBeGreaterThan(100);
    expect(m.strength.heat).toBeGreaterThan(100);
  });
});
