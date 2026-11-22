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

  it('comes down in a few big pieces that ring and spark, where brick and glass go to bits', () => {
    const C = loadContent();
    const steel = C.material.get('material.steel')!.breaks;
    const brick = C.material.get('material.brick')!.breaks;
    const glass = C.material.get('material.glass')!.breaks;
    const rubber = C.material.get('material.rubber')!.breaks;
    expect(steel.sparks).toBe(true);
    expect(steel.brittle).toBe(0);
    expect(steel.piece).toBeGreaterThan(brick.piece);
    expect(brick.piece).toBeGreaterThan(glass.piece);
    expect(glass.grit).toBeGreaterThan(brick.grit);
    expect(brick.grit).toBeGreaterThan(steel.grit);
    // rubber bounces most, and only light stuff rides the wind
    for (const o of C.material.values())
      expect(rubber.bounce).toBeGreaterThanOrEqual(o.breaks.bounce);
    expect(C.material.get('material.wood')!.breaks.drift).toBeGreaterThan(steel.drift);
    // a pool of oil is not something that breaks: it gets the plain rule
    expect(C.material.get('material.oil')!.breaks.piece).toBe(7);
  });
});
