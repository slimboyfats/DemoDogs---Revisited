import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.overpass-pillar', () => {
  it('is solid and stands a ram', () => {
    const r = propTest('prop.overpass-pillar', 140);
    expect(r.blocked).toBe(true);
    expect(r.piece!.down).toBeFalsy();
  });
});
