import { describe, expect, it } from 'vitest';
import { makeWorld, startRace } from '../../../src/testing';

/** The top speed a rival reaches in 12 seconds, with or without its nose. */
function pace(modifiers: string[], nose: boolean): number {
  const w = startRace(makeWorld({ rivals: 1, seed: 3, modifiers }));
  const r = w.cars.find((c) => !c.isPlayer)!;
  r.has.front = nose;
  let top = 0;
  for (let i = 0; i < 60 * 12; i++) {
    w.step();
    top = Math.max(top, r.vf);
  }
  return top;
}

describe('modifier.lights-out', () => {
  it('slows a rival that has lost its lamps, at night only', () => {
    const NIGHT = ['modifier.lights-out'];
    expect(pace(NIGHT, false)).toBeLessThan(pace(NIGHT, true) * 0.92);
    expect(pace([], false)).toBeCloseTo(pace([], true), 5);
  });

  it('asks the client for darkness and lamps', () => {
    const w = makeWorld({ modifiers: ['modifier.lights-out'] });
    expect(w.mods[0]!.def.lamps).toBe(true);
    expect(w.mods[0]!.def.tint).not.toBe('#ffffff');
  });
});
