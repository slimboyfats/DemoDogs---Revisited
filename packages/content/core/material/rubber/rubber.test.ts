import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('material.rubber', () => {
  it('soaks up a ram better than a blast', () => {
    const C = loadContent();
    const m = C.material.get('material.rubber')!;
    const wood = C.material.get('material.wood')!;
    expect(m.strength.impact).toBeGreaterThan(m.strength.blast);
    expect(wood.strength.heat).toBeLessThan(m.strength.heat);
  });
});
