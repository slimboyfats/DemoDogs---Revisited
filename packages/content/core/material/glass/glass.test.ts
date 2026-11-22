import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('material.glass', () => {
  it('is the weakest thing there is to a ram or a blast', () => {
    const C = loadContent();
    const m = C.material.get('material.glass')!;
    const wood = C.material.get('material.wood')!;
    for (const o of C.material.values())
      expect(m.strength.impact).toBeLessThanOrEqual(o.strength.impact);
    expect(m.strength.blast).toBeLessThan(wood.strength.blast);
  });
});
