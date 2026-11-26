import { describe, expect, it } from 'vitest';
import { stand } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

describe('prop.rickety-boards', () => {
  const run = (prop: string) => {
    const w = flatBench();
    const x = w.oval!.cx - 200;
    const y = w.oval!.cy;
    const def = loadContent().prop.get(prop)!;
    for (let k = 0; k < 12; k++) stand(w, def, x + k * 40, y, 0, 0);
    put(w.player, x, y, 0, 150);
    let sway = 0;
    let rock = 0;
    for (let i = 0; i < 90; i++) {
      w.step({ steer: 0, throttle: 1, brake: false, boost: false, fire: false });
      sway = Math.max(sway, Math.abs(w.player.h));
      rock = Math.max(rock, Math.abs(w.player.bank));
    }
    return { sway, rock, x: w.player.x - x, y: Math.abs(w.player.y - y) };
  };

  it('is as fast as sound planks, but the car sways and rocks on it', () => {
    const sound = run('prop.boardwalk');
    const loose = run('prop.rickety-boards');
    expect(sound.sway).toBeLessThan(0.005);
    expect(loose.sway).toBeGreaterThan(0.08);
    expect(loose.rock).toBeGreaterThan(sound.rock + 0.05);
    expect(loose.x).toBeGreaterThan(sound.x * 0.95);
    // (it is thrown about, not off: a car left alone is still on the boards)
    expect(loose.y).toBeLessThan(22);
  });
});
