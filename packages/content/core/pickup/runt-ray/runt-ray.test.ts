import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@demodogs/shared';
import { grant } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { flatBench, makeWorld, put, startRace } from '../../../src/testing';

const GO = { steer: 0, throttle: 1, brake: false, boost: false, fire: false };
const def = () => loadContent().pickup.get('pickup.runt-ray')!;

describe('pickup.runt-ray', () => {
  it('in a race, zaps every other car, behind as well as ahead, and slows them', () => {
    const w = startRace(makeWorld());
    for (let i = 0; i < 30; i++) w.step();
    const c = w.player;
    const others = w.cars.filter((o) => o !== c);
    expect(others.some((o) => o.progress > c.progress)).toBe(true);
    expect(others.some((o) => o.progress < c.progress)).toBe(true);
    w.takeEvents();
    expect(grant(w, c, def())).toBe(`RUNT RAY x${others.length}`);
    for (const o of others) expect(o.morph?.def.id).toBe('pickup.runt-ray');
    expect(c.morph).toBeNull();
    // each one is struck by a bolt
    expect(w.takeEvents().filter((e) => e.t === 'arc')).toHaveLength(others.length);
    for (let i = 0; i < 30; i++) w.step();
    for (const o of others) {
      expect(o.size).toBeCloseTo(def().scale!, 5);
      expect(o.pace).toBeLessThan(0.8);
    }
  });

  it('holds the car in front the longest and the car at the back the least', () => {
    const w = startRace(makeWorld());
    for (let i = 0; i < 30; i++) w.step();
    const order = w.standings();
    const c = order[3]!;
    grant(w, c, def());
    const first = order[0]!.morph!.t;
    const last = order[order.length - 1]!.morph!.t;
    expect(first).toBeCloseTo(def().seconds!, 5);
    expect(last).toBeCloseTo(def().seconds! * def().tail!, 5);
    for (let i = 1; i < order.length; i++)
      if (order[i] !== c && order[i - 1] !== c)
        expect(order[i]!.morph!.t).toBeLessThanOrEqual(order[i - 1]!.morph!.t);
  });

  it('in a derby, takes the rivals within its reach', () => {
    const w = flatBench({ rivals: 2 });
    const [c, near, far] = [w.player, w.cars[1]!, w.cars[2]!];
    far.ai = null;
    put(c, 300, 300, 0);
    put(near, 300 + def().radius! - 40, 300, 0);
    put(far, 300 + def().radius! + 40, 300, 0);
    grant(w, c, def());
    expect(near.morph?.def.kind).toBe('shrink');
    expect(far.morph).toBeNull();
    for (let i = 0; i < 60 * (def().seconds! + 0.5); i++) w.step();
    expect(near.size).toBe(1);
  });

  it('leaves its victim to be flattened by a car of ordinary size', () => {
    const w = flatBench();
    const c = w.player;
    const o = w.cars[1]!;
    put(c, 300, 300, 0, 0);
    put(o, 420, 300, Math.PI / 2, 0);
    o.morph = { def: def(), t: 7 };
    const hp = o.hp;
    const events: SimEvent[] = [];
    for (let i = 0; i < 150; i++) {
      w.step(GO);
      events.push(...w.takeEvents());
    }
    expect(events.some((e) => e.t === 'catchup' && e.what === 'squash' && e.by === c.index)).toBe(
      true,
    );
    expect(o.hp).toBeLessThan(hp - 5);
    // driven over, not shunted along
    expect(c.x).toBeGreaterThan(o.x + 20);
    expect(Math.abs(o.x - 420)).toBeLessThan(25);
  });

  it('is stopped by a shield, and only brings a swollen car back down', () => {
    const C = loadContent();
    const w = flatBench({ rivals: 2 });
    const [c, a, b] = [w.player, w.cars[1]!, w.cars[2]!];
    b.ai = null;
    put(c, 300, 300, 0);
    put(a, 360, 300, 0);
    put(b, 300, 360, 0);
    grant(w, a, C.pickup.get('pickup.dome')!);
    grant(w, b, C.pickup.get('pickup.big-dog')!);
    grant(w, c, def());
    expect(a.morph).toBeNull();
    expect(b.morph).toBeNull();
    for (let i = 0; i < 60; i++) w.step();
    expect(a.size).toBe(1);
    expect(b.size).toBe(1);
  });

  it('is in every venue, the derbies too', () => {
    for (const v of loadContent().venue.values()) expect(v.pickups).toContain('pickup.runt-ray');
  });
});
