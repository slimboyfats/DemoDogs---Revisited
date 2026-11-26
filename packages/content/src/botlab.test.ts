import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent } from './index';
import { makeWorld } from './testing';

/**
 * The bot lab: every venue raced by a field of bots alone, a few seeds each, and what became of
 * them counted (laps, time off the road, time stuck, crashes, rescues, wrecks, shots). It is how a
 * change to the drivers is judged. Not part of the checks: `pnpm bots [venue ...]` runs it and
 * writes `captures/bots/stats.json`.
 */
const on = process.env.BOTLAB !== undefined;
const only = (process.env.BOTLAB ?? '').split(',').filter(Boolean);
const SEEDS = (process.env.BOTLAB_SEEDS ?? '1,2,3').split(',').map(Number);
/** A race is run for this long whatever the laps, so every car's distance can be compared. */
const RACE = 60 * 150;
const CAP = 60 * 60 * 6;

interface Row {
  venue: string;
  kind: string;
  /** Seconds raced. */
  time: number;
  /** Laps driven in that time: the field's mean, its slowest car and its fastest. In a derby, cars left. */
  laps: number;
  worst: number;
  best: number;
  cars: number;
  offroad: number;
  stuck: number;
  reverses: number;
  /** Knocks between cars, and into scenery. */
  crashes: number;
  walls: number;
  rescues: number;
  wrecks: number;
  fires: number;
  pickups: number;
  pads: number;
  speed: number;
  /** Seconds a car spun off the road takes to be back on it and under way (see `knocked`). */
  back: number;
}

function race(venue: string, seed: number): Row {
  const w = makeWorld({ venue, seed, autopilot: true, laps: 99, playOn: true });
  const r: Row = {
    venue: venue.replace('venue.', ''),
    kind: w.kind,
    time: 0,
    laps: 0,
    worst: 0,
    best: 0,
    cars: w.cars.length,
    offroad: 0,
    stuck: 0,
    reverses: 0,
    crashes: 0,
    walls: 0,
    rescues: 0,
    wrecks: 0,
    fires: 0,
    pickups: 0,
    pads: 0,
    speed: 0,
    back: 0,
  };
  let live = 0;
  let ticks = 0;
  const rev = w.cars.map(() => false);
  let raced = 0;
  while (ticks < CAP && w.phase !== 'over' && raced < RACE) {
    w.step();
    ticks++;
    for (const e of w.takeEvents()) {
      if (e.t === 'crash') {
        // car on car, car on scenery; the rest (what weapons throw about) is not driving
        if (w.cars.filter((c) => Math.hypot(c.x - e.x, c.y - e.y) < 24).length > 1) r.crashes++;
        else if (
          w
            .near(e.x, e.y, 16)
            .some((s) => !s.down && Math.hypot(s.x - e.x, s.y - e.y) < s.def.radius + 6)
        )
          r.walls++;
      } else if (e.t === 'rescue') r.rescues++;
      else if (e.t === 'wreck') r.wrecks++;
      else if (e.t === 'fire') r.fires++;
      else if (e.t === 'pickup') r.pickups++;
      else if (e.t === 'pad') r.pads++;
    }
    if (w.phase !== 'race') continue;
    if (w.kind === 'race') raced++;
    for (const c of w.cars) {
      if (c.wrecked || c.finished) continue;
      live++;
      if (c.offroad) r.offroad++;
      if (Math.abs(c.vf) < 12) r.stuck++;
      r.speed += Math.abs(c.vf);
      const back = (c.ai?.revT ?? 0) > 0;
      if (back && !rev[c.index]) r.reverses++;
      rev[c.index] = back;
    }
  }
  r.time = w.raceTime;
  if (w.track) {
    const laps = w.cars.map((c) => c.progress / w.track!.len);
    r.laps = laps.reduce((a, b) => a + b, 0) / laps.length;
    r.worst = Math.min(...laps);
    r.best = Math.max(...laps);
  } else r.laps = r.worst = r.best = w.cars.filter((c) => !c.wrecked).length;
  r.offroad = (100 * r.offroad) / Math.max(1, live);
  r.stuck = (100 * r.stuck) / Math.max(1, live);
  r.speed /= Math.max(1, live);
  return r;
}

/**
 * Recovery: every few seconds a car is spun off the road (put down beside it, stopped, facing
 * back the way it came), and the time it takes to be on the road again and further on than it
 * was is taken. The mean, in seconds; a car that is not back in 20 counts as 20.
 */
function knocked(venue: string, seed: number): number {
  const w = makeWorld({ venue, seed, autopilot: true, laps: 99 });
  const T = w.track;
  if (!T) return 0;
  const out: { car: number; from: number; t: number }[] = [];
  const took: number[] = [];
  let next = 0;
  for (let tick = 0; tick < 60 * 100; tick++) {
    w.step();
    w.takeEvents();
    if (w.phase !== 'race') continue;
    if (tick % 240 === 0 && tick > 600) {
      const c = w.cars[next++ % w.cars.length]!;
      if (!c.wrecked && !out.some((o) => o.car === c.index)) {
        const a = T.a[c.idx]!;
        const side = next % 2 ? 1 : -1;
        const far = w.road / 2 + 30;
        c.x = T.x[c.idx]! - Math.sin(a) * side * far;
        c.y = T.y[c.idx]! + Math.cos(a) * side * far;
        c.h = a + Math.PI * 0.85;
        c.vx = c.vy = c.spin = 0;
        out.push({ car: c.index, from: c.progress, t: 0 });
      }
    }
    for (let i = out.length - 1; i >= 0; i--) {
      const o = out[i]!;
      const c = w.cars[o.car]!;
      o.t += 1 / 60;
      if ((!c.offroad && c.progress > o.from + 60) || o.t >= 20) {
        took.push(o.t);
        out.splice(i, 1);
      }
    }
  }
  return took.length ? took.reduce((a, b) => a + b, 0) / took.length : 0;
}

describe.runIf(on)('bot lab', () => {
  it('races every venue with bots alone', () => {
    const venues = [...loadContent().venue.keys()]
      .sort()
      .filter((v) => !only.length || only.some((o) => v.includes(o)));
    const rows: Row[] = [];
    for (const v of venues) {
      const runs = process.env.BOTLAB_KNOCK ? [race(v, 1)] : SEEDS.map((s) => race(v, s));
      const mean = (k: keyof Row) => runs.reduce((a, r) => a + (r[k] as number), 0) / runs.length;
      const row = { ...runs[0]! };
      for (const k of Object.keys(row) as (keyof Row)[])
        if (typeof row[k] === 'number') (row[k] as number) = Math.round(mean(k) * 100) / 100;
      row.back = Math.round(knocked(v, 1) * 100) / 100;
      rows.push(row);
      console.log(JSON.stringify(row));
    }
    const out = process.env.BOTLAB_OUT ?? 'captures/bots';
    mkdirSync(out, { recursive: true });
    writeFileSync(`${out}/stats.json`, JSON.stringify(rows, null, 2));
    console.table(rows);
    expect(rows.length).toBeGreaterThan(0);
  }, 3_600_000);
});
