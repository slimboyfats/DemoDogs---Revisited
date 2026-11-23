import { describe, expect, it } from 'vitest';
import { TRACK_FORMAT, TRACK_VERSION, type TrackFile } from '@demodogs/shared';
import {
  History,
  insertPoint,
  nearest,
  removePoint,
  resize,
  reverse,
  roadAt,
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
});
