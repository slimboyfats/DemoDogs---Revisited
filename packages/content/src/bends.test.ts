import { describe, expect, it } from 'vitest';
import { loadContent } from './index';
import { makeWorld } from './testing';

/**
 * What a lap asks of a driver: every race venue has a bend that cannot be taken flat out (a
 * hairpin on the racing line) and bends that are worth a drift (long and tight enough to hold a
 * slide to its first stage). The bends are read off the racing line, as the rivals read them.
 */
describe('bends', () => {
  const races = [...loadContent().venue.values()].filter((v) => v.track).map((v) => v.id);

  /** Each bend of the line tighter than `radius`: how tight it gets, and the degrees it turns. */
  function bends(id: string, radius: number): { r: number; turn: number }[] {
    const w = makeWorld({ venue: id });
    const T = w.track!;
    const k = w.line!.k;
    const N = T.n;
    const at = (i: number) => k[((i % N) + N) % N]!;
    const tight = (i: number) => Math.abs(at(i)) > 1 / radius;
    let from = 0;
    while (from < N && tight(from)) from++;
    const out: { r: number; turn: number }[] = [];
    for (let n = 0; n < N; n++) {
      if (!tight(from + n)) continue;
      // (a bend ends where the line straightens or starts to turn the other way)
      const way = Math.sign(at(from + n));
      let most = 0;
      let turn = 0;
      for (; n < N && tight(from + n) && Math.sign(at(from + n)) === way; n++) {
        most = Math.max(most, Math.abs(at(from + n)));
        turn += at(from + n) * T.step;
      }
      n--;
      out.push({ r: 1 / most, turn: Math.abs((turn * 180) / Math.PI) });
    }
    return out;
  }

  it('every race venue has a hairpin that punishes full speed', () => {
    for (const id of races) {
      const hard = bends(id, 300).filter((b) => b.r < 75 && b.turn > 60);
      expect(hard.length, id).toBeGreaterThanOrEqual(1);
      // (one or two a lap, not a lap of them)
      expect(hard.length, id).toBeLessThanOrEqual(3);
    }
  });

  it('every race venue has bends worth drifting round', () => {
    for (const id of races) {
      const drift = bends(id, 300).filter((b) => b.turn > 30);
      expect(drift.length, id).toBeGreaterThanOrEqual(2);
    }
  });
});
