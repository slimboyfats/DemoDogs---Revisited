import { describe, expect, it } from 'vitest';
import { grant, heft } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { makeWorld, startRace } from '../../../src/testing';

const def = () => loadContent().pickup.get('pickup.lead-collar')!;

describe('pickup.lead-collar', () => {
  it('lands on the car in front, slows it and makes it heavier, then drops off', () => {
    const w = startRace(makeWorld());
    for (let i = 0; i < 30; i++) w.step();
    const order = w.standings();
    const first = order[0]!;
    const last = order[order.length - 1]!;
    const m0 = heft(first);
    w.takeEvents();
    expect(grant(w, last, def())).toBe(`LEAD COLLAR ON ${first.name}`);
    expect(first.collar?.by).toBe(last.index);
    w.step();
    expect(first.pace).toBeLessThanOrEqual(def().pace!);
    expect(heft(first)).toBeGreaterThan(m0);
    for (let i = 0; i < 60 * (def().seconds! + 0.2); i++) w.step();
    expect(first.collar).toBeNull();
    const said = w.takeEvents().flatMap((e) => (e.t === 'catchup' ? [e.what] : []));
    expect(said.filter((s) => s.startsWith('collar'))).toEqual(['collar', 'collar-off']);
  });

  it('goes on the next car along when the leader picks it up', () => {
    const w = startRace(makeWorld());
    for (let i = 0; i < 30; i++) w.step();
    const [first, second] = w.standings();
    grant(w, first!, def());
    expect(first!.collar).toBeNull();
    expect(second!.collar).not.toBeNull();
  });

  it('is at every race venue, and the car in front never rolls it', () => {
    expect(def().lead).toBe(0);
    for (const v of loadContent().venue.values())
      expect(v.pickups.includes('pickup.lead-collar')).toBe(v.mode === 'mode.race');
  });
});
