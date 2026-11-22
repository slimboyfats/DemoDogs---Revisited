import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('material.wood', () => {
  it('burns far more easily than it breaks', () => {
    const C = loadContent();
    const m = C.material.get('material.wood')!;
    const wood = C.material.get('material.wood')!;
    expect(m.strength.heat).toBeLessThan(m.strength.blast);
    expect(wood).toBe(m);
  });
});
