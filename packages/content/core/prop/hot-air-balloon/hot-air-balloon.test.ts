import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.hot-air-balloon', () => {
  it('floats: a car drives under it and meets nothing', () => {
    const r = propTest('prop.hot-air-balloon', 120);
    expect(r.blocked).toBe(false);
    expect(r.world.player.vx).toBeGreaterThan(55);
    expect(r.piece!.lift).toBeGreaterThan(20);
    expect(r.piece!.down).toBeFalsy();
  });
});
