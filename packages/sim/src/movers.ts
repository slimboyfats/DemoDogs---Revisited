import { DT, GRAVITY, type PickupManifest } from '@demodogs/shared';
import { batter, breakProp, damage, footing, light } from './damage';
import type { Car } from './entities';
import { clamp } from './math';
import { circles, hull, toLocal } from './physics';
import type { World } from './world';

/**
 * Movement pickups: a blade bolted to the nose that ploughs through scenery and rivals, and
 * springs that throw the car over a crater or a slick lying ahead. Both are on the car until they
 * are used up, and both work the same for the player and for rivals.
 */

/** Seconds between two bites of a blade: what it is pushing into loses a piece each time. */
const BITE_EVERY = 0.1;
/** Springs: the least speed that makes a leap, how far ahead (art px) they look, and in what steps. */
const HOP_SPEED = 45;
const SCAN = 140;
const STEP = 4;

/** A movement pickup taken: put it on the car and return what the pickup says, or null if `got` is not one. */
export function fitMover(w: World, c: Car, got: PickupManifest): string | null {
  if (got.kind === 'blade') {
    const fresh = !c.blade;
    c.blade = { def: got, t: got.seconds ?? 8, cd: 0 };
    if (fresh) {
      const [x, y] = nose(c);
      w.emit({ t: 'blade', car: c.index, id: got.id, on: true, x, y });
    }
    return `${got.meta.name.toUpperCase()} ${Math.round(got.seconds ?? 8)}s`;
  }
  if (got.kind === 'springs') {
    const n = (c.springs?.n ?? 0) + (got.charges ?? 2);
    c.springs = { def: got, n };
    return `${got.meta.name.toUpperCase()} x${n}`;
  }
  return null;
}

/** The middle of the blade's edge, in the world. */
export function nose(c: Car): [number, number] {
  const a = (c.def.body.halfLength + 2.5) * c.size;
  return [c.x + Math.cos(c.h) * a, c.y + Math.sin(c.h) * a];
}

/** One tick of a car's movement pickups: after it has driven, before it is collided. */
export function updateMovers(w: World, c: Car): void {
  if (c.wrecked) {
    if (c.blade) dropBlade(w, c);
    c.springs = null;
    c.hop = -1;
    return;
  }
  if (c.blade) plough(w, c);
  if (c.hop >= 0) {
    c.hop += DT;
    if (c.z <= 0 && c.hop > 0.08) {
      w.emit({ t: 'touchdown', car: c.index, x: c.x, y: c.y, impact: (GRAVITY * c.hop) / 2 });
      c.hop = -1;
      if (c.springs && c.springs.n <= 0) c.springs = null;
    }
  } else if (c.springs && c.springs.n > 0 && w.phase === 'race') leap(w, c, c.springs);
}

function dropBlade(w: World, c: Car): void {
  const [x, y] = nose(c);
  const id = c.blade!.def.id;
  c.blade = null;
  w.emit({ t: 'blade', car: c.index, id, on: false, x, y });
}

/**
 * The blade: anything breakable in front of it is chewed while the car pushes into it, instead of
 * the car bouncing off, and rivals are bitten and shoved aside. Bites come every BITE_EVERY seconds;
 * a faster car bites harder.
 */
