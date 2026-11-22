import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('material.steel', () => {
  it('stands more blast than anything else', () => {
    const C = loadContent();
    const m = C.material.get('material.steel')!;
    const wood = C.material.get('material.wood')!;
    for (const o of C.material.values())
      expect(m.strength.blast).toBeGreaterThanOrEqual(o.strength.blast);
    expect(wood.strength.heat).toBeLessThan(m.strength.heat);
  });
});
