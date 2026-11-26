import { describe, expect, it } from 'vitest';
import { grant } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { bench } from '../../../src/testing';

describe('pickup.rockets', () => {
  it('always hands over rockets', () => {
    const w = bench();
    const c = w.player;
    grant(w, c, loadContent().pickup.get('pickup.rockets')!);
    expect(c.weapon?.id).toBe('weapon.rocket');
    expect(c.ammo).toBeGreaterThan(0);
  });
});
