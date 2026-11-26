import { describe, expect, it } from 'vitest';
import { TRACK_FORMAT, TRACK_VERSION, parseTrackFile, type TrackFile } from '@demodogs/shared';
import { sampleTrack, trackProblems } from '@demodogs/sim';
import type { PropManifest } from '@demodogs/shared';
import {
  arc,
  drawRoad,
  onArc,
  propGroup,
  raisedAt,
  raisedBetween,
  RAISE_LEAST,
  surfaceAt,
  surfaceBetween,
  History,
  insertPoint,
  nearest,
  removePoint,
  resize,
  reverse,
  roadAt,
  snapBridges,
  snapThing,
  snapTo,
  SNAP_GRID,
  startAt,
} from './track-edit';

const track = (): TrackFile => ({
  format: TRACK_FORMAT,
  version: TRACK_VERSION,
  id: 'test',
  name: 'Test',
  laps: 3,
  seed: 1,
  size: { w: 1400, h: 960 },
  road: {
    width: 72,
    points: [
      [300, 300],
      [1100, 300],
      [1100, 700],
      [300, 700],
    ],
  },
  colors: { ground: '#4f7a37', ground2: '#5c8a3f', dirt: '#8a6d45', outside: '#2d3a24' },
  dressing: [],
  items: [{ prop: 'prop.cone', x: 500, y: 400, rot: 0 }],
  pools: [{ material: 'material.mud', x: 700, y: 480, r: 20 }],
  bridges: [],
  surfaces: [],
  raised: [],
  areas: [],
  bots: 4,
});

