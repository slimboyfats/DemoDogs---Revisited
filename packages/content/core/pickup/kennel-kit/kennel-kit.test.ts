import { GUARD_KINDS } from '@demodogs/shared';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { bench, put } from '../../../src/testing';

const kit = () => loadContent().pickup.get('pickup.kennel-kit')!;

describe('pickup.kennel-kit', () => {
  it('holds one of each kind of guard', () => {
    const C = loadContent();
    const kinds = kit().kits!.map((id) => C.pickup.get(id)!.kind);
    expect([...kinds].sort()).toEqual([...GUARD_KINDS].sort());
  });

  it('fits one guard when it is the only pickup on offer, and says which', () => {
    const w = bench();
    (w.venue as { pickups: string[] }).pickups = ['pickup.kennel-kit'];
    const c = w.player;
    w.pickups[0]!.on = true;
    put(c, w.pickups[0]!.x, w.pickups[0]!.y, 0);
    w.takeEvents();
    w.step();
    const fitted = GUARD_KINDS.filter((k) => c.guards[k]);
    expect(fitted.length).toBe(1);
    const got = c.guards[fitted[0]!]!.def;
    const ev = w.takeEvents();
    expect(ev.find((e) => e.t === 'guard')).toMatchObject({ what: 'on', id: got.id, car: c.index });
    const label = (ev.find((e) => e.t === 'pickup') as { label: string }).label;
    expect(label.startsWith(got.meta.name.toUpperCase())).toBe(true);
  });

  it('hands out every guard over enough crates, the same ones for the same seed', () => {
    const roll = (seed: number) => {
      const w = bench({ seed });
      (w.venue as { pickups: string[] }).pickups = ['pickup.kennel-kit'];
      const got: string[] = [];
      for (let i = 0; i < 120; i++) {
        const c = w.player;
        c.guards = {};
        w.pickups[0]!.on = true;
        put(c, w.pickups[0]!.x, w.pickups[0]!.y, 0);
        w.step();
        got.push(GUARD_KINDS.find((k) => c.guards[k])!);
      }
      return got;
    };
    const a = roll(3);
    expect(new Set(a).size).toBe(GUARD_KINDS.length);
    expect(roll(3)).toEqual(a);
  });

  it('is in every venue', () => {
    for (const v of loadContent().venue.values()) expect(v.pickups).toContain('pickup.kennel-kit');
  });
});
