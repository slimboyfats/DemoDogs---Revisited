import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.window-wall', () => {
  it('a car drives straight through it', () => {
    const r = propTest('prop.window-wall', 150);
    const s = r.piece!;
    expect(s.down).toBe(true);
    expect(r.blocked).toBe(false);
    expect(r.world.player.x).toBeGreaterThan(s.x);
  });
});
