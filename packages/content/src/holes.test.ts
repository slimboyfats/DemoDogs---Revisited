import { describe, expect, it } from 'vitest';
import { CAR_RADIUS, NO_CONTROLS } from '@demodogs/shared';
import { Rng, type Car, type World } from '@demodogs/sim';
import { makeWorld, put, startRace, testContent } from './testing';

/**
 * Holes in the world: cars thrown at everything that should stop them, on every venue, at speeds
 * from a crawl to faster than anything in the game goes, and at three sizes. Nothing may come
 * out the far side of a standing wall, leave the map, climb the side of a raised road or go
 * through a bridge's rails. `HOLES=400 pnpm vitest run --project content holes` throws more.
 */
const TRIALS = Number(process.env.HOLES ?? 30);
const SPEEDS = [60, 120, 220, 330, 480, 640];
const SIZES = [1, 0.55, 1.8];
const GO = { ...NO_CONTROLS, throttle: 1 };

const venues = [...testContent().venue.keys()].sort();

/** A venue with the player alone on it (and `rivals` parked cars), racing, nothing wandering about. */
function quiet(venue: string, rivals = 0, car = 'car.mutt'): World {
  const w = startRace(makeWorld({ venue, rivals, seed: 3, car }));
  w.bots.length = 0;
  w.critters.length = 0;
  w.props.length = 0;
  w.pads.length = 0;
  for (const c of w.cars) if (!c.isPlayer) c.ai = null;
  return w;
}

/** Car `c` as good as new at (x, y), heading h at speed v. */
function fresh(c: Car, x: number, y: number, h: number, v: number, size = 1): void {
  put(c, x, y, h, v);
  c.hp = 100;
  c.wrecked = false;
  c.invuln = 9;
  c.spin = 0;
  c.deck = 0;
  c.downT = 0;
  c.climb = 0;
  c.hitCd = 0;
  c.size = size;
}

/** How near the way from a to b comes to p. */
function passes(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l = dx * dx + dy * dy;
  const t = l > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(ax + dx * t - px, ay + dy * t - py);
}

/** How long a car may be on the side of a raised road on its way down it (ticks). */
const SLID = 20;

/**
 * Is car c on the ground part way up the sheer side of a raised road? (One that has come down
 * on it from above is for a moment, sliding off: a hole is one that stays, or got there from below.)
 */
function inWall(w: World, c: Car): boolean {
  const R = w.relief!;
  if (c.z > 1 || R.slipAt(c.x, c.y)) return false;
  const p = R.platAt(c.x, c.y);
  const [ex, ey] = R.edge(c.x, c.y);
  const top = Math.max(
    R.platAt(c.x + ex * 8, c.y + ey * 8),
    R.platAt(c.x + ex * 16, c.y + ey * 16),
  );
  return Math.hypot(ex, ey) > 1.3 && p > 5 && p < top - 3;
}

