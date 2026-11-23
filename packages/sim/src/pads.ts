import { BASE_SPEED, DT } from '@demodogs/shared';
import type { Car, StaticProp } from './entities';
import type { World } from './world';

/**
 * Track tiles: boost tiles that kick a car along their arrow, and ramps that throw it into the
 * air. A tile is a static prop with a `pad` (see shared/pieces.ts); the world keeps the ones that
 * stand in `pads`. A car sets a tile off once each time it drives onto it.
 */

/** Where (x, y) is on tile s: art px along its arrow and across it, from its middle. */
export function onPad(s: StaticProp, x: number, y: number): [number, number] {
  const cs = Math.cos(s.rot);
  const sn = Math.sin(s.rot);
  const dx = x - s.x;
  const dy = y - s.y;
  return [dx * cs + dy * sn, -dx * sn + dy * cs];
}

/** The tile under (x, y), if any. */
export function padAt(w: World, x: number, y: number): StaticProp | null {
  for (const s of w.pads) {
    if (s.down || Math.abs(s.x - x) > 40 || Math.abs(s.y - y) > 40) continue;
    const P = s.def.pad!;
    const [u, v] = onPad(s, x, y);
    if (Math.abs(u) <= P.long / 2 && Math.abs(v) <= P.wide / 2) return s;
  }
  return null;
}

/** One tick of a car and the tiles: after it has driven, before it is collided. */
export function updatePads(w: World, c: Car): void {
  if (c.surge > 0) c.surge = Math.max(0, c.surge - DT);
  if (!w.pads.length) return;
  // in the air, or up on a deck: the tiles are on the ground
  if (c.wrecked || c.z - c.deck > 1.5 || c.deck > 0) {
    if (c.z - c.deck > 1.5) c.pad = -1;
    return;
  }
  const s = padAt(w, c.x, c.y);
  if (!s) {
    c.pad = -1;
    return;
  }
  if (c.pad === s.index) return;
  c.pad = s.index;
  const P = s.def.pad!;
  const cs = Math.cos(s.rot);
  const sn = Math.sin(s.rot);
  const along = c.vx * cs + c.vy * sn;
  if (P.kind === 'boost') {
    // a kick along the arrow, and for a while a top speed above the car's own
    c.vx += cs * P.push;
    c.vy += sn * P.push;
    c.surge = P.seconds;
    c.surgeK = P.pace;
    w.emit({ t: 'pad', kind: 'boost', car: c.index, prop: s.index, x: c.x, y: c.y, power: P.push });
    return;
  }
  // a ramp only throws what comes up it the right way
  if (along < P.min) return;
  c.vz = Math.max(c.vz, P.lift * Math.min(1.25, Math.max(0.55, along / BASE_SPEED)));
  c.z = Math.max(c.z, c.deck + 0.7);
  w.emit({ t: 'pad', kind: 'jump', car: c.index, prop: s.index, x: c.x, y: c.y, power: along });
}

/**
 * The nearest boost tile ahead of car c that points the way it is going, within `reach`: where
 * an AI driver might steer for. Null if there is none.
 */
export function boostAhead(w: World, c: Car, reach: number): StaticProp | null {
  let best: StaticProp | null = null;
  let bd = reach;
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  for (const s of w.pads) {
    if (s.down || s.def.pad!.kind !== 'boost') continue;
    const dx = s.x - c.x;
    const dy = s.y - c.y;
    if (Math.abs(dx) > bd || Math.abs(dy) > bd) continue;
    const f = dx * cs + dy * sn;
    const side = -dx * sn + dy * cs;
    if (f < 8 || f >= bd || Math.abs(side) > f * 0.35) continue;
    if (Math.cos(s.rot) * cs + Math.sin(s.rot) * sn < 0.6) continue;
    bd = f;
    best = s;
  }
  return best;
}
