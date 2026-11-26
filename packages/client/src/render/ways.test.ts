import { describe, expect, it } from 'vitest';
import { makeWorld } from '@demodogs/content/testing';
import { SKINS, WAY_STEP, wayPainted, waysOf } from './ways';

describe('ways', () => {
  it('a venue with no path pieces has none', () => {
    expect(waysOf(makeWorld())).toBeNull();
  });

  it('joins the pieces of a secret way into lines the ground can paint', () => {
    const w = makeWorld({ venue: 'venue.bonefish-bay' });
    const W = waysOf(w)!;
    // every piece is on a way, and each jump piece has a look
    expect(W.pieces.length).toBe(w.paths.length);
    for (const s of w.paths) if (s.def.leap) expect(W.skins.get(s)).toBeDefined();
    // two ways: from the road to the takeoff, and from the landing back to the road
    let firsts = 0;
    for (let i = 0; i < W.n; i++) if (Math.floor(W.samples[W.n * 4 + i * 4 + 1]! / 4) & 1) firsts++;
    expect(firsts).toBe(2);
    // samples lie a step apart along a way
    for (let i = 1; i < W.n; i++) {
      if (Math.floor(W.samples[W.n * 4 + i * 4 + 1]! / 4) & 1) continue;
      const d = Math.hypot(
        W.samples[i * 4]! - W.samples[i * 4 - 4]!,
        W.samples[i * 4 + 1]! - W.samples[i * 4 - 3]!,
      );
      expect(d).toBeGreaterThan(WAY_STEP * 0.6);
      expect(d).toBeLessThan(WAY_STEP * 1.4);
    }
    // sound planks and old boards are both on it
    const worn = new Set<number>();
    for (let i = 0; i < W.n; i++) worn.add(W.samples[W.n * 4 + i * 4]!);
    expect(worn.has(SKINS.indexOf('wood'))).toBe(true);
    expect(worn.has(SKINS.indexOf('boards'))).toBe(true);
    // the middle of every plain piece is on a way
    const { gw, q, data } = W.near;
    for (const s of w.paths)
      expect(data[Math.floor(s.y / q) * gw + Math.floor(s.x / q)]).not.toBe(0xffff);
  });

  it('a way beside the road runs on under it', () => {
    const w = makeWorld({ venue: 'venue.tailspin-funfair' });
    const W = waysOf(w)!;
    let under = 0;
    for (let i = 0; i < W.n; i++)
      if (w.grid!.at(W.samples[i * 4]!, W.samples[i * 4 + 1]!) < w.road / 2 - 20) under++;
    expect(under).toBeGreaterThan(10);
  });

  it('only pieces the ground has claimed are left to it', () => {
    const w = makeWorld({ venue: 'venue.castle-growl' });
    waysOf(w);
    expect(w.paths.some(wayPainted)).toBe(false);
    waysOf(w, true);
    expect(w.paths.every(wayPainted)).toBe(true);
  });
});
