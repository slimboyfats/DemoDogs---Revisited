import { describe, expect, it } from 'vitest';
import { explode } from '@demodogs/sim';
import { propTest } from '../../../src/testing';

describe('prop.container-teal', () => {
  it('stops a car dead and barely notices a hard ram', () => {
    expect(propTest('prop.container-teal', 60).blocked).toBe(true);
    const r = propTest('prop.container-teal', 160);
    expect(r.piece!.down).toBeFalsy();
  });

  it('a few blasts open it up', () => {
    const r = propTest('prop.container-teal', 0);
    const s = r.piece!;
    for (let i = 0; i < 4 && !s.down; i++) explode(r.world, s.x + 8, s.y, 1, null);
    expect(s.down).toBe(true);
  });
});