describe('editing a track', () => {
  it('finds the stretch of road under a tap, and which way it runs', () => {
    const t = track();
    const top = roadAt(t.road.points, 700, 260);
    expect(top.seg).toBe(0);
    expect(Math.abs(top.a)).toBeLessThan(0.2);
    expect(top.d).toBeLessThan(80);
    expect(roadAt(t.road.points, 1150, 500).seg).toBe(1);
    expect(roadAt(t.road.points, 700, 740).seg).toBe(2);
    expect(roadAt(t.road.points, 250, 500).seg).toBe(3);
  });

  it('adds a point in the stretch tapped, wherever that is in the list', () => {
    const t = track();
    expect(insertPoint(t, 1160, 500)).toBe(2);
    expect(t.road.points[2]).toEqual([1160, 500]);
    expect(insertPoint(t, 240, 500)).toBe(5);
    expect(t.road.points.length).toBe(6);
  });

  it('keeps a new point on the map', () => {
    const t = track();
    const i = insertPoint(t, 5, 500);
    expect(t.road.points[i]![0]).toBeGreaterThan(100);
  });

  it('will not take a road below four points', () => {
    const t = track();
    expect(removePoint(t, 0)).toBe(false);
    insertPoint(t, 700, 260);
    expect(removePoint(t, 1)).toBe(true);
    expect(t.road.points).toEqual(track().road.points);
  });

  it('moves the start and turns the race round without moving the road', () => {
    const t = track();
    startAt(t, 2);
    expect(t.road.points[0]).toEqual([1100, 700]);
    expect(t.road.points[3]).toEqual([1100, 300]);
    reverse(t);
    expect(t.road.points).toEqual([
      [1100, 700],
      [1100, 300],
      [300, 300],
      [300, 700],
    ]);
  });

  it('a bigger map keeps everything about its middle; a smaller one drops what falls off', () => {
    const t = track();
    resize(t, 1600, 1160);
    expect(t.road.points[0]).toEqual([400, 400]);
    expect(t.items[0]).toMatchObject({ x: 600, y: 500 });
    t.items.push({ prop: 'prop.cone', x: 30, y: 30, rot: 0 });
    resize(t, 1200, 840);
    expect(t.items.length).toBe(1);
    for (const [x, y] of t.road.points) {
      expect(x).toBeGreaterThan(100);
      expect(y).toBeLessThan(740);
    }
  });

  it('keeps a bridge on the road when the road moves, and drops one left behind', () => {
    const t = track();
    t.bridges.push({ x: 700, y: 250, length: 200 }, { x: 700, y: 480, length: 200 });
    snapBridges(t);
    expect(t.bridges.length).toBe(1);
    expect(roadAt(t.road.points, t.bridges[0]!.x, t.bridges[0]!.y).d).toBeLessThan(3);
  });

  it('picks the nearest thing within reach, counting a pool’s size', () => {
    const t = track();
    expect(nearest(t.items, 505, 404, 12)).toBe(0);
    expect(nearest(t.items, 540, 400, 12)).toBe(-1);
    expect(nearest(t.pools, 725, 480, 12)).toBe(0);
  });

  it('steps back through changes', () => {
    const t = track();
    const h = new History();
    h.remember(t);
    h.remember(t);
    expect(h.size).toBe(1);
    t.name = 'Changed';
    h.remember(t);
    expect(h.undo()?.name).toBe('Changed');
    expect(h.undo()?.name).toBe('Test');
    expect(h.undo()).toBeNull();
  });

  it('steps forward again, until something new is done', () => {
    const t = track();
    const h = new History();
    h.remember(t);
    t.name = 'Second';
    const back = h.undo(t)!;
    expect(back.name).toBe('Test');
    expect(h.ahead).toBe(1);
    const again = h.redo(back)!;
    expect(again.name).toBe('Second');
    expect(h.size).toBe(1);
    expect(h.redo(again)).toBeNull();
    // a new change after stepping back leaves nothing to step forward to
    const undone = h.undo(again)!;
    h.remember(undone);
    undone.name = 'Third';
    h.remember(undone);
    expect(h.ahead).toBe(0);
  });

  it('snaps a thing to a lane on the road and to the grid off it', () => {
    const t = track();
    const T = sampleTrack(t.road.points, 4);
    expect(snapTo(37, 16)).toBe(32);
    // far from the road: the grid
    const [gx, gy] = snapThing(T, t.road.width, 707, 493);
    expect(gx % SNAP_GRID).toBe(0);
    expect(gy % SNAP_GRID).toBe(0);
    // a little off the middle of the road: the middle, as far along as it was
    const i = 40;
    const a = T.a[i]!;
    const off = (d: number): [number, number] => [
      T.x[i]! - d * Math.sin(a),
      T.y[i]! + d * Math.cos(a),
    ];
    const mid = snapThing(T, t.road.width, ...off(6));
    expect(Math.hypot(mid[0] - T.x[i]!, mid[1] - T.y[i]!)).toBeLessThan(3);
    // well to one side: that side's lane
    const side = snapThing(T, t.road.width, ...off(26));
    const want = off(t.road.width * 0.3);
    expect(Math.hypot(side[0] - want[0], side[1] - want[1])).toBeLessThan(3);
  });

  it('a stretch of road runs the shorter way round, in the direction of the race', () => {
    expect(arc(100, 10, 30)).toEqual([10, 30]);
    expect(arc(100, 30, 10)).toEqual([10, 30]);
    expect(arc(100, 5, 90)).toEqual([90, 5]);
    expect(onArc(100, 90, 5, 98)).toBe(true);
    expect(onArc(100, 90, 5, 2)).toBe(true);
    expect(onArc(100, 90, 5, 50)).toBe(false);
  });

  it('lays a surface along the road between two points and finds it again', () => {
    const t = track();
    const T = sampleTrack(t.road.points, 4);
    const at = (f: number, off = 0): [number, number] => {
      const i = Math.floor(f * T.n);
      return [T.x[i]!, T.y[i]! + off];
    };
    // dragged against the race, a little off the line: it still lies along the road, forwards
    t.surfaces.push(surfaceBetween(T, 'material.ice', at(0.15, 10), at(0.05, -15)));
    const s = t.surfaces[0]!;
    expect(roadAt(t.road.points, s.x0, s.y0).d).toBeLessThan(3);
    expect(Math.hypot(s.x0 - at(0.05)[0], s.y0 - at(0.05)[1])).toBeLessThan(20);
    expect(surfaceAt(T, t, ...at(0.1), 40)).toBe(0);
    expect(surfaceAt(T, t, ...at(0.6), 40)).toBe(-1);
    expect(surfaceAt(T, t, 700, 480, 40)).toBe(-1);
    // the one laid last lies on top
    t.surfaces.push(surfaceBetween(T, 'material.mud', at(0.09), at(0.11)));
    expect(surfaceAt(T, t, ...at(0.1), 40)).toBe(1);
    expect(surfaceAt(T, t, ...at(0.06), 40)).toBe(0);
  });

  it('keeps a surface on the road when the road moves and when the map grows', () => {
    const t = track();
    t.surfaces.push(
      surfaceBetween(sampleTrack(t.road.points, 4), 'material.ice', [500, 300], [900, 300]),
    );
    t.road.points[0] = [300, 200];
    t.road.points[1] = [1100, 200];
    snapBridges(t);
    expect(roadAt(t.road.points, t.surfaces[0]!.x0, t.surfaces[0]!.y0).d).toBeLessThan(3);
    const before = t.surfaces[0]!.x0;
    resize(t, 1800, 1240);
    expect(t.surfaces[0]!.x0).toBe(before + 200);
  });

  it('raises a stretch of road: snapped to the road, long enough to climb, found by a tap', () => {
    const t = track();
    const T = sampleTrack(t.road.points, 4);
    const at = (f: number): [number, number] => {
      const i = Math.floor(f * T.n);
      return [T.x[i]!, T.y[i]!];
    };
    t.raised.push(raisedBetween(T, 20, at(0.3), at(0.2)));
    expect(t.raised[0]!.height).toBe(20);
    expect(raisedAt(T, t, ...at(0.25), 40)).toBe(0);
    expect(raisedAt(T, t, ...at(0.6), 40)).toBe(-1);
    // a stretch too short to climb is drawn out about its middle, and no height is out of range
    const short = raisedBetween(T, 999, at(0.7), at(0.7));
    expect(Math.hypot(short.x1 - short.x0, short.y1 - short.y0)).toBeGreaterThan(RAISE_LEAST * 0.8);
    expect(short.height).toBe(48);
    expect(parseTrackFile(JSON.stringify({ ...t, raised: [short] })).ok).toBe(true);
    // it keeps to the road when the road moves, and to its place when the map grows
    t.road.points[0] = [300, 200];
    snapBridges(t);
    expect(roadAt(t.road.points, t.raised[0]!.x0, t.raised[0]!.y0).d).toBeLessThan(3);
    const before = t.raised[0]!.x0;
    resize(t, 1800, 1240);
    expect(t.raised[0]!.x0).toBe(before + 200);
  });

  it('the pencil: a loop drawn by hand becomes a road that can be raced', () => {
    const t = track();
    const stroke: [number, number][] = [];
    // a wobbly oval, drawn the way a finger draws: not quite closed
    for (let k = 0; k < 150; k++) {
      const a = (k / 155) * Math.PI * 2;
      const wobble = 1 + 0.03 * Math.sin(k * 1.7);
      stroke.push([700 + Math.cos(a) * 420 * wobble, 480 + Math.sin(a) * 260 * wobble]);
    }
    expect(drawRoad(t, stroke)).toBe('loop');
    expect(t.road.points.length).toBeGreaterThanOrEqual(6);
    expect(t.road.points.length).toBeLessThanOrEqual(48);
    expect(trackProblems(t)).toEqual([]);
    // it starts where the pencil went down and runs the way it was drawn
    expect(Math.hypot(t.road.points[0]![0] - 1120, t.road.points[0]![1] - 480)).toBeLessThan(30);
    expect(t.road.points[1]![1]).toBeGreaterThan(t.road.points[0]![1]);
    for (const [x, y] of t.road.points)
      expect(Math.abs(Math.hypot((x - 700) / 420, (y - 480) / 260) - 1)).toBeLessThan(0.12);
  });

  it('the pencil: a line from the road to the road is a new way between the two', () => {
    const t = track();
    // off the top straight, up in a hump, and back onto it
    const stroke: [number, number][] = [];
    for (let k = 0; k <= 40; k++)
      stroke.push([500 + k * 10, 300 - Math.sin((k / 40) * Math.PI) * 180]);
    expect(drawRoad(t, stroke)).toBe('stretch');
    expect(t.road.points[0]).toEqual([300, 300]);
    expect(t.road.points.length).toBeGreaterThan(4);
    expect(Math.min(...t.road.points.map((p) => p[1]))).toBeLessThan(170);
    expect(trackProblems(t)).toEqual([]);
    // the rest of the road is as it was
    expect(t.road.points.slice(-3)).toEqual([
      [1100, 300],
      [1100, 700],
      [300, 700],
    ]);
    // drawn the other way, it is the same stretch that is replaced
    const u = track();
    expect(drawRoad(u, [...stroke].reverse())).toBe('stretch');
    expect(u.road.points).toEqual(t.road.points);
  });

  it('the pencil: a scribble is not a road', () => {
    const t = track();
    const was = JSON.stringify(t);
    expect(
      drawRoad(t, [
        [600, 500],
        [620, 510],
        [640, 500],
        [660, 510],
        [680, 500],
      ]),
    ).toBeNull();
    expect(JSON.stringify(t)).toBe(was);
  });

  it('sorts things into the palette’s groups by what they do', () => {
    const p = (extra: object): PropManifest =>
      ({ body: 'static', sway: false, trample: false, ...extra }) as unknown as PropManifest;
    expect(propGroup(p({ pad: {} }))).toBe('pieces');
    expect(propGroup(p({ critter: {} }))).toBe('animals');
    expect(propGroup(p({ sway: true }))).toBe('plants');
    expect(propGroup(p({ body: 'loose', explodesAt: 40 }))).toBe('bangs');
    expect(propGroup(p({ body: 'loose' }))).toBe('loose');
    expect(propGroup(p({}))).toBe('built');
  });
});
