import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import look from './look';

describe('prop.airship', () => {
  it('is long and narrow', () => {
    const L = look.look;
    if (L.kind !== 'prop') throw new Error('not a prop');
    expect(L.part.w).toBeGreaterThan(L.part.h * 1.5);
    expect(L.part.w).toBeLessThanOrEqual(36);
  });
  it('is there to be named in a flyby', () => {
    expect(loadContent().prop.get('prop.airship')!.body).toBe('loose');
  });
});
