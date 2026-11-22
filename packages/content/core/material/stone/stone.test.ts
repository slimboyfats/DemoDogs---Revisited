import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('material.stone', () => {
  it('does not burn and is hard to ram down', () => {
    const C = loadContent();
    const m = C.material.get('material.stone')!;
    const wood = C.material.get('material.wood')!;
    expect(m.strength.heat).toBeGreaterThan(8);
    expect(m.strength.impact).toBeGreaterThan(wood.strength.impact);
  });
});
