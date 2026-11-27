import { describe, expect, it } from 'vitest';
import { makeWorld, startRace } from '../../../src/testing';

/** The top speed a rival reaches in 12 seconds, with or without its nose. */
function pace(modifiers: string[], nose: boolean): number {
  const w = startRace(makeWorld({ rivals: 1, seed: 5, modifiers }));
  const r = w.cars.find((c) => !c.isPlayer)!;
  // its own pace is what is measured: no boost tiles, no bumps, no animals in the road
  w.pads.length = 0;
  w.mounds.length = 0;
  w.critters.length = 0;
  r.has.front = nose;
  let top = 0;
  for (let i = 0; i < 60 * 12; i++) {
    // (and no boost bottle: whether it opens one off the line is a roll of the dice)
    r.nitro = 0;
    // (nor the rubber band: as far as it knows the human is alongside)
    w.player.progress = r.progress;
    // (nor a mended nose: a crate on its way would give the lamps back)
    r.has.front = nose;
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

  it('asks the client for a night sky', () => {
    const w = makeWorld({ modifiers: ['modifier.lights-out'] });
    expect(w.mods[0]!.def.sky?.dark).toBe(1);
  });
});
