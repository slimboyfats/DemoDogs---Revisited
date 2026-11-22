import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('material.brick', () => {
  it('outlasts wood in a blast and does not burn', () => {
    const C = loadContent();
    const m = C.material.get('material.brick')!;
    const wood = C.material.get('material.wood')!;
    expect(m.strength.blast).toBeGreaterThan(wood.strength.blast);
    expect(m.strength.heat).toBeGreaterThan(4);
  });
});
