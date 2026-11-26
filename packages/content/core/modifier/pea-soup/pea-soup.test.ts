import { describe, expect, it } from 'vitest';
import { makeWorld, startRace } from '../../../src/testing';

/** A race's state after ten seconds, with or without the fog. */
function after(modifiers: string[]): string {
  const w = startRace(makeWorld({ rivals: 3, seed: 9, modifiers }));
  for (let i = 0; i < 60 * 10; i++) w.step();
  return w.cars.map((c) => `${c.x.toFixed(3)},${c.y.toFixed(3)},${c.hp}`).join(' ');
}

describe('modifier.pea-soup', () => {
  it('asks the client for ground fog', () => {
    const w = makeWorld({ modifiers: ['modifier.pea-soup'] });
    expect(w.mods[0]!.def.sky?.fog).toBe(1);
    expect(w.mods[0]!.def.sky?.dark).toBe(0);
  });

  it('is looks only: the race runs the same with it as without', () => {
    expect(after(['modifier.pea-soup'])).toBe(after([]));
  });
});
