import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@demodogs/shared';
import { HUNT_HIGH, grant, odds } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { flatBench, makeWorld, put, startRace } from '../../../src/testing';

const def = () => loadContent().pickup.get('pickup.bloodhound')!;

/** A race a second in, the last car having just opened a Bloodhound; steps until it is over. */
function hunt(prepare?: (first: ReturnType<typeof makeWorld>['player']) => void) {
  const w = startRace(makeWorld());
  // (long enough for the field to string out: there is a pack to fly over)
  for (let i = 0; i < 60 * 12; i++) w.step();
  const order = w.standings();
  const first = order[0]!;
  const last = order[order.length - 1]!;
  for (const c of w.cars) c.hp = 100;
  prepare?.(first);
  const label = grant(w, last, def());
  const events: SimEvent[] = [];
  let top = 0;
  for (let i = 0; i < 60 * 12 && w.hunters.length; i++) {
    w.step();
    top = Math.max(top, w.hunters[0]?.z ?? 0);
    events.push(...w.takeEvents());
  }
  return { w, first, last, label, events, top };
}

describe('pickup.bloodhound', () => {
  it('flies over the pack and lands on the car in front, which is hurt and stalls', () => {
    const { w, first, last, label, events, top } = hunt();
    expect(label).toBe(`BLOODHOUND: AFTER ${first.name}`);
    expect(w.hunters).toHaveLength(0);
    const said = events.flatMap((e) => (e.t === 'catchup' ? [`${e.what}:${e.car}`] : []));
    expect(said).toContain(`hunt-lock:${first.index}`);
    expect(said).toContain(`hunt-hit:${first.index}`);
    expect(top).toBeGreaterThan(HUNT_HIGH - 1);
    expect(first.hp).toBeLessThan(100);
    expect(
      events.some((e) => e.t === 'stall' && e.car === first.index && e.by === last.index),
    ).toBe(true);
  });

  it('lands on a car that cannot be hurt without stopping it', () => {
    const { first, events } = hunt((c) => (c.invuln = 60));
    expect(events.some((e) => e.t === 'catchup' && e.what === 'hunt-hit')).toBe(true);
    expect(first.hp).toBe(100);
    expect(first.stall ?? 0).toBe(0);
  });

  it('goes after the next car along when the leader opens it', () => {
    const w = startRace(makeWorld());
    for (let i = 0; i < 60; i++) w.step();
    const [first, second] = w.standings();
    expect(grant(w, first!, def())).toBe(`BLOODHOUND: AFTER ${second!.name}`);
  });

  it('with no road, flies at the nearest rival', () => {
    const w = flatBench({ rivals: 2 });
    const [c, near, far] = [w.player, w.cars[1]!, w.cars[2]!];
    far.ai = null;
    put(c, 300, 300, 0);
    put(near, 520, 300, 0);
    put(far, 300, 700, 0);
    grant(w, c, def());
    for (let i = 0; i < 600 && w.hunters.length; i++) w.step();
    expect(near.hp).toBeLessThan(100);
    expect(far.hp).toBe(100);
  });

  it('is at every race venue, and the car in front never rolls it', () => {
    expect(odds(def(), false, 0)).toBe(0);
    expect(odds(def(), false, 1)).toBeGreaterThan(def().weight * 2);
    for (const v of loadContent().venue.values())
      expect(v.pickups.includes('pickup.bloodhound')).toBe(v.mode === 'mode.race');
  });
});
