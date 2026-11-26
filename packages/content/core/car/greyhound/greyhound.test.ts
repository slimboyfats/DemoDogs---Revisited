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

describe('car.greyhound', () => {
  it('reaches about its top speed on open road and stops under the brake', () => {
    // (it is long-geared: from a rolling start, or it runs out of road before it runs out of gears)
    const w = onRoad('car.greyhound', 120);
    const def = loadContent().car.get('car.greyhound')!;
    for (let i = 0; i < 300; i++) w.step({ ...NO_CONTROLS, throttle: 1 });
    expect(w.player.vf).toBeGreaterThan(BASE_SPEED * def.stats.speed * 0.8);
    expect(w.player.vf).toBeLessThan(BASE_SPEED * def.stats.speed * 1.05);
    for (let i = 0; i < 90; i++) w.step({ ...NO_CONTROLS, brake: true });
    expect(w.player.vf).toBeLessThan(0.5);
  });

  it('turns the way it is steered', () => {
    expect(turn('car.greyhound')).toBeGreaterThan(0.3);
  });

  it('is the fastest car there is in a straight line, given the room to wind up', () => {
    const flying = (car: string): number => {
      const w = onRoad(car, 120);
      for (let i = 0; i < 300; i++) w.step({ ...NO_CONTROLS, throttle: 1 });
      return w.player.vf;
    };
    const top = flying('car.greyhound');
    for (const id of loadContent().car.keys())
      if (id !== 'car.greyhound') expect(top).toBeGreaterThan(flying(id));
    // and it is slower off the line than the Wolfhound it outruns
    expect(pace('car.greyhound', 60)).toBeLessThan(pace('car.wolfhound', 60));
  });

  it('turns wider than the Wolfhound and is hurt more by the same blast', () => {
    expect(turn('car.greyhound')).toBeLessThan(turn('car.wolfhound'));
    expect(hurt('car.greyhound')).toBeGreaterThan(hurt('car.wolfhound'));
  });
});
