import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, NO_CONTROLS, parseTrackFile, type TrackFile } from '@demodogs/shared';
import {
  World,
  groundAt,
  installTrack,
  liftsOf,
  lanesOf,
  laneWide,
  SHOULDER,
  newTrack,
  type Content,
} from '@demodogs/sim';
import { BENCH, put, runUntil, startRace, testContent } from './testing';

const C: Content = testContent();

/** A track with one stretch of its road raised into a platform, a third of the way round. */
function raisedTrack(height = 24): { t: TrackFile; w: World; i: (f: number) => number } {
  const t = newTrack(C.venue.get(BENCH)!, 'raised', 'Raised');
  const flat = installTrack(C, t);
  const T = new World({ content: flat.content, venue: flat.venue, car: 'car.mutt', seed: 1 })
    .track!;
  const i = (f: number): number => Math.floor(f * T.n);
  t.raised.push({
    x0: Math.round(T.x[i(0.3)]!),
    y0: Math.round(T.y[i(0.3)]!),
    x1: Math.round(T.x[i(0.6)]!),
    y1: Math.round(T.y[i(0.6)]!),
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

/** A sample of the raised stretch beside a plain wall, and where its first on-ramp starts and ends. */
function sides(w: World): { wall: number; from: number; to: number; side: number } {
  const T = w.track!;
  const lift = liftsOf(T, w.venue.track!.raised!);
  const L = lanesOf(T, lift, w.road, w.tuning);
  const wide = (k: number): number => Math.max(L.left[k]!, L.right[k]!);
  let wall = -1;
  let from = -1;
  let to = -1;
  for (let k = 20; k < T.n - 20; k++) {
    let plain = lift[k]! > 0;
    for (let q = -6; q <= 6; q++) if (wide(k + q) > 0 || lift[k + q] !== lift[k]) plain = false;
    if (wall < 0 && plain) wall = k;
    if (from < 0 && wide(k) > 0) from = k;
    if (from >= 0 && to < 0 && wide(k) === 0) to = k;
  }
  return { wall, from, to, side: L.right[from]! > 0 ? 1 : -1 };
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
    expect(lift[i(0.6) - 6]).toBeLessThan(12);
    expect(lift[i(0.4)]).toBe(24);
    // and never steeper than a car can climb
    for (let k = 1; k < T.n; k++)
      expect(Math.abs(lift[k]! - lift[k - 1]!) / T.step).toBeLessThan(0.5);
  });

  it('is level across the road and falls away steeply past its shoulder', () => {
    const { w } = raisedTrack(24);
    const T = w.track!;
    const k = sides(w).wall;
    const nx = -Math.sin(T.a[k]!);
    const ny = Math.cos(T.a[k]!);
    const out = (d: number): number => groundAt(w, T.x[k]! + nx * d, T.y[k]! + ny * d);
    expect(out(w.road / 2 - 2)).toBeCloseTo(24, 0);
    expect(out(-(w.road / 2 - 2))).toBeCloseTo(24, 0);
    // (the road has room: a car that runs wide is still on the top)
    expect(out(w.road / 2 + SHOULDER - 8)).toBeCloseTo(24, 0);
    expect(out(w.road / 2 + SHOULDER + 16)).toBe(0);
    expect(out(-(w.road / 2 + SHOULDER + 16))).toBe(0);
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
    expect(park(i(0.6) - 12).pitch).toBeLessThan(-0.08);
    expect(Math.abs(park(i(0.4)).pitch)).toBeLessThan(0.02);
  });

  it('its side is a wall to a car on the ground below, and a car that drives off the top is in the air', () => {
    const { w } = raisedTrack(24);
    startRace(w);
    const T = w.track!;
    const k = sides(w).wall;
    const nx = -Math.sin(T.a[k]!);
    const ny = Math.cos(T.a[k]!);
    const far = w.road / 2 + SHOULDER + 50;
    // from the ground beside it, straight at it, and kept at it: the side is a wall, and
    // there is no crawling up it however long the throttle is held
    put(w.player, T.x[k]! + nx * far, T.y[k]! + ny * far, Math.atan2(-ny, -nx), 120);
    // (with the lift back onto the road held off, which would carry it up)
    for (let n = 0; n < 600; n++) {
      w.player.downT = 0;
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

  it('a car left down beside it is lifted back onto the road', () => {
    const { w } = raisedTrack(24);
    const T = w.track!;
    startRace(w);
    for (const o of w.statics) o.down = true;
    w.props.length = 0;
    const k = sides(w).wall;
    const nx = -Math.sin(T.a[k]!);
    const ny = Math.cos(T.a[k]!);
    const c = w.player;
    const far = w.road / 2 + SHOULDER + 40;
    put(c, T.x[k]! + nx * far, T.y[k]! + ny * far, T.a[k]!, 0);
    // (it went over the edge here: this is the last road it was on)
    c.onIdx = k;
    const seen: string[] = [];
    const tick = (): void => {
      w.step(NO_CONTROLS);
      for (const e of w.takeEvents()) seen.push(e.t);
    };
    // not at once: there is time to drive off for the ramp
    for (let n = 0; n < (DEFAULT_TUNING.rescueGrace + DEFAULT_TUNING.rescueCount) * 60 - 10; n++)
      tick();
    expect(seen).not.toContain('rescue');
    expect(groundAt(w, c.x, c.y)).toBe(0);
    for (let n = 0; n < 30; n++) tick();
    expect(seen.filter((t) => t === 'rescue')).toHaveLength(1);
    expect(groundAt(w, c.x, c.y)).toBeCloseTo(24, 0);
    expect(Math.hypot(c.x - T.x[c.idx]!, c.y - T.y[c.idx]!)).toBeLessThan(w.road / 2);
    // it stays up there, and is not lifted again
    for (let n = 0; n < 120; n++) tick();
    expect(seen.filter((t) => t === 'rescue')).toHaveLength(1);
    expect(groundAt(w, c.x, c.y)).toBeGreaterThan(20);
  });

  it('has an on-ramp beside it, in line with the road, that a car on the ground can drive up', () => {
    const { w } = raisedTrack(24);
    startRace(w);
    const T = w.track!;
    const { wall, from, to, side } = sides(w);
    expect(wall).toBeGreaterThan(0);
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    const R = w.relief!;
    const L = lanesOf(T, liftsOf(T, w.venue.track!.raised!), w.road, w.tuning);
    {
      // where the lane is at sample k: out past the road's shoulder (and, past its end, the road)
      const lane = (k: number): [number, number] => {
        const o = k < to ? (w.road / 2 + SHOULDER + laneWide(L, k, side) / 2) * side : 0;
        return [T.x[k]! - Math.sin(T.a[k]!) * o, T.y[k]! + Math.cos(T.a[k]!) * o];
      };
      const mid = from + 8;
      expect(R.laneAt(...lane(mid))).toBe(true);
      // it starts on the ground and climbs the way the road runs
      expect(groundAt(w, ...lane(from))).toBeLessThan(2);
      expect(groundAt(w, ...lane(to - 4))).toBeCloseTo(24, 0);
      // a car that drives onto its foot and follows it comes out on the road, on top
      put(w.player, ...lane(from - 4), T.a[from]!, 60);
      const c = w.player;
      for (let n = 0; n < 800; n++) {
        const on = c.idx >= to + 14 && c.idx < to + 50;
        const [tx, ty] = lane(Math.min(T.n - 1, c.idx + 5));
        let turn = Math.atan2(ty - c.y, tx - c.x) - c.h;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        w.step({
          ...NO_CONTROLS,
          steer: Math.max(-1, Math.min(1, turn * 3)),
          throttle: on ? 0 : 0.6,
          brake: on,
        });
      }
      expect(groundAt(w, c.x, c.y)).toBeCloseTo(24, 0);
      expect(Math.hypot(c.x - T.x[c.idx]!, c.y - T.y[c.idx]!)).toBeLessThan(w.road / 2);
    }
    // nothing a rule scatters stands on one
    expect(w.statics.filter((o) => R.laneAt(o.x, o.y) && o.def.id !== w.venue.track!.rail)).toEqual(
      [],
    );
    expect(w.props.filter((o) => R.slipAt(o.x, o.y))).toEqual([]);
  });

  it('its on-ramps are as far apart, as wide and as long as the tuning says', () => {
    const { t } = raisedTrack(24);
    const made = installTrack(C, t);
    const build = (tuning: Partial<typeof DEFAULT_TUNING>): World =>
      new World({
        content: made.content,
        venue: made.venue,
        car: 'car.mutt',
        seed: 1,
        rivals: 0,
        tuning,
      });
    const ways = (w: World): number => {
      const L = lanesOf(w.track!, liftsOf(w.track!, w.venue.track!.raised!), w.road, w.tuning);
      let n = 0;
      for (let k = 1; k < L.rise.length; k++)
        if (L.left[k]! + L.right[k]! > 0 && L.left[k - 1]! + L.right[k - 1]! === 0) n++;
      return n;
    };
    const marked = (w: World): number => w.relief!.slip!.reduce((a, b) => a + b, 0);
    const plain = build({});
    expect(ways(plain)).toBe(1);
    expect(ways(build({ laneGap: 240, laneRun: 3 }))).toBeGreaterThan(1);
    expect(marked(build({ laneWide: 80 }))).toBeGreaterThan(marked(plain));
    expect(marked(build({ laneRun: 7 }))).toBeGreaterThan(marked(plain));
  });

  it('its edges are railed end to end, open only where an on-ramp joins', () => {
    const { w } = raisedTrack(24);
    const T = w.track!;
    const id = w.venue.track!.rail!;
    expect(id).toBeDefined();
    // (the lengths of it along the raised stretch: a venue may fence its road with the same)
    const lift = liftsOf(T, w.venue.track!.raised!);
    const rails = w.statics.filter(
      (o) => o.def.id === id && lift[Math.max(0, w.grid!.nearest(o.x, o.y))]! >= 7,
    );
    expect(rails.length).toBeGreaterThan(40);
    const { wall, from, to, side: laned } = sides(w);
    const railed = (k: number, side: number): boolean => {
      const o = (w.road / 2 + SHOULDER - 7) * side;
      const x = T.x[k]! - Math.sin(T.a[k]!) * o;
      const y = T.y[k]! + Math.cos(T.a[k]!) * o;
      return rails.some((r) => Math.hypot(r.x - x, r.y - y) < 10);
    };
    for (const side of [1, -1]) expect(railed(wall, side)).toBe(true);
    // beside the foot of the on-ramp the road's edge is still a drop, and railed
    expect(railed(from + 3, laned)).toBe(true);
    // where the lane has come level the edge is open
    expect(railed(to - 8, laned)).toBe(false);
    // every rail stands on the top or on a lane, never on a wall's face or the ground below
    for (const r of rails) expect(groundAt(w, r.x, r.y)).toBeGreaterThan(5);
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
