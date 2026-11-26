import { describe, expect, it } from 'vitest';
import { BASE_SPEED, NO_CONTROLS } from '@demodogs/shared';
import { explode } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { flatBench, put } from '../../../src/testing';

/** A car on open road, pointing along it. */
function onRoad(car: string, speed = 0) {
  const w = flatBench({ car });
  put(w.player, w.oval!.cx - 400, w.oval!.cy, 0, speed);
  return w;
}

/** How fast it is going after `ticks` at full throttle from a standstill. */
function pace(car: string, ticks: number): number {
  const w = onRoad(car);
  for (let i = 0; i < ticks; i++) w.step({ ...NO_CONTROLS, throttle: 1 });
  return w.player.vf;
}

/** How far round it has turned after a second of full lock at speed. */
function turn(car: string): number {
  const w = onRoad(car, 100);
  for (let i = 0; i < 60; i++) w.step({ ...NO_CONTROLS, throttle: 1, steer: 1 });
  return w.player.h;
}

/** What a blast beside it takes off its armour. */
function hurt(car: string): number {
  const w = onRoad(car);
  const c = w.player;
  const before = c.hp;
  explode(w, c.x, c.y + c.def.body.halfWidth + 6, 1, null);
  return before - c.hp;
}

describe('car.husky', () => {
  it('reaches about its top speed on open road and stops under the brake', () => {
    const w = onRoad('car.husky');
    const def = loadContent().car.get('car.husky')!;
    for (let i = 0; i < 300; i++) w.step({ ...NO_CONTROLS, throttle: 1 });
    expect(w.player.vf).toBeGreaterThan(BASE_SPEED * def.stats.speed * 0.8);
    expect(w.player.vf).toBeLessThan(BASE_SPEED * def.stats.speed * 1.05);
    for (let i = 0; i < 90; i++) w.step({ ...NO_CONTROLS, brake: true });
    expect(w.player.vf).toBeLessThan(0.5);
  });

  it('turns the way it is steered', () => {
    expect(turn('car.husky')).toBeGreaterThan(0.3);
  });

  it('is quicker than the Mutt and shrugs off more than the Whippet', () => {
    expect(pace('car.husky', 45)).toBeGreaterThan(pace('car.mutt', 45));
    expect(pace('car.husky', 300)).toBeGreaterThan(pace('car.mutt', 300));
    expect(hurt('car.husky')).toBeLessThan(hurt('car.whippet'));
  });
});
