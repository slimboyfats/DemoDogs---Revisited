import { describe, expect, it } from 'vitest';
import { NO_CONTROLS, parseTrackFile, type TrackFile } from '@demodogs/shared';
import { World, groundAt, installTrack, liftsOf, newTrack, type Content } from '@demodogs/sim';
import { loadContent } from './index';
import { put, runUntil, startRace } from './testing';

const C: Content = loadContent();

/** A track with one stretch of its road raised into a platform, a third of the way round. */
function raisedTrack(height = 24): { t: TrackFile; w: World; i: (f: number) => number } {
  const t = newTrack(C.venue.get('venue.kennel-loop')!, 'raised', 'Raised');
  const flat = installTrack(C, t);
  const T = new World({ content: flat.content, venue: flat.venue, car: 'car.mutt', seed: 1 })
    .track!;
  const i = (f: number): number => Math.floor(f * T.n);
  t.raised.push({
    x0: Math.round(T.x[i(0.3)]!),
    y0: Math.round(T.y[i(0.3)]!),
    x1: Math.round(T.x[i(0.5)]!),
    y1: Math.round(T.y[i(0.5)]!),
    height,
  });
  const made = installTrack(C, t);
  const w = new World({
    content: made.content,
    venue: made.venue,
    car: 'car.mutt',
    seed: 1,
    rivals: 0,
  });
  return { t, w, i };
}

describe('raised road', () => {
  it('stands as high as it was raised, with a way up at each end and level ground elsewhere', () => {
    const { w, i } = raisedTrack(24);
    const T = w.track!;
    const at = (f: number): number => groundAt(w, T.x[i(f)]!, T.y[i(f)]!);
    expect(w.relief).not.toBeNull();
    expect(at(0.4)).toBeCloseTo(24, 0);
    expect(at(0.1)).toBe(0);
    expect(at(0.8)).toBe(0);
    // the ramps: part of the way up just inside each end
    const lift = liftsOf(T, w.venue.track!.raised!);
    expect(lift[i(0.3) + 6]).toBeGreaterThan(1);
    expect(lift[i(0.3) + 6]).toBeLessThan(12);
    expect(lift[i(0.5) - 6]).toBeLessThan(12);
    expect(lift[i(0.4)]).toBe(24);
    // and never steeper than a car can climb
    for (let k = 1; k < T.n; k++)
      expect(Math.abs(lift[k]! - lift[k - 1]!) / T.step).toBeLessThan(0.5);
  });

  it('is level across the road and falls away steeply past its shoulder', () => {
    const { w, i } = raisedTrack(24);
    const T = w.track!;
    const k = i(0.4);
    const nx = -Math.sin(T.a[k]!);
    const ny = Math.cos(T.a[k]!);
    const out = (d: number): number => groundAt(w, T.x[k]! + nx * d, T.y[k]! + ny * d);
    expect(out(w.road / 2 - 2)).toBeCloseTo(24, 0);
    expect(out(-(w.road / 2 - 2))).toBeCloseTo(24, 0);
    expect(out(w.road / 2 + 40)).toBe(0);
    expect(out(-(w.road / 2 + 40))).toBe(0);
  });

  it('a car on the way up lies nose up, and level on top', () => {
    const { w, i } = raisedTrack(24);
    startRace(w);
    const T = w.track!;
    const park = (k: number) => {
      put(w.player, T.x[k]!, T.y[k]!, T.a[k]!);
      for (let n = 0; n < 90; n++) {
        w.player.vx = w.player.vy = 0;
        w.player.x = T.x[k]!;
        w.player.y = T.y[k]!;
        w.step(NO_CONTROLS);
      }
      return w.player;
    };
    expect(park(i(0.3) + 12).pitch).toBeGreaterThan(0.08);
    expect(park(i(0.5) - 12).pitch).toBeLessThan(-0.08);
    expect(Math.abs(park(i(0.4)).pitch)).toBeLessThan(0.02);
  });

  it('its side is a wall to a car on the ground below, and a car that drives off the top is in the air', () => {
    const { w, i } = raisedTrack(24);
    startRace(w);
    const T = w.track!;
    const k = i(0.4);
    const nx = -Math.sin(T.a[k]!);
    const ny = Math.cos(T.a[k]!);
    const far = w.road / 2 + 60;
    // from the ground beside it, straight at it, and kept at it: the side is a wall, and
    // there is no crawling up it however long the throttle is held
    put(w.player, T.x[k]! + nx * far, T.y[k]! + ny * far, Math.atan2(-ny, -nx), 120);
    for (let n = 0; n < 600; n++) {
      w.step({ ...NO_CONTROLS, throttle: 1 });
      expect(groundAt(w, w.player.x, w.player.y)).toBeLessThan(8);
    }
    // from the top, straight off the side
    // (with nothing standing along the edge: a roadside wall would hold it)
    for (const o of w.statics) o.down = true;
    w.props.length = 0;
    put(w.player, T.x[k]!, T.y[k]!, Math.atan2(ny, nx), 160);
    let high = 0;
    for (let n = 0; n < 40; n++) {
      w.step({ ...NO_CONTROLS, throttle: 1 });
      high = Math.max(high, w.player.z);
    }
    expect(high).toBeGreaterThan(12);
    expect(groundAt(w, w.player.x, w.player.y)).toBe(0);
  });

  it('no scenery stands on its sides', () => {
    const { w } = raisedTrack(24);
    const R = w.relief!;
    const steep = (x: number, y: number): boolean => Math.hypot(...R.edge(x, y)) > 1.1;
    expect(w.statics.filter((s) => R.platAt(s.x, s.y) > 1 && steep(s.x, s.y))).toEqual([]);
    expect(w.props.filter((p) => R.platAt(p.x, p.y) > 1 && steep(p.x, p.y))).toEqual([]);
  });

  it('bots race over it, lap after lap', () => {
    const { t } = raisedTrack(32);
    const made = installTrack(C, t);
    const w = new World({
      content: made.content,
      venue: made.venue,
      car: 'car.mutt',
      seed: 1,
      laps: 2,
      autopilot: true,
    });
    runUntil(w, (r) => r.phase === 'over', 60 * 300);
    expect(w.phase).toBe('over');
    for (const c of w.cars) if (!c.wrecked) expect(c.lap).toBeGreaterThanOrEqual(1);
  });

  it('is saved with the track and loads again the same', () => {
    const { t, w } = raisedTrack(24);
    const back = parseTrackFile(JSON.stringify(t));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.track.raised).toEqual(t.raised);
    const made = installTrack(C, back.track);
    const again = new World({
      content: made.content,
      venue: made.venue,
      car: 'car.mutt',
      seed: 1,
      rivals: 0,
    });
    expect(again.hash()).toBe(w.hash());
    // a track from before raised roads has none
    const old = JSON.parse(JSON.stringify(t)) as Record<string, unknown>;
    delete old.raised;
    const was = parseTrackFile(JSON.stringify(old));
    expect(was.ok && was.track.raised).toEqual([]);
  });
});
