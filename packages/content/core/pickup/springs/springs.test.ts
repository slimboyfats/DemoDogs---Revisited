import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@demodogs/shared';
import { loadContent } from '../../../src/index';
import { bench, flatBench, put } from '../../../src/testing';

const GO = { steer: 0, throttle: 1, brake: false, boost: false, fire: false };
const springs = () => loadContent().pickup.get('pickup.springs')!;

/** Drive across a crater 40 px ahead, with or without springs; what happened on the way. */
function crossCrater(sprung: boolean) {
  const w = flatBench();
  const c = w.player;
  put(c, 200, 300, 0, 150);
  w.craters.push({ x: 270, y: 300, r: 22 });
  if (sprung) c.springs = { def: springs(), n: 2 };
  const events: SimEvent[] = [];
  let pitted = false;
  let maxZ = 0;
  for (let i = 0; i < 60; i++) {
    w.step(GO);
    events.push(...w.takeEvents());
    pitted ||= c.pit;
    maxZ = Math.max(maxZ, c.z);
  }
  return { c, events, pitted, maxZ };
}

describe('pickup.springs', () => {
  it('gives springs when it is the only pickup on offer', () => {
    const w = bench();
    (w.venue as { pickups: string[] }).pickups = ['pickup.springs'];
    const c = w.player;
    w.pickups[0]!.on = true;
    put(c, w.pickups[0]!.x, w.pickups[0]!.y, 0);
    w.step();
    expect(c.springs?.n).toBe(springs().charges);
    expect(w.pickups[0]!.on).toBe(false);
  });

  it('leaps clean over a crater that a car without springs drops into, and lands in a puff', () => {
    const bare = crossCrater(false);
    const sprung = crossCrater(true);
    expect(bare.pitted).toBe(true);
    expect(sprung.pitted).toBe(false);
    expect(sprung.maxZ).toBeGreaterThan(10);
    expect(sprung.events.some((e) => e.t === 'hop')).toBe(true);
    expect(sprung.events.some((e) => e.t === 'touchdown')).toBe(true);
    expect(sprung.c.springs?.n).toBe(1);
    // the car comes out the far side faster for not having bogged down
    expect(sprung.c.x).toBeGreaterThan(bare.c.x);
  });

  it('leaps over an oil slick too, and spends nothing on clean road', () => {
    const w = flatBench();
    const c = w.player;
    put(c, 200, 300, 0, 140);
    c.springs = { def: springs(), n: 1 };
    for (let i = 0; i < 40; i++) w.step(GO);
    expect(c.springs?.n).toBe(1);
    const oil = loadContent().material.get('material.oil')!;
    w.spills.push({ def: oil, x: c.x + 45, y: 300, r: 14, owner: -1 });
    for (let i = 0; i < 70; i++) w.step(GO);
    expect(c.springs).toBeNull();
  });

  it('is in every venue', () => {
    for (const v of loadContent().venue.values()) expect(v.pickups).toContain('pickup.springs');
  });
});
