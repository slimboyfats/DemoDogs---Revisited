import { describe, expect, it } from 'vitest';
import { explode, type World } from '@demodogs/sim';
import { makeWorld, runUntil } from '../../../src/testing';

const V = 'venue.tumble-heights';

/** Blow the bottom out of a tower block until it gives way; returns the block's pieces. */
function bringDown(w: World, group: number) {
  const block = w.statics.filter((s) => s.group === group);
  for (let k = 0; k < 200 && block.some((s) => !s.down); k++) {
    const s = block.find((s) => !s.down)!;
    explode(w, s.x, s.y, 1.5, null);
  }
  return block;
}

describe(V, () => {
  it('an all-AI race runs to the finish', () => {
    const w = makeWorld({ venue: V, car: 'car.mutt', autopilot: true });
    runUntil(w, (w) => w.phase === 'over', 60 * 300);
    expect(w.phase).toBe('over');
    expect(w.finishers.length).toBeGreaterThanOrEqual(1);
  });

  it('is a downtown: tower blocks with floors, shopfronts, lampposts, parked cars, an overpass', () => {
    const w = makeWorld({ venue: V });
    const ids = (id: string) => w.statics.filter((s) => s.def.id === id);
    const towers = w.statics.filter((s) => s.def.id.startsWith('prop.tower-'));
    expect(new Set(towers.map((s) => s.group)).size).toBeGreaterThan(12);
    expect(towers.every((s) => s.storeys! >= 7 && s.lean !== undefined && !s.bears)).toBe(true);
    expect(ids('prop.shopfront').length).toBeGreaterThan(20);
    expect(ids('prop.lamppost').length).toBeGreaterThan(20);
    expect(ids('prop.parked-car').length).toBeGreaterThan(5);
    expect(ids('prop.overpass-pillar').length).toBe(8);
    // the deck spans the road, and the road under it is open
    const decks = ids('prop.overpass-deck');
    expect(decks.length).toBeGreaterThan(10);
    expect(decks.some((d) => !w.offroad(d.x, d.y))).toBe(true);
    expect(decks.every((d) => !d.def.solid)).toBe(true);
  });

  it('a tower block that loses its footing falls across the road and leaves rubble on it', () => {
    const w = makeWorld({ venue: V });
    const tower = w.statics.find((s) => s.def.id.startsWith('prop.tower-'))!;
    const before = w.statics.length;
    const block = bringDown(w, tower.group!);
    expect(block.every((s) => s.down)).toBe(true);
    const rubble = w.statics.slice(before).filter((s) => s.def.id === 'prop.rubble' && !s.down);
    expect(rubble.length).toBeGreaterThan(10);
    expect(rubble.filter((s) => !w.offroad(s.x, s.y)).length).toBeGreaterThan(3);
  });

  it('the overpass comes down on the road when its pillars go', () => {
    const w = makeWorld({ venue: V });
    // a span over the middle of the road
    const deck = w.statics.find((s) => s.def.id === 'prop.overpass-deck' && !w.offroad(s.x, s.y))!;
    const before = w.statics.length;
    const pillars = w.statics.filter(
      (s) => s.group === deck.group && s.def.id === 'prop.overpass-pillar',
    );
    for (let k = 0; k < 200 && !deck.down; k++) {
      const p = pillars.find((s) => !s.down)!;
      explode(w, p.x, p.y, 1.5, null);
    }
    expect(deck.down).toBe(true);
    const onRoad = w.statics
      .slice(before)
      .filter((s) => s.def.id === 'prop.rubble' && !w.offroad(s.x, s.y));
    expect(onRoad.length).toBeGreaterThan(4);
  });

  it('racers get through a street full of rubble', () => {
    const w = makeWorld({ venue: V, autopilot: true });
    // bring every block down before the start
    for (const g of new Set(w.statics.filter((s) => s.def.fallOver && s.bears).map((s) => s.group)))
      if (g !== undefined) bringDown(w, g);
    runUntil(w, (w) => w.phase === 'over', 60 * 360);
    expect(w.phase).toBe('over');
  });
});