function plough(w: World, c: Car): void {
  const B = c.blade!;
  B.t -= DT;
  B.cd -= DT;
  if (B.t <= 0) {
    dropBlade(w, c);
    return;
  }
  if (c.z > 6) return;
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  const reach = (c.def.body.halfLength + 2.5) * c.size;
  const half = (c.def.body.halfWidth + 2) * c.size;
  const vf = c.vx * cs + c.vy * sn;
  const bite = B.def.bite ?? 60;
  const ready = B.cd <= 0;
  let bit = false;
  let held = false;
  // within the blade's sweep: just in front of the nose and no wider than the blade
  const under = (x: number, y: number, r: number): [number, number] | null => {
    const L = toLocal(c, x, y);
    if (L[0] < reach - r - 1 || L[0] > reach + r + 1.5 || Math.abs(L[1]) > half + r * 0.5)
      return null;
    return L;
  };

  // scenery: chewed while the car leans on it, so it grinds through instead of bouncing off
  const [nx, ny] = nose(c);
  for (const s of w.near(nx, ny, 24)) {
    if (s.down || !s.def.solid || s.hp === undefined) continue;
    const L = under(s.x, s.y, s.def.radius);
    if (!L) continue;
    const px = c.x + cs * reach - sn * clamp(L[1], -half, half);
    const py = c.y + sn * reach + cs * clamp(L[1], -half, half);
    if (ready && (vf > 4 || c.throttle > 0)) {
      bit = true;
      batter(
        w,
        s,
        bite * BITE_EVERY * (1 + Math.max(0, vf) / 70) * s.def.hardness,
        'impact',
        px,
        py,
      );
    }
    held ||= !s.down;
  }
  // what is left standing holds the car, with no knock back and no damage to it
  if (held && vf > 0) {
    c.vx -= cs * vf * 0.85;
    c.vy -= sn * vf * 0.85;
  }

  // loose things are scooped up and thrown forward; crates burst, drums light
  for (const p of w.props) {
    if (!p.alive || p.z > 8 || !under(p.x, p.y, p.def.radius)) continue;
    if (p.def.breaksAt !== undefined && vf > 10) {
      breakProp(w, p, c);
      continue;
    }
    if (p.def.explodesAt !== undefined && vf > 30) light(p, c.index, 0.4);
    const lift = Math.max(0, vf) * 1.25;
    p.vx = c.vx + cs * 20 + cs * lift * 0.3;
    p.vy = c.vy + sn * 20 + sn * lift * 0.3;
    p.vz = Math.max(p.vz, 30 + lift * 0.4);
  }

  // rivals: bitten where the blade meets them and pushed off the line
  for (const o of w.cars) {
    if (o === c || Math.abs(o.z - c.z) > 8 || Math.abs(o.x - c.x) > 40 || Math.abs(o.y - c.y) > 40)
      continue;
    let L: [number, number] | null = null;
    for (const q of circles(o)) L ??= under(q[0], q[1], hull(o));
    if (!L) continue;
    const closing = vf - (o.vx * cs + o.vy * sn);
    if (closing <= 2) continue;
    const side = L[1] >= 0 ? 1 : -1;
    // shove: along the blade's push, and out to the side it was hit on
    const push = Math.min(closing, 160);
    o.vx += cs * push * 0.55 - sn * side * push * 0.35;
    o.vy += sn * push * 0.55 + cs * side * push * 0.35;
    o.spin += side * clamp(push * 0.03, 0.4, 3);
    c.vx -= cs * push * 0.2;
    c.vy -= sn * push * 0.2;
    if (ready && !o.wrecked) {
      bit = true;
      const lat = clamp(L[1], -half, half);
      damage(
        w,
        o,
        bite * BITE_EVERY * 2 * (1 + push / 50) * c.ram,
        c,
        c.x + cs * reach - sn * lat,
        c.y + sn * reach + cs * lat,
      );
      // the blade took the knock, so the plain crash that follows does no harm to either car
      c.hitCd = o.hitCd = 0.3;
      if (push > 25)
        w.emit({
          t: 'crash',
          x: c.x + cs * reach,
          y: c.y + sn * reach,
          impact: push,
          player: c === w.player || o === w.player,
        });
    }
  }
  if (bit) B.cd = BITE_EVERY;
}

/**
 * Springs: on good ground at speed, with a crater, a slick or soft ground just ahead, the car is
 * thrown up far enough to sail over it. Lift is the manifest's; the leap lasts 2·lift/g seconds.
 */
function leap(w: World, c: Car, S: { def: PickupManifest; n: number }): void {
  if (c.z > 0.6 || c.vz > 0) return;
  const speed = Math.hypot(c.vx, c.vy);
  if (speed < HOP_SPEED) return;
  const dx = c.vx / speed;
  const dy = c.vy / speed;
  const bad = (d: number): boolean => {
    const [grip, drag, pit] = footing(w, c.x + dx * d, c.y + dy * d);
    return pit || grip < 0.75 || drag > 0.3;
  };
  // take off just before the bad ground starts: the nose is about to reach it
  const near = c.def.body.halfLength + 4 + speed * 0.05;
  let from = -1;
  for (let d = STEP; d <= near; d += STEP)
    if (bad(d)) {
      from = d;
      break;
    }
  if (from < 0) return;
  // and leap far enough to clear all of it, with a car's length to spare
  let to = from;
  while (to < SCAN && bad(to + STEP)) to += STEP;
  const span = to + c.def.body.halfLength * 2 + 6;
  const max = S.def.lift ?? 125;
  c.vz = clamp((GRAVITY * span) / (2 * speed), max * 0.45, max);
  c.z = 0.7;
  c.hop = 0;
  // a spent set stays on until the car is down, so it can still be seen under it
  S.n--;
  w.emit({ t: 'hop', car: c.index, x: c.x, y: c.y });
}
