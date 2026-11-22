import { describe, expect, it } from 'vitest';
import { BASE_SPEED, NO_CONTROLS } from '@demodogs/shared';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

describe('car.wolfhound', () => {
  it('reaches about its top speed on open road and stops under the brake', () => {
    const w = flatBench({ car: 'car.wolfhound' });
    const def = loadContent().car.get('car.wolfhound')!;
    const [x, y] = [w.oval!.cx - 400, w.oval!.cy];
    put(w.player, x, y, 0);
    for (let i = 0; i < 300; i++) w.step({ ...NO_CONTROLS, throttle: 1 });
    expect(w.player.vf).toBeGreaterThan(BASE_SPEED * def.stats.speed * 0.8);
    expect(w.player.vf).toBeLessThan(BASE_SPEED * def.stats.speed * 1.05);
    for (let i = 0; i < 90; i++) w.step({ ...NO_CONTROLS, brake: true });
    expect(w.player.vf).toBeLessThan(0.5);
  });

  it('turns the way it is steered', () => {
    const w = flatBench({ car: 'car.wolfhound' });
    const [x, y] = [w.oval!.cx - 400, w.oval!.cy];
    put(w.player, x, y, 0, 100);
    for (let i = 0; i < 20; i++) w.step({ ...NO_CONTROLS, throttle: 1, steer: 1 });
    expect(w.player.h).toBeGreaterThan(0.3);
  });
});
