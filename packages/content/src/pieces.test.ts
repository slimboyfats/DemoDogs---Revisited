import { describe, expect, it } from 'vitest';
import { boostAhead, explode, padAt, putProp } from '@demodogs/sim';
import { loadContent } from './index';
import { flatBench, makeWorld, put, runUntil, startRace } from './testing';

/** Track pieces as the venues lay them: tiles on the straights, animals by the road, crops in rows. */
describe('track pieces', () => {
  const races = [...loadContent().venue.values()].filter((v) => v.track).map((v) => v.id);

  it('every race venue has boost tiles and a ramp, on the road, clear of the grid and each other', () => {
    for (const id of races) {
      const w = makeWorld({ venue: id });
      const T = w.track!;
      const boosts = w.pads.filter((s) => s.def.pad!.kind === 'boost');
      const ramps = w.pads.filter((s) => s.def.pad!.kind === 'jump');
      expect(boosts.length, id).toBeGreaterThanOrEqual(4);
      expect(ramps.length, id).toBeGreaterThanOrEqual(1);
      for (const s of w.pads) {
        expect(w.offroad(s.x, s.y), `${id} ${s.def.id}`).toBe(false);
        const i = w.grid!.nearest(s.x, s.y);
        // it points the way the road runs there
        expect(Math.cos(s.rot - T.a[i]!), `${id} ${s.def.id}`).toBeGreaterThan(0.95);
        // and no car starts on it
        expect(i, id).toBeGreaterThan(20);
        expect(i, id).toBeLessThan(T.n - 40);
        expect(w.deckAt(i), id).toBe(0);
      }
      // a ramp has room to land: the next tile is a good way on
      for (const r of ramps) {
        const i = w.grid!.nearest(r.x, r.y);
        for (const o of w.pads) {
          if (o === r) continue;
          const d = (w.grid!.nearest(o.x, o.y) - i + T.n) % T.n;
          expect(d * T.step, `${id} after its ramp`).toBeGreaterThan(200);
        }
      }
    }
  });

  it('the same venue is dressed the same way every time', () => {
    const shape = () => {
      const w = makeWorld({ venue: 'venue.kennel-loop' });
      return [
        w.statics.length,
        w.pads.map((s) => `${Math.round(s.x)},${Math.round(s.y)}`).join(' '),
        w.critters.map((k) => `${k.def.id}@${Math.round(k.x)},${Math.round(k.y)}`).join(' '),
      ].join('|');
    };
    expect(shape()).toBe(shape());
  });

  it('a race with animals in it is the same race twice', () => {
    const run = () => {
      const w = makeWorld({ venue: 'venue.kennel-loop', autopilot: true, seed: 3 });
      expect(w.critters.length).toBeGreaterThan(20);
      runUntil(w, () => false, 60 * 25);
      return w.hash();
    };
    expect(run()).toBe(run());
  });

  it('rivals take the tiles, and a race over ramps still runs to the finish', () => {
    const w = makeWorld({ venue: 'venue.pinewood-sprint', autopilot: true });
    const seen = new Set<string>();
    runUntil(
      w,
      (w) => {
        for (const e of w.takeEvents()) if (e.t === 'pad') seen.add(`${e.kind}${e.car}`);
        return w.phase === 'over';
      },
      60 * 300,
    );
    expect(w.phase).toBe('over');
    expect([...seen].filter((k) => k.startsWith('boost')).length).toBeGreaterThanOrEqual(3);
    expect([...seen].filter((k) => k.startsWith('jump')).length).toBeGreaterThanOrEqual(1);
  });

  it('an AI driver sees a boost tile ahead that points its way, and not one that points back', () => {
    const w = flatBench();
    const c = w.player;
    const def = loadContent().prop.get('prop.boost-pad')!;
    put(c, w.oval!.cx - 100, w.oval!.cy, 0, 100);
    putProp(w, def, c.x + 70, c.y + 6, 0, w.rng);
    expect(boostAhead(w, c, 120)).not.toBeNull();
    expect(padAt(w, c.x + 70, c.y)).not.toBeNull();
    w.pads[0]!.rot = Math.PI;
    expect(boostAhead(w, c, 120)).toBeNull();
  });

  it('a blast throws the animals near it and puts the birds up', () => {
    const w = startRace(flatBench());
    const C = loadContent();
    const x = w.oval!.cx;
    const y = w.oval!.cy;
    putProp(w, C.prop.get('prop.sheep')!, x, y, 0, w.rng);
    putProp(w, C.prop.get('prop.crows')!, x + 30, y, 0, w.rng);
    w.step();
    expect(w.critters.every((k) => k.state !== 'air' && k.state !== 'fly')).toBe(true);
    explode(w, x, y, 1, null);
    const sheep = w.critters.filter((k) => k.def.id === 'prop.sheep');
    const crows = w.critters.filter((k) => k.def.id === 'prop.crows');
    expect(sheep.some((k) => k.state === 'air')).toBe(true);
    expect(crows.every((k) => k.state === 'fly')).toBe(true);
    runUntil(w, () => false, 60 * 4);
    expect(sheep.every((k) => k.z === 0)).toBe(true);
  });
});
