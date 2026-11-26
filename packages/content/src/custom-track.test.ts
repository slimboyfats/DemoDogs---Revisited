import { describe, expect, it } from 'vitest';
import { parseTrackFile, type TrackFile } from '@demodogs/shared';
import {
  World,
  customVenueId,
  installTrack,
  newTouch,
  newTrack,
  propPoint,
  sizedProp,
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

  it('raises a bridge where one is put, and cars race over it', () => {
    const t = newTrack(look('venue.kennel-loop'), 'bridge', 'Bridge');
    const [x, y] = t.road.points[5]!;
    t.bridges.push({ x, y, length: 200 });
    t.laps = 1;
    expect(trackProblems(t)).toEqual([]);
    const made = installTrack(C, t);
    expect(made.dropped).toEqual([]);
    const w = new World({
      content: made.content,
      venue: made.venue,
      car: 'car.mutt',
      seed: 1,
      laps: 1,
      autopilot: true,
    });
    const T = w.track!;
    let top = 0;
    let high = 0;
    for (let i = 0; i < T.n; i++)
      if (w.deckH![i]! > high) {
        high = w.deckH![i]!;
        top = i;
      }
    expect(high).toBeGreaterThan(20);
    expect(Math.hypot(T.x[top]! - x, T.y[top]! - y)).toBeLessThan(110);
    let up = 0;
    runUntil(
      w,
      (w) => {
        up = Math.max(up, w.player.z);
        return w.phase === 'over';
      },
      60 * 200,
    );
    expect(w.phase).toBe('over');
    expect(w.player.finished).toBe(true);
    expect(up).toBeGreaterThan(15);
  });

  it('lays a surface on a stretch of road, and a car on it has that grip', () => {
    const t = newTrack(look('venue.kennel-loop'), 'surfaces', 'Surfaces');
    const plain = world(t);
    expect(plain.roadSurface).toBeNull();
    const T = plain.track!;
    const at = (f: number) => Math.floor(f * T.n);
    const p = (f: number) => [Math.round(T.x[at(f)]!), Math.round(T.y[at(f)]!)] as const;
    t.surfaces.push({
      material: 'material.ice',
      x0: p(0.3)[0],
      y0: p(0.3)[1],
      x1: p(0.4)[0],
      y1: p(0.4)[1],
    });
    // one that runs over the start line, and one this build does not know
    t.surfaces.push({
      material: 'material.mud',
      x0: p(0.95)[0],
      y0: p(0.95)[1],
      x1: p(0.05)[0],
      y1: p(0.05)[1],
    });
    t.surfaces.push({
      material: 'material.treacle',
      x0: p(0.6)[0],
      y0: p(0.6)[1],
      x1: p(0.7)[0],
      y1: p(0.7)[1],
    });
    const made = installTrack(C, t);
    expect(made.dropped).toEqual(['material.treacle']);
    const w = world(t);
    const S = w.roadSurface!;
    expect(S[at(0.35)]?.id).toBe('material.ice');
    expect(S[at(0.5)]).toBeNull();
    expect(S[at(0.65)]).toBeNull();
    expect(S[at(0.99)]?.id).toBe('material.mud');
    expect(S[at(0.02)]?.id).toBe('material.mud');
    expect(S[at(0.2)]).toBeNull();
    const back = parseTrackFile(JSON.stringify(t));
    expect(back.ok && back.track.surfaces.length).toBe(3);
    // an all-AI race over ice and mud still gets round
    const race = world(t, { autopilot: true });
    runUntil(race, (r) => r.cars.some((c) => c.lap >= 2), 60 * 240);
    expect(race.cars.some((c) => c.lap >= 2)).toBe(true);
  });

  it('lays areas of terrain with their own weather', () => {
    const t = newTrack(look('venue.kennel-loop'), 'areas', 'Areas');
    t.areas.push(
      { x: 400, y: 300, r: 260, material: 'material.snow', sky: 'snow' },
      { x: 1000, y: 600, r: 200, material: 'material.ice', sky: '' },
      // weather alone, and a ground this build does not know (its weather still holds)
      { x: 700, y: 480, r: 120, material: '', sky: 'rain' },
      { x: 200, y: 800, r: 100, material: 'material.treacle', sky: 'night' },
    );
    t.pools.push({ material: 'material.mud', x: 400, y: 300, r: 20 });
    const made = installTrack(C, t);
    expect(made.dropped).toEqual(['material.treacle']);
    const w = world(t);
    expect(w.venue.weather?.map((a) => a.sky)).toEqual(['snow', 'rain', 'night']);
    const fixed = w.spills.filter((s) => s.fixed);
    // the ground of each area, then the pool laid by hand on top of the snow
    expect(fixed.slice(-3).map((s) => [s.def.id, s.r])).toEqual([
      ['material.snow', 260],
      ['material.ice', 200],
      ['material.mud', 20],
    ]);
    const back = parseTrackFile(JSON.stringify(t));
    expect(back.ok && back.track.areas).toEqual(t.areas);
    // a file from before there were areas still loads
    const old = JSON.parse(JSON.stringify(t)) as Record<string, unknown>;
    delete old.areas;
    delete old.surfaces;
    const older = parseTrackFile(JSON.stringify(old));
    expect(older.ok && older.track.areas).toEqual([]);
    expect(newTrack(look('venue.kennel-loop'), 'plain', 'Plain').areas).toEqual([]);
    expect(
      world(newTrack(look('venue.kennel-loop'), 'plain', 'Plain')).venue.weather,
    ).toBeUndefined();
  });

  it('puts a thing down at another size as a prop of the track’s own', () => {
    const t = newTrack(look('venue.kennel-loop'), 'sizes', 'Sizes');
    t.items.push(
      { prop: 'prop.rock', x: 700, y: 480, rot: 0, size: 2 },
      { prop: 'prop.rock', x: 760, y: 480, rot: 0 },
      { prop: 'prop.cone', x: 700, y: 540, rot: 0, size: 0.5 },
      { prop: 'prop.boost-pad', x: 640, y: 420, rot: 0, size: 1.5 },
      // a size between the steps goes to the nearest one
      { prop: 'prop.rock', x: 820, y: 480, rot: 0, size: 2.1 },
    );
    const made = installTrack(C, t);
    expect(made.dropped).toEqual([]);
    // the game's own props are untouched; the track's content has the sized ones as well
    expect(C.prop.has('prop.rock-x200')).toBe(false);
    const rock = C.prop.get('prop.rock')!;
    const big = made.content.prop.get('prop.rock-x200')!;
    expect(big.radius).toBe(rock.radius * 2);
    expect(big.meta.name).toBe(rock.meta.name);
    const w = world(t);
    const rocks = w.statics.filter((s) => Math.abs(s.y - 480) < 1 && [700, 760, 820].includes(s.x));
    expect(rocks.map((s) => s.def.id).sort()).toEqual([
      'prop.rock',
      'prop.rock-x200',
      'prop.rock-x200',
    ]);
    const cone = w.props.find((p) => p.def.id === 'prop.cone-x50')!;
    expect(cone.def.mass).toBeCloseTo(C.prop.get('prop.cone')!.mass! / 4);
    const pad = w.pads.find((p) => p.def.id === 'prop.boost-pad-x150')!;
    expect(pad.def.pad!.long).toBe(C.prop.get('prop.boost-pad')!.pad!.long * 1.5);
    // the big rock is in the way where the small one was not
    expect(w.free(700 + rock.radius * 1.6, 480, 1)).toBe(false);
    expect(w.free(760 + rock.radius * 1.6, 480, 1)).toBe(true);
    const back = parseTrackFile(JSON.stringify(t));
    expect(back.ok && back.track.items[0]!.size).toBe(2);
    expect(world(t).hash()).toBe(w.hash());
  });

  it('says when a bridge is on the start line or runs into another', () => {
    const t = newTrack(look('venue.kennel-loop'), 'bridge-bad', 'Bridge');
    const [x, y] = t.road.points[0]!;
    t.bridges.push({ x, y, length: 200 });
    expect(trackProblems(t)[0]).toMatch(/start line/);
    const [bx, by] = t.road.points[5]!;
    t.bridges = [
      { x: bx, y: by, length: 200 },
      { x: bx, y: by + 40, length: 200 },
    ];
    expect(trackProblems(t)[0]).toMatch(/run into each other/);
    // a file from before bridges still loads
    const old: Record<string, unknown> = { ...t };
    delete old.bridges;
    const r = parseTrackFile(JSON.stringify(old));
    expect(r.ok && r.track.bridges).toEqual([]);
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

  it("sizes a thing's hit shape with it, piece by piece and height by height", () => {
    const T = newTouch();
    let seen = 0;
    for (const def of C.prop.values()) {
      if (!def.hit) continue;
      seen++;
      for (const k of [0.5, 2, 3]) {
        const big = sizedProp(def, `${def.id}-sized`, k);
        for (let z = 0; z < 30; z += 3)
          for (let a = 0; a < 8; a++) {
            const x = Math.cos(a) * (4 + a * 3);
            const y = Math.sin(a) * (4 + a * 3);
            const g = propPoint(def, 0, 0, 0.7, x, y, T, z, z + 1);
            const G = propPoint(big, 0, 0, 0.7, x * k, y * k, T, z * k, (z + 1) * k);
            if (g > 1e5) expect(G, def.id).toBeGreaterThan(1e5);
            else expect(G, def.id).toBeCloseTo(g * k, 6);
          }
      }
    }
    expect(seen).toBeGreaterThan(30);
  });
});
