import { describe, expect, it } from 'vitest';
import type { World } from '@demodogs/sim';
import { bench, put } from './testing';

const IDLE = { steer: 0, throttle: 0, brake: false, boost: false, fire: false };

/** The foot of a terrace beside the road: a point on the level, and the way up its face. */
function cliff(w: World): { x: number; y: number; nx: number; ny: number; top: number } {
  const R = w.relief!;
  const T = w.track!;
  // (either side of the road: banks may rise only outside its loop)
  for (let q = 0; q < T.n * 2; q += 5) {
    const i = q % T.n;
    const side = q < T.n ? 1 : -1;
    const j = (i + 1) % T.n;
    const tx = T.x[j]! - T.x[i]!;
    const ty = T.y[j]! - T.y[i]!;
    const l = Math.hypot(tx, ty);
    const nx = (-ty / l) * side;
    const ny = (tx / l) * side;
    for (let d = w.road / 2 + 8; d < w.road / 2 + 120; d += 1) {
      const x = T.x[i]! + nx * d;
      const y = T.y[i]! + ny * d;
      const rise = R.at(x + nx * 4, y + ny * 4) - R.at(x, y);
      // a clean face with level ground before it and nothing standing in the way
      if (rise < 10) continue;
      const fx = x - nx * 26;
      const fy = y - ny * 26;
      if (Math.abs(R.at(x - nx * 3, y - ny * 3) - R.at(fx, fy)) > 1.5) break;
      if (w.near(x, y, 60).some((s) => !s.down && s.def.solid && Math.hypot(s.x - x, s.y - y) < 44))
        break;
      return { x: fx, y: fy, nx, ny, top: R.at(x + nx * 8, y + ny * 8) };
    }
  }
  throw new Error('no cliff');
}

describe('raised ground', () => {
  it('a terrace face stops a car on the ground', () => {
    const w = bench({ venue: 'venue.sunbake-canyon' });
    const R = w.relief!;
    const k = cliff(w);
    const c = w.player;
    put(c, k.x, k.y, Math.atan2(k.ny, k.nx), 160);
    const from = R.at(c.x, c.y);
    let crashed = false;
    for (let i = 0; i < 40; i++) {
      w.step({ ...IDLE, throttle: 1 });
      for (const e of w.takeEvents()) if (e.t === 'crash') crashed = true;
      expect(R.at(c.x, c.y)).toBeLessThan(from + 6);
    }
    expect(crashed).toBe(true);
  });

  it('a car driven off the top is in the air, and lands at the foot', () => {
    const w = bench({ venue: 'venue.sunbake-canyon' });
    const R = w.relief!;
    const k = cliff(w);
    const c = w.player;
    // from the top, back the way the face was climbed
    put(c, k.x + k.nx * 40, k.y + k.ny * 40, Math.atan2(-k.ny, -k.nx), 150);
    const top = R.at(c.x, c.y);
    expect(top).toBeGreaterThan(R.at(k.x, k.y) + 10);
    let high = 0;
    let landed = false;
    for (let i = 0; i < 60; i++) {
      w.step(IDLE);
      high = Math.max(high, c.z);
      for (const e of w.takeEvents()) if (e.t === 'land') landed = true;
    }
    expect(high).toBeGreaterThan(8);
    expect(landed).toBe(true);
    expect(c.z).toBe(0);
    expect(R.at(c.x, c.y)).toBeLessThan(top - 10);
  });

  it('a hill pulls a standing car down it', () => {
    const w = bench({ venue: 'venue.splinter-ridge' });
    const R = w.relief!;
    const T = w.track!;
    let at = -1;
    for (let i = 0; i < T.n && at < 0; i++)
      if (Math.hypot(R.dx(T.x[i]!, T.y[i]!), R.dy(T.x[i]!, T.y[i]!)) > 0.1) at = i;
    expect(at).toBeGreaterThanOrEqual(0);
    const c = w.player;
    put(c, T.x[at]!, T.y[at]!, Math.atan2(-R.dy(T.x[at]!, T.y[at]!), -R.dx(T.x[at]!, T.y[at]!)));
    const h0 = R.at(c.x, c.y);
    for (let i = 0; i < 90; i++) w.step(IDLE);
    expect(R.at(c.x, c.y)).toBeLessThan(h0 - 1);
    expect(Math.hypot(c.vx, c.vy)).toBeGreaterThan(8);
  });

  it('a flat venue has no relief', () => {
    expect(bench({ venue: 'venue.rustwater-wharf' }).relief).toBeNull();
  });
});
