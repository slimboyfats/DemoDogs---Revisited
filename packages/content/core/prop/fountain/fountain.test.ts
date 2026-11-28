import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { propTest } from '../../../src/testing';

describe('prop.fountain', () => {
  it('is a stone basin: a car that hits it stops', () => {
    const r = propTest('prop.fountain', 120);
    expect(r.blocked).toBe(true);
  });
  it('throws water up from the top of its stem', () => {
    const def = loadContent().prop.get('prop.fountain')!;
    expect(def.spout!.what).toBe('water');
    expect(def.spout!.at[2]).toBeGreaterThan(8);
  });
});
