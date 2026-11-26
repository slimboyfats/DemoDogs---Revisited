import { describe, expect, it } from 'vitest';
import { propTest } from '../../../src/testing';

describe('prop.bumper', () => {
  it('throws a car back off it harder than it came, and does not hurt it', () => {
    const r = propTest('prop.bumper', 90);
    const c = r.world.player;
    expect(r.events).toContain('bounce');
    expect(r.blocked).toBe(true);
    expect(c.x).toBeLessThan(r.start - 60);
    expect(r.events).not.toContain('hurt');
    expect(c.hp).toBe(100);
  });
  it('cannot be broken', () => {
    const r = propTest('prop.bumper', 260);
    expect(r.piece!.down).toBeFalsy();
  });
});