describe('holes in the world', () => {
  it('no car goes through a standing wall', () => {
    const found: string[] = [];
    for (const venue of venues) {
      const w = quiet(venue);
      const rng = new Rng(11);
      const solid = w.statics.filter(
        (s) => s.def.solid && !s.down && !s.lift && s.def.low === undefined,
      );
      if (!solid.length) continue;
      const c = w.player;
      for (let t = 0; t < TRIALS; t++) {
        const s = solid[rng.int(solid.length)]!;
        if (s.down) continue;
        const a = rng.next() * Math.PI * 2;
        const v = SPEEDS[t % SPEEDS.length]!;
        const size = SIZES[t % SIZES.length]!;
        const far = s.def.radius + 30 * Math.max(1, size);
        const x = s.x - Math.cos(a) * far;
        const y = s.y - Math.sin(a) * far;
        if (x < 40 || y < 40 || x > w.w - 40 || y > w.h - 40) continue;
        if (w.relief && Math.abs(w.relief.at(x, y) - w.relief.at(s.x, s.y)) > 1) continue;
        if (!w.free(x, y, 14 * Math.max(1, size))) continue;
        fresh(c, x, y, a + rng.range(-0.15, 0.15), v, size);
        for (let k = 0; k < 24; k++) {
          const px = c.x;
          const py = c.y;
          w.step(GO);
          // (broken down, it is no longer a wall; and a car put back on the road has not driven there)
          if (s.down || Math.hypot(c.x - px, c.y - py) > 60) break;
          if (c.z < 4 && passes(px, py, c.x, c.y, s.x, s.y) < Math.max(1, s.def.radius - 2)) {
            found.push(`${venue}: through ${s.def.id} at ${v} px/s, size ${size}`);
            break;
          }
        }
        w.takeEvents();
      }
    }
    expect(found).toEqual([]);
  }, 120_000);

  it('no car leaves the map, on the ground or in the air', () => {
    const found: string[] = [];
    for (const venue of venues) {
      const w = quiet(venue);
      const rng = new Rng(5);
      const c = w.player;
      for (let t = 0; t < TRIALS; t++) {
        const v = SPEEDS[t % SPEEDS.length]! * 1.5;
        let x: number, y: number, a: number;
        if (w.oval) {
          a = rng.next() * Math.PI * 2;
          x = w.oval.cx + Math.cos(a) * (w.oval.rx - 30);
          y = w.oval.cy + Math.sin(a) * (w.oval.ry - 30);
        } else {
          const side = rng.int(4);
          const u = rng.range(0.1, 0.9);
          x = side === 0 ? 40 : side === 1 ? w.w - 40 : u * w.w;
          y = side === 2 ? 40 : side === 3 ? w.h - 40 : u * w.h;
          a = [Math.PI, 0, -Math.PI / 2, Math.PI / 2][side]!;
        }
        fresh(c, x, y, a + rng.range(-0.6, 0.6), v);
        c.z = rng.next() < 0.3 ? 30 : 0;
        for (let k = 0; k < 30; k++) {
          w.step(GO);
          const edge = 10 + CAR_RADIUS - 3;
          const out = w.oval
            ? Math.hypot((c.x - w.oval.cx) / w.oval.rx, (c.y - w.oval.cy) / w.oval.ry) > 1.02
            : c.x < edge || c.y < edge || c.x > w.w - edge || c.y > w.h - edge;
          if (out || !Number.isFinite(c.x + c.y + c.z + c.vx + c.vy + c.h)) {
            found.push(`${venue}: at ${c.x.toFixed(0)}, ${c.y.toFixed(0)} from ${v} px/s`);
            break;
          }
        }
        w.takeEvents();
      }
    }
    expect(found).toEqual([]);
  }, 120_000);

  it('no car on the ground gets up the side of a raised road, however fast', () => {
    const found: string[] = [];
    let tried = 0;
    for (const venue of venues) {
      const w = quiet(venue);
      const R = w.relief;
      if (!R?.plat) continue;
      const rng = new Rng(9);
      const c = w.player;
      for (let t = 0, guard = 0; t < TRIALS && guard < TRIALS * 6000; guard++) {
        const x = rng.range(40, w.w - 40);
        const y = rng.range(40, w.h - 40);
        if (R.platAt(x, y) > 0.5 || R.slipAt(x, y)) continue;
        const a = rng.next() * Math.PI * 2;
        const tx = x + Math.cos(a) * 45;
        const ty = y + Math.sin(a) * 45;
        if (R.platAt(tx, ty) < 10 || R.slipAt(tx, ty) || !w.free(x, y, 12)) continue;
        t++;
        tried++;
        const v = SPEEDS[t % SPEEDS.length]!;
        fresh(c, x, y, a + rng.range(-0.5, 0.5), v);
        let stuck = 0;
        for (let k = 0; k < 60; k++) {
          const p0 = R.platAt(c.x, c.y);
          const z0 = c.z;
          const sx = c.x;
          const sy = c.y;
          w.step(GO);
          if (Math.hypot(c.x - sx, c.y - sy) > 60) break;
          stuck = inWall(w, c) ? stuck + 1 : 0;
          // (a ramp or a way up climbs a px or three a tick at these speeds, a wall all at once)
          const up = z0 < 2 && R.platAt(c.x, c.y) - p0 > 8 && !R.slipAt(c.x, c.y);
          if (up || stuck > SLID) {
            found.push(
              `${venue}: ${up ? 'up' : 'in'} the wall at ${v} px/s from ${sx.toFixed(0)}, ${sy.toFixed(0)}`,
            );
            break;
          }
        }
        w.takeEvents();
      }
    }
    expect(tried).toBeGreaterThan(TRIALS);
    expect(found).toEqual([]);
  }, 120_000);

  it('no car is shoved up the side of a raised road by another', () => {
    const found: string[] = [];
    let tried = 0;
    for (const venue of venues) {
      const w = quiet(venue, 1, 'car.bruiser');
      const R = w.relief;
      if (!R?.plat) continue;
      const rng = new Rng(21);
      const c = w.player;
      const o = w.cars.find((k) => k !== c)!;
      for (let t = 0, guard = 0; t < TRIALS && guard < TRIALS * 6000; guard++) {
        const x = rng.range(60, w.w - 60);
        const y = rng.range(60, w.h - 60);
        if (R.platAt(x, y) > 0.5 || R.slipAt(x, y)) continue;
        const a = rng.next() * Math.PI * 2;
        const far = rng.range(14, 30);
        const tx = x + Math.cos(a) * far;
        const ty = y + Math.sin(a) * far;
        if (R.platAt(tx, ty) < 10 || R.slipAt(tx, ty) || !w.free(x, y, 12)) continue;
        t++;
        tried++;
        const v = SPEEDS[t % SPEEDS.length]!;
        // one car stands by the wall, and the heavy one comes at it from behind
        fresh(o, x, y, a + rng.range(-1.5, 1.5), 0);
        fresh(c, x - Math.cos(a) * 34, y - Math.sin(a) * 34, a, v);
        const stuck = [0, 0];
        for (let k = 0; k < 90; k++) {
          w.step(GO);
          stuck[0] = inWall(w, o) ? stuck[0]! + 1 : 0;
          stuck[1] = inWall(w, c) ? stuck[1]! + 1 : 0;
          if (stuck[0] <= SLID && stuck[1] <= SLID) continue;
          const who = stuck[0] > SLID ? 'the shoved car' : 'the car shoving';
          found.push(`${venue}: ${who} stands in the wall, hit at ${v} px/s`);
          break;
        }
        w.takeEvents();
      }
    }
    expect(tried).toBeGreaterThan(TRIALS);
    expect(found).toEqual([]);
  }, 120_000);

  it('no car goes through the rails of a bridge', () => {
    const found: string[] = [];
    let tried = 0;
    for (const venue of venues) {
      const w = quiet(venue);
      const T = w.track;
      if (!T || !w.deckH) continue;
      const rng = new Rng(4);
      const c = w.player;
      const railed: number[] = [];
      for (let i = 0; i < T.n; i++) if (w.deckAt(i) > 6 && !w.deckOpen?.[i]) railed.push(i);
      if (!railed.length) continue;
      for (let t = 0; t < TRIALS; t++) {
        const i = railed[rng.int(railed.length)]!;
        const v = SPEEDS[t % SPEEDS.length]!;
        const side = rng.next() < 0.5 ? -1 : 1;
        fresh(c, T.x[i]!, T.y[i]!, T.a[i]! + side * rng.range(0.2, 1.5), v);
        c.idx = i;
        c.z = w.deckAt(i);
        tried++;
        for (let k = 0; k < 40; k++) {
          const sx = c.x;
          const sy = c.y;
          const was = c.deck;
          w.step(GO);
          if (Math.hypot(c.x - sx, c.y - sy) > 60) break;
          const j = c.idx;
          const off = -(c.x - T.x[j]!) * Math.sin(T.a[j]!) + (c.y - T.y[j]!) * Math.cos(T.a[j]!);
          const on = k > 0 && was > 6 && w.deckAt(j) > 6 && !w.deckOpen?.[j];
          if (on && Math.abs(off) > w.road / 2 + 2) {
            found.push(`${venue}: off the deck at ${v} px/s, ${off.toFixed(1)} px from the middle`);
            break;
          }
        }
        w.takeEvents();
      }
    }
    expect(tried).toBeGreaterThan(0);
    expect(found).toEqual([]);
  }, 120_000);
});
