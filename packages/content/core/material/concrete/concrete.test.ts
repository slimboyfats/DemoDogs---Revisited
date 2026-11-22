import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('material.concrete', () => {
  it('is harder than brick', () => {
    const C = loadContent();
    const m = C.material.get('material.concrete')!;
    const wood = C.material.get('material.wood')!;
    expect(m.strength.blast).toBeGreaterThan(C.material.get('material.brick')!.strength.blast);
    expect(wood.strength.impact).toBeLessThan(m.strength.impact);
  });
});
