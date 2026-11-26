import { describe, expect, it } from 'vitest';
import { explode, footing } from '@demodogs/sim';
import { makeWorld, runUntil } from '../../../src/testing';

describe('venue.sunbake-canyon', () => {
  it('an all-AI race runs to the finish', () => {
    const w = makeWorld({ venue: 'venue.sunbake-canyon', car: 'car.mutt', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 300);
    expect(w.phase).toBe('over');
    expect(w.finishers.length).toBeGreaterThanOrEqual(1);
  });

  it('has arches over the road, cliffs along it, sand on it and a mining camp off it', () => {
    const w = makeWorld({ venue: 'venue.sunbake-canyon' });
    const of = (id: string) => w.statics.filter((s) => s.def.id === id);
    const arches = new Set(of('prop.arch-span').map((s) => s.group));
    expect(arches.size).toBeGreaterThanOrEqual(3);
    // every arch block hangs over the road
    expect(of('prop.arch-span').filter((s) => !w.offroad(s.x, s.y)).length).toBeGreaterThan(20);
    expect(of('prop.sandstone-cliff').length).toBeGreaterThan(60);
    expect(of('prop.cactus').length).toBeGreaterThan(20);
    expect(w.props.filter((p) => p.def.id === 'prop.dynamite-crate').length).toBeGreaterThan(10);
    const sand = w.spills.filter((s) => s.def.id === 'material.sand');
    expect(sand.filter((s) => !w.offroad(s.x, s.y)).length).toBeGreaterThanOrEqual(8);
    expect(footing(w, sand[0]!.x, sand[0]!.y)[1]).toBeGreaterThan(1);
    // nothing solid stands in the road at the start
    expect(
      w.statics.filter((s) => s.def.solid && !s.down && w.grid!.at(s.x, s.y) < w.road / 2).length,
    ).toBe(0);
  });

  it('a rocket under an arch brings slabs down across the road', () => {
    const w = makeWorld({ venue: 'venue.sunbake-canyon' });
    const span = w.statics.find((s) => s.def.id === 'prop.arch-span')!;
    const before = w.statics.length;
    for (let i = 0; i < 3; i++) explode(w, span.x, span.y, 1.2, null);
    const rocks = w.statics.slice(before).filter((s) => s.def.id === 'prop.rockfall');
    expect(rocks.length).toBeGreaterThan(0);
    // most of them land in the road (a blast that big also takes bites out of the cliffs by it)
    const onRoad = rocks.filter((s) => !w.offroad(s.x, s.y)).length;
    expect(onRoad * 2).toBeGreaterThanOrEqual(rocks.length);
  });

  it('the racers get through a fallen arch and still finish', () => {
    const w = makeWorld({ venue: 'venue.sunbake-canyon', autopilot: true, seed: 2 });
    for (const s of w.statics.filter((s) => s.def.id === 'prop.arch-span'))
      explode(w, s.x, s.y, 1.2, null);
    w.takeEvents();
    runUntil(w, (w) => w.phase === 'over', 60 * 300);
    expect(w.phase).toBe('over');
    expect(w.finishers.length).toBeGreaterThanOrEqual(3);
  });
});
