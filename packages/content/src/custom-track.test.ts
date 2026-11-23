import { describe, expect, it } from 'vitest';
import { parseTrackFile, type TrackFile } from '@demodogs/shared';
import {
  World,
  customVenueId,
  installTrack,
  newTrack,
  trackProblems,
  type Content,
} from '@demodogs/sim';
import { loadContent } from './index';
import { runUntil } from './testing';

const C: Content = loadContent();
const look = (id: string) => C.venue.get(id)!;
const world = (t: TrackFile, extra: { autopilot?: boolean; seed?: number } = {}): World => {
  const made = installTrack(C, t);
  return new World({
    content: made.content,
    venue: made.venue,
    car: 'car.mutt',
    seed: 1,
    laps: made.laps,
    ...extra,
  });
};

describe('custom tracks', () => {
  it('a new track in every race venue’s look builds a world with nothing left out', () => {
    for (const v of C.venue.values()) {
      if (!v.track || v.id.startsWith('venue.custom-')) continue;
      const t = newTrack(v, `look-${v.id.slice(6)}`, 'Test');
      expect(trackProblems(t)).toEqual([]);
      const made = installTrack(C, t);
      expect(made.dropped).toEqual([]);
      expect(made.venue).toBe(customVenueId(t.id));
      // the game's own venues are left as they were: a career never draws a custom track
      expect(C.venue.has(made.venue)).toBe(false);
      const w = new World({ content: made.content, venue: made.venue, car: 'car.mutt', seed: 1 });
      expect(w.track!.n).toBeGreaterThan(160);
      expect(w.statics.length).toBeGreaterThan(50);
    }
  });

  it('survives being saved as JSON and loaded again', () => {
    const t = newTrack(look('venue.kennel-loop'), 'round-trip', 'Round Trip');
    t.items.push({ prop: 'prop.barrel', x: 700, y: 480, rot: 1.25 });
    t.pools.push({ material: 'material.mud', x: 640, y: 500, r: 22 });
    const back = parseTrackFile(JSON.stringify(t));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.track).toEqual(t);
    expect(world(back.track).hash()).toBe(world(t).hash());
  });

  it('puts hand-placed props and pools exactly where they were put', () => {
    const t = newTrack(look('venue.kennel-loop'), 'placed', 'Placed');
    t.items.push({ prop: 'prop.rock', x: 700, y: 480, rot: 0.5 });
    t.items.push({ prop: 'prop.barrel', x: 720, y: 500, rot: 2 });
    t.pools.push({ material: 'material.ice', x: 300, y: 200, r: 30 });
    const w = world(t);
    const rock = w.statics.find((s) => s.def.id === 'prop.rock' && s.x === 700 && s.y === 480);
    expect(rock?.rot).toBe(0.5);
    expect(w.props.some((p) => p.def.id === 'prop.barrel' && p.x === 720 && p.y === 500)).toBe(
      true,
    );
    const pool = w.spills.find((s) => s.def.id === 'material.ice');
    expect(pool).toMatchObject({ x: 300, y: 200, r: 30, fixed: true });
  });

  it('a rule switched off dresses nothing', () => {
    const t = newTrack(look('venue.kennel-loop'), 'bare', 'Bare');
    const full = world(t).statics.length;
    for (const d of t.dressing) d.on = false;
    const w = world(t);
    expect(w.statics.length).toBe(0);
    expect(full).toBeGreaterThan(0);
  });

  it('leaves out what this build does not know, and says so', () => {
    const t = newTrack(look('venue.kennel-loop'), 'old-file', 'Old');
    t.items.push({ prop: 'prop.gone-away', x: 700, y: 480, rot: 0 });
    t.pools.push({ material: 'material.custard', x: 300, y: 200, r: 30 });
    t.dressing.push({ on: true, rule: { rule: 'hedge-maze', twists: 9 } });
    t.dressing.push({
      on: true,
      rule: { rule: 'border', prop: 'prop.no-such-fence', spacing: 10 },
    });
    t.pickups = ['pickup.repair', 'pickup.lost'];
    const made = installTrack(C, t);
    expect(made.dropped).toEqual([
      'hedge-maze',
      'material.custard',
      'pickup.lost',
      'prop.gone-away',
      'prop.no-such-fence',
    ]);
    expect(
      () => new World({ content: made.content, venue: made.venue, car: 'car.mutt', seed: 1 }),
    ).not.toThrow();
  });

  it('refuses what is not a track file, in plain words', () => {
    expect(parseTrackFile('{nope')).toEqual({ ok: false, error: 'This is not a JSON file.' });
    expect(parseTrackFile('{"a":1}')).toMatchObject({ ok: false });
    const t = newTrack(look('venue.kennel-loop'), 'newer', 'Newer');
    const r = parseTrackFile(JSON.stringify({ ...t, version: 2 }));
    expect(r).toEqual({ ok: false, error: 'This track was saved by a newer version of the game.' });
  });

  it('says when the road is too short or off the map', () => {
    const t = newTrack(look('venue.kennel-loop'), 'broken', 'Broken');
    t.road.points = [
      [300, 300],
      [380, 300],
      [380, 380],
      [300, 380],
    ];
    expect(trackProblems(t)[0]).toMatch(/too short/);
    const u = newTrack(look('venue.kennel-loop'), 'broken-2', 'Broken');
    u.road.points[0] = [10, 480];
    expect(trackProblems(u)[0]).toMatch(/off the map/);
  });

  it('an all-AI race on a custom track runs to the finish, every car lapping', () => {
    const t = newTrack(look('venue.kennel-loop'), 'race', 'Race');
    t.laps = 2;
    t.items.push({ prop: 'prop.cone', x: 700, y: 480, rot: 0 });
    const w = world(t, { autopilot: true });
    expect(w.laps).toBe(2);
    runUntil(w, (w) => w.phase === 'over', 60 * 240);
    expect(w.phase).toBe('over');
    expect(w.player.finished).toBe(true);
    for (const c of w.cars) expect(c.lap).toBeGreaterThanOrEqual(1);
  });
});
