import { describe, expect, it } from 'vitest';
import { MAX_RIPPLES, POST_FS, rippleAt } from './post';

describe('the shockwave lens', () => {
  it('runs out fast at first, fades to nothing and widens as it goes', () => {
    const a = rippleAt(0, 200, 20, 1.4);
    const q = rippleAt(0.25, 200, 20, 1.4);
    const z = rippleAt(1, 200, 20, 1.4);
    expect(a.r).toBe(0);
    expect(a.strength).toBe(1.4);
    // half way out after a quarter of its life
    expect(q.r).toBeCloseTo(100);
    expect(z.r).toBe(200);
    expect(z.strength).toBe(0);
    expect(z.width).toBeGreaterThan(a.width);
  });

  it('snaps its push to whole cells and squashes it onto the ground', () => {
    expect(POST_FS).toContain(`u_ripple[${MAX_RIPPLES}]`);
    expect(POST_FS).toContain('floor(disp / u_scale + 0.5) * u_scale');
    expect(POST_FS).toContain('d.y /= u_ys');
  });
});
