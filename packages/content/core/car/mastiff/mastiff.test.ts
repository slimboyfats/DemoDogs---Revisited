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

describe('car.mastiff', () => {
  it('reaches about its top speed on open road and stops under the brake', () => {
    const w = onRoad('car.mastiff');
    const def = loadContent().car.get('car.mastiff')!;
    for (let i = 0; i < 300; i++) w.step({ ...NO_CONTROLS, throttle: 1 });
    expect(w.player.vf).toBeGreaterThan(BASE_SPEED * def.stats.speed * 0.8);
    expect(w.player.vf).toBeLessThan(BASE_SPEED * def.stats.speed * 1.05);
    for (let i = 0; i < 90; i++) w.step({ ...NO_CONTROLS, brake: true });
    expect(w.player.vf).toBeLessThan(0.5);
  });

  it('turns the way it is steered', () => {
    expect(turn('car.mastiff')).toBeGreaterThan(0.3);
  });

  it('rides on six wheels', () => {
    expect(loadContent().car.get('car.mastiff')!.wheels).toHaveLength(3);
  });

  it('is slow off the line and takes the least from a blast', () => {
    expect(pace('car.mastiff', 45)).toBeLessThan(pace('car.bruiser', 45));
    const took = hurt('car.mastiff');
    expect(took).toBeGreaterThan(0);
    for (const id of loadContent().car.keys())
      if (id !== 'car.mastiff') expect(took).toBeLessThan(hurt(id));
  });

  it('meets a Mutt head on and is knocked back less than the Mutt is', () => {
    const w = flatBench({
      car: 'car.mastiff',
      field: [{ car: 'car.mutt', name: 'MUTT', paint: '#e2682a' }],
    });
    const mutt = w.cars.find((c) => !c.isPlayer)!;
    const [x, y] = [w.oval!.cx - 400, w.oval!.cy];
    put(w.player, x, y, 0, 60);
    put(mutt, x + 40, y, Math.PI, 60);
    // the tick they meet: each one's speed along the road jumps
    let [own, other] = [0, 0];
    for (let i = 0; i < 40 && !other; i++) {
      const [a, b] = [w.player.vx, mutt.vx];
      w.step(NO_CONTROLS);
      if (Math.abs(mutt.vx - b) > 10) [own, other] = [a - w.player.vx, mutt.vx - b];
    }
    expect(other).toBeGreaterThan(20);
    expect(own).toBeLessThan(other * 0.8);
  });
});
