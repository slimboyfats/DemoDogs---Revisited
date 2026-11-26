import { DT, GRAVITY, type BotManifest, type PickupManifest } from '@demodogs/shared';
import { barrelOf, fitAddon, reachOf } from './addons';
import { fitCatchup, odds, place } from './catchup';
import {
  bound,
  carGap,
  carShape,
  hull,
  girth,
  newShape,
  newTouch,
  pointGap,
  propGap,
  propPoint,
  reach,
} from './shapes';
import { grantDefence } from './defence';
import type { Bot, Car, StaticProp } from './entities';
import { TAU, angDiff, clamp } from './math';
import { airburst, damage, explode, launch, light, pour, spill, throwOut } from './damage';
import { fitMover } from './movers';
import { burst, lockOn, lockedOn } from './payloads';
import { smash } from './docks';
import type { World } from './world';
import { drop, inSmoke } from './drops';
import { firePulse } from './shock';
import { fireHowl } from './howl';
import { fireArsenal, isArsenal } from './arsenal';
import { fireArms, isArms } from './arms';
import { land } from './hazards';
import { bounced, fitGuard, hidden, lureHit, lureTurn, lured } from './guards';
import { dip, fitTrick } from './tricks';

// ---------------------------------------------------------------- scrap bots

export function makeBot(w: World, def: BotManifest, index: number): Bot {
  return {
    index,
    def,
    paint: w.rng.pick(def.paints),
    x: 0,
    y: 0,
    h: 0,
    tx: 0,
    ty: 0,
    speed: 0,
    alive: true,
    deadT: 0,
  };
}

/** A random spot for a bot: near the road on a track, anywhere inside the bowl in a derby. */
export function botSpot(w: World, farFromPlayer: boolean): [number, number] {
  for (let tries = 0; tries < 30; tries++) {
    let x: number;
    let y: number;
    if (w.track) {
      const T = w.track;
      const i = w.rng.int(T.n);
      const off = w.rng.range(-1, 1) * (w.road / 2 + 30);
      x = T.x[i]! - Math.sin(T.a[i]!) * off;
      y = T.y[i]! + Math.cos(T.a[i]!) * off;
    } else {
      const O = w.oval!;
      const t = w.rng.next() * TAU;
      const q = Math.sqrt(w.rng.next()) * 0.85;
      x = O.cx + Math.cos(t) * O.rx * q;
      y = O.cy + Math.sin(t) * O.ry * q;
    }
    // while the world is being built there is no player yet
    const P = w.cars.find((c) => c.isPlayer);
    if (farFromPlayer && P && Math.hypot(x - P.x, y - P.y) < 260) continue;
    if (!w.free(x, y, 6)) continue;
    return [x, y];
  }
  return [w.w / 2, w.h / 2];
}

export function spawnBot(w: World, b: Bot, initial: boolean): void {
  const p = botSpot(w, !initial);
  b.x = p[0];
  b.y = p[1];
  b.h = w.rng.next() * TAU;
  b.alive = true;
  b.speed = 0;
  b.paint = w.rng.pick(b.def.paints);
  const t = botSpot(w, false);
  b.tx = t[0];
  b.ty = t[1];
  w.emit({ t: 'bot-spawn', bot: b.index });
}

/** Lists `near` fills for the rules here that ask every tick. */
const BOT_NEAR: StaticProp[] = [];
const PROP_NEAR: StaticProp[] = [];

export function updateBot(w: World, b: Bot): void {
  const D = b.def;
  if (!b.alive) {
    b.deadT -= DT;
    if (b.deadT <= 0) spawnBot(w, b, false);
    return;
  }
  // flee the nearest fast car, otherwise stroll to a target
  let fx = 0;
  let fy = 0;
  let scared = false;
  for (const c of w.cars) {
    if (c.wrecked) continue;
    const dx = b.x - c.x;
    const dy = b.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d < D.scareRadius && Math.hypot(c.vx, c.vy) > D.fleeAbove) {
      scared = true;
      fx += dx / (d + 1);
      fy += dy / (d + 1);
    }
  }
  let want: number;
  if (scared) {
    want = Math.atan2(fy, fx);
    b.speed += (D.fleeSpeed - b.speed) * 0.1;
  } else {
    if (Math.hypot(b.tx - b.x, b.ty - b.y) < 8) [b.tx, b.ty] = botSpot(w, false);
    want = Math.atan2(b.ty - b.y, b.tx - b.x);
    b.speed += (D.walkSpeed - b.speed) * 0.05;
  }
  b.h += clamp(angDiff(want, b.h), -5 * DT, 5 * DT);
  let nx = b.x + Math.cos(b.h) * b.speed * DT;
  let ny = b.y + Math.sin(b.h) * b.speed * DT;
  for (const s of w.near(nx, ny, 6, BOT_NEAR)) {
    const r = s.def.radius;
    if (s.down || !s.def.solid || Math.abs(s.x - nx) > r + 4 || Math.abs(s.y - ny) > r + 4)
      continue;
    const d = Math.hypot(nx - s.x, ny - s.y) || 1;
    if (d < r + 3.5) {
      nx = s.x + ((nx - s.x) / d) * (r + 3.5);
      ny = s.y + ((ny - s.y) / d) * (r + 3.5);
      [b.tx, b.ty] = botSpot(w, false);
    }
  }
  if (w.inside(nx, ny, 5)) {
    b.x = nx;
    b.y = ny;
  } else [b.x, b.y] = w.keepInside(nx, ny, 5);
  for (const c of w.cars) {
    const d = Math.hypot(b.x - c.x, b.y - c.y);
    if (d >= 12 || c.z >= 8) continue;
    if (Math.hypot(c.vx, c.vy) > D.smashAbove && !c.wrecked) {
      smashBot(w, b, c);
      return;
    }
    const k = (12 - d) / (d || 1);
    b.x += (b.x - c.x) * k;
    b.y += (b.y - c.y) * k;
  }
}

export function smashBot(w: World, b: Bot, c: Car): void {
  b.alive = false;
  b.deadT = w.rng.range(b.def.respawn[0], b.def.respawn[1]);
  w.emit({ t: 'smash', bot: b.index, by: c.index, x: b.x, y: b.y, vx: c.vx, vy: c.vy });
  c.score += b.def.points;
  c.smashed++;
  c.nitro = Math.min(1, c.nitro + b.def.nitro);
  c.vx *= 0.94;
  c.vy *= 0.94;
  w.emit({
    t: 'score',
    car: c.index,
    x: b.x,
    y: b.y,
    points: b.def.points,
    label: `+${b.def.points}`,
  });
}

// ---------------------------------------------------------------- loose props

/** A piece of scenery's shape and where a prop touches it: filled again for each pair. */
const AT = newTouch();

export function updateProps(w: World): void {
  for (const p of w.props) {
    if (!p.alive) continue;
    // most props lie still all race: one the last tick left as it was, that nothing has moved
    // since and no scenery has been stood beside, would be left as it is again
    const still =
      p.vx === 0 &&
      p.vy === 0 &&
      p.vz === 0 &&
      p.spin === 0 &&
      p.z <= 0 &&
      p.fuse <= 0 &&
      !p.flying;
    if (still && p.restN === w.stood && p.restX === p.x && p.restY === p.y) continue;
    const x0 = p.x;
    const y0 = p.y;
    if (p.fuse > 0) {
      // lit: whatever it holds is already pouring out
      pour(w, p);
      p.fuse -= DT;
      if (p.fuse <= 0) {
        if (p.def.rocket) launch(w, p);
        else {
          p.alive = false;
          explode(w, p.x, p.y, p.def.blast ?? 1, p.owner >= 0 ? w.cars[p.owner]! : null);
          throwOut(w, p);
          continue;
        }
      }
    }
    if (p.flying) {
      // a burst drum climbs on its own fire, and blows apart at the top or on whatever it hits
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      p.rot += p.spin * DT;
      p.vz -= GRAVITY * w.gravity * 0.55 * DT;
      p.z += p.vz * DT;
      const k = w.keepInside(p.x, p.y, girth(p.def));
      if (p.vz <= 0 || p.z <= 0 || k[0] !== p.x || k[1] !== p.y) airburst(w, p);
      continue;
    }
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    p.rot += p.spin * DT;
    if (p.z > 0 || p.vz) {
      p.vz -= GRAVITY * w.gravity * 0.95 * DT;
      p.z += p.vz * DT;
      if (p.def.smash && p.vz < -20 && p.z < 9) smash(w, p);
      if (p.z <= 0) {
        if (p.def.crush && p.vz < -60) land(w, p, -p.vz);
        p.z = 0;
        p.vz = p.vz < -60 ? -p.vz * 0.35 : 0;
      }
    }
    if (p.z <= 0) {
      const f = Math.exp(-4 * DT);
      p.vx *= f;
      p.vy *= f;
      p.spin *= f;
    }
    // (against the map's edge and against scenery it is a ball: as big round as it is across)
    const ball = girth(p.def);
    if (!w.inside(p.x, p.y, ball)) {
      const k = w.keepInside(p.x, p.y, ball);
      if (k[0] !== p.x || k[1] !== p.y) {
        [p.x, p.y] = k;
        p.vx *= -0.4;
        p.vy *= -0.4;
      }
    }
    // something heavy still in the air comes down on top of scenery instead of bouncing off it
    const over = p.def.crush !== undefined && p.z > 4;
    if (!over)
      for (const s of w.near(p.x, p.y, ball, PROP_NEAR)) {
        if (s.down || !s.def.solid) continue;
        const m = bound(s.def) + ball;
        if (Math.abs(s.x - p.x) > m || Math.abs(s.y - p.y) > m) continue;
        const gap = propPoint(s.def, s.x, s.y, s.rot, p.x, p.y, AT);
        if (gap < ball) {
          p.x += AT.nx * (ball - gap);
          p.y += AT.ny * (ball - gap);
          p.vx *= -0.4;
          p.vy *= -0.4;
        }
      }
    if (still && p.x === x0 && p.y === y0) {
      p.restX = x0;
      p.restY = y0;
      p.restN = w.stood;
    }
  }
}

// ---------------------------------------------------------------- pickups and weapons

/** How near a crate a car's hull has to come to pick it up (art px): the crate's own half width. */
export const PICKUP_REACH = 6.8;
/** How near a mine a car's hull has to come to set it off, unless the mine says. */
export const MINE_TRIGGER = 5;
/** How near a rocket has to come to a car's hull, or to scenery, to go off. */
export const ROCKET_REACH = 3;
/** How high over the ground (or its deck) a rocket flies: what stands lower than that it goes over. */
export const ROCKET_HIGH = 4;

export function updatePickups(w: World): void {
  for (const p of w.pickups) {
    p.t += DT;
    if (!p.on) {
      if (p.t > w.mode.pickupRespawn) {
        p.on = true;
        p.t = 0;
      }
      continue;
    }
    for (const c of w.cars) {
      if (c.wrecked || Math.abs(c.deck - p.z) > 8) continue;
      if (!c.fit.magnet && (Math.abs(c.x - p.x) > 60 || Math.abs(c.y - p.y) > 60)) continue;
      // (any part of the car that touches it picks it up: its nose as much as its middle)
      const far = carGap(c, p.x, p.y);
      const plain = PICKUP_REACH;
      if (far > reachOf(c, plain)) continue;
      // a magnet's catch flies in from where it lay
      if (far > plain) w.emit({ t: 'fetch', car: c.index, x: p.x, y: p.y });
      p.on = false;
      p.t = 0;
      const hurt = c.hp < 70;
      const kinds = w.venue.pickups.map((id) => w.content.pickup.get(id)!);
      // where the car is running leans the odds: the back of the field rolls the strong ones
      const at = place(w, c);
      const total = kinds.reduce((s, k) => s + odds(k, hurt, at, w.mode.crates), 0);
      let roll = w.rng.next() * total;
      let got = kinds[kinds.length - 1]!;
      for (const k of kinds) {
        roll -= odds(k, hurt, at, w.mode.crates);
        if (roll < 0) {
          got = k;
          break;
        }
      }
      const label = grant(w, c, got);
      w.emit({ t: 'pickup', car: c.index, x: p.x, y: p.y, label, kind: got.kind });
      break;
    }
  }
}

/** Give car `c` what pickup `got` holds; returns the words to float over it. */
export function grant(w: World, c: Car, got: PickupManifest): string {
  const defence = grantDefence(w, c, got);
  if (defence) return defence;
  const mover = fitMover(w, c, got);
  if (mover !== null) return mover;
  const guard = fitGuard(w, c, got);
  if (guard !== null) return guard;
  // a kit crate: one of the pickups it lists
  if (got.kind === 'kit') return grant(w, c, w.content.pickup.get(w.rng.pick(got.kits ?? []))!);
  // a bag of tricks: one of the toys it lists, by their own odds
  if (got.kind === 'tricks') return grant(w, c, dip(w, c, got));
  const trick = fitTrick(w, c, got);
  if (trick !== null) return trick;
  const help = fitCatchup(w, c, got);
  if (help !== null) return help;
  const addon = fitAddon(w, c, got);
  if (addon !== null) return addon;
  let label: string;
  if (got.kind === 'repair') {
    c.hp = Math.min(100, c.hp + (got.amount ?? 40));
    label = `REPAIR +${got.amount ?? 40}`;
  } else if (got.kind === 'nitro') {
    c.nitro = 1;
    label = 'BOOST REFILL';
  } else if (got.kind === 'ammo') {
    c.rounds += got.amount ?? 30;
    label = `AMMO +${got.amount ?? 30}`;
  } else if (got.kind === 'cash') {
    c.cash += got.amount ?? 100;
    label = `+${got.amount ?? 100} CASH`;
  } else {
    const wpn = w.content.weapon.get(w.rng.pick(got.weapons ?? []))!;
    c.weapon = wpn;
    c.ammo = wpn.ammo;
    label = `${wpn.meta.name.toUpperCase()} x${wpn.ammo}`;
  }
  return label;
}

export function fire(w: World, c: Car): void {
  const wpn = c.weapon;
  if (!wpn || c.ammo <= 0 || c.fireCd > 0 || c.wrecked) return;
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  c.fireCd = wpn.cooldown;
  c.ammo--;
  // what goes out the front leaves from just past the nose, and what goes out the back from just
  // past the tail, at whatever length and size the car is
  const fore = reach(c) + 3 * c.size;
  const aft = reach(c) + 3 * c.size;
  if (wpn.kind === 'rocket') {
    const r = {
      x: c.x + cs * fore,
      y: c.y + sn * fore,
      z: c.deck,
      h: c.h,
      v: (wpn.speed ?? 340) + Math.max(0, c.vf),
      owner: c.index,
      life: wpn.life ?? 2,
      def: wpn,
    };
    lockOn(w, r);
    w.rockets.push(r);
  } else if (wpn.kind === 'slick')
    spill(
      w,
      w.content.material.get(wpn.material!)!,
      c.x - cs * (aft + 2),
      c.y - sn * (aft + 2),
      wpn.radius ?? 12,
      c.index,
    );
  else if (wpn.kind === 'smoke' || wpn.kind === 'caltrops')
    drop(w, wpn, c.index, c.x - cs * (aft + 3), c.y - sn * (aft + 3), c.h);
  else if (wpn.kind === 'pulse') firePulse(w, c, wpn);
  else if (wpn.kind === 'howl') fireHowl(w, c, wpn);
  else if (isArsenal(wpn.kind)) fireArsenal(w, c, wpn);
  else if (isArms(wpn.kind)) fireArms(w, c, wpn);
  else
    w.mines.push({
      x: c.x - cs * aft,
      y: c.y - sn * aft,
      z: c.deck,
      owner: c.index,
      t: 0,
      def: wpn,
    });
  w.emit({ t: 'fire', car: c.index, weapon: wpn.id });
  if (c.ammo <= 0) c.weapon = null;
}

/**
 * The gun fires by itself when a rival is in the sights: the nearest running car within the gun's
 * range and a narrow cone off the nose. Rounds are few, so none are spent on an empty road. Most
 * rounds strike; a hit is a small blow where the round lands.
 */
/** How far car c's gun reaches and how wide its sights are (radians either side of its nose). */
export function gunSight(c: Car): [number, number] {
  const g = c.gun;
  if (!g) return [0, 0];
  return [(g.range ?? 110) * (barrelOf(c) > 1 ? 1.2 : 1), g.aim ?? 0.12];
}

/** Where a round leaves car c's gun: just past its nose, at bonnet height. */
export function muzzle(c: Car): [number, number, number] {
  const n = reach(c) + 0.5 * c.size;
  return [c.x + Math.cos(c.h) * n, c.y + Math.sin(c.h) * n, c.z + 4 * c.size];
}

/**
 * Is there solid scenery standing between (x, y) and (tx, ty)? A round does not go through a wall,
 * so a car behind one is not in the sights.
 */
function walled(w: World, x: number, y: number, tx: number, ty: number): boolean {
  const d = Math.hypot(tx - x, ty - y);
  const n = Math.ceil(d / 2);
  for (let i = 1; i < n; i++) {
    const px = x + ((tx - x) * i) / n;
    const py = y + ((ty - y) * i) / n;
    for (const s of w.near(px, py, 1))
      if (!s.down && s.def.solid && !s.def.mound && !s.def.pad) {
        if (propPoint(s.def, s.x, s.y, s.rot, px, py, AT, 3.5, 5) < 0.5) return true;
      }
  }
  return false;
}

const TARGET = newShape();

export function shoot(w: World, c: Car): void {
  const g = c.gun;
  c.gunCd -= DT;
  if (!g || c.rounds <= 0 || c.gunCd > 0) return;
  const fast = barrelOf(c);
  const [range, aim] = gunSight(c);
  const [x, y] = muzzle(c);
  let best: Car | null = null;
  let bd = range;
  for (const o of w.cars) {
    if (o === c || o.wrecked || o.invuln > 0 || o.z - o.deck > 10 || inSmoke(w, o.x, o.y)) continue;
    if (hidden(o)) continue;
    if (Math.abs(o.deck - c.deck) > 8) continue;
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (
      d < bd &&
      Math.abs(angDiff(Math.atan2(o.y - c.y, o.x - c.x), c.h)) < aim &&
      (c.z - c.deck > 10 || !walled(w, x, y, o.x, o.y))
    ) {
      bd = d;
      best = o;
    }
  }
  if (!best) return;
  c.rounds--;
  c.gunCd = g.cooldown / fast;
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  const hit = w.rng.next() < 0.8;
  const off = w.rng.range(-3, 3);
  let tx = c.x + cs * range - sn * off;
  let ty = c.y + sn * range + cs * off;
  if (hit) {
    // a hit lands on the target's own bodywork: the side of its hull that faces the gun, a
    // little to one side of its middle or the other (a miss flies on past it)
    const ux = (best.x - x) / (Math.hypot(best.x - x, best.y - y) || 1);
    const uy = (best.y - y) / (Math.hypot(best.x - x, best.y - y) || 1);
    const out = reach(best) * 2;
    const side = (off / 3) * hull(best) * 0.7;
    pointGap(
      carShape(best, TARGET),
      best.x - ux * out - uy * side,
      best.y - uy * out + ux * side,
      AT,
    );
    tx = AT.px;
    ty = AT.py;
  }
  w.emit({ t: 'shot', car: c.index, x, y, tx, ty, hit: hit ? best.index : -1 });
  if (!hit) return;
  // a mirrored car sends the round back where it came from
  const back = bounced(w, best, c, tx, ty, g.damage ?? 1.5);
  if (back) damage(w, c, back, best, x, y);
  else damage(w, best, g.damage ?? 1.5, c, tx, ty);
}

export function updateRockets(w: World): void {
  for (let i = w.rockets.length - 1; i >= 0; i--) {
    const r = w.rockets[i]!;
    r.life -= DT;
    r.age = (r.age ?? 0) + DT;
    // homing: chase the car it locked onto, or else lean towards a car in front
    // (a decoy that has its attention comes before anything else)
    const bait = lured(w, r);
    let best: { x: number; y: number } | null = bait ?? lockedOn(w, r);
    let bd = 160;
    if (!best)
      for (const c of w.cars) {
        if (c.index === r.owner || c.wrecked || Math.abs(c.deck - r.z) > 8 || hidden(c)) continue;
        const d = Math.hypot(c.x - r.x, c.y - r.y);
        if (d < bd && Math.abs(angDiff(Math.atan2(c.y - r.y, c.x - r.x), r.h)) < 0.5) {
          bd = d;
          best = c;
        }
      }
    const turn = (bait ? lureTurn(r) : (r.def.homing ?? 0)) * DT;
    if (best) r.h += clamp(angDiff(Math.atan2(best.y - r.y, best.x - r.x), r.h), -turn, turn);
    r.x += Math.cos(r.h) * r.v * DT;
    r.y += Math.sin(r.h) * r.v * DT;
    let hit = r.life <= 0 || (r.def.cluster !== undefined && r.age >= r.def.cluster.fuse);
    if (bait && lureHit(bait, r)) hit = true;
    const k = w.keepInside(r.x, r.y, 2);
    if (k[0] !== r.x || k[1] !== r.y) hit = true;
    // until it arms it flies through whatever it meets (bomblets leaving the burst)
    const armed = r.age >= (r.def.arm ?? 0);
    if (!hit && armed)
      hit = w.cars.some(
        (c) =>
          c.index !== r.owner &&
          // (chasing a decoy, it swerves past the car that threw it)
          c.index !== bait?.owner &&
          c.z - c.deck < 10 &&
          Math.abs(c.deck - r.z) < 8 &&
          Math.abs(c.x - r.x) < 40 &&
          carGap(c, r.x, r.y) < ROCKET_REACH,
      );
    // a rocket fired off a deck flies over what stands on the ground
    if (!hit && armed && r.z < 4)
      hit = w.near(r.x, r.y, 4).some(
        (s) =>
          !s.down &&
          s.def.solid &&
          // (and one on the ground goes over what a car in the air would clear)
          propGap(s.def, s.x, s.y, s.rot, r.x, r.y, ROCKET_HIGH - 1, ROCKET_HIGH + 1) <
            ROCKET_REACH - 1,
      );
    if (!hit && armed && r.z < 4)
      hit = w.props.some(
        (p) =>
          p.alive &&
          p.def.radius > 3 &&
          Math.abs(p.x - r.x) < 30 &&
          propGap(p.def, p.x, p.y, p.rot, r.x, r.y, ROCKET_HIGH - 1, ROCKET_HIGH + 1) <
            ROCKET_REACH - 1,
      );
    if (hit) {
      w.rockets.splice(i, 1);
      burst(w, r);
      explode(w, r.x, r.y, r.def.power, w.cars[r.owner]!, r.z);
    }
  }
}

export function updateMines(w: World): void {
  for (let i = w.mines.length - 1; i >= 0; i--) {
    const m = w.mines[i]!;
    m.t += DT;
    if (m.t < (m.def.arm ?? 0.7)) continue;
    const trig = m.def.trigger ?? MINE_TRIGGER;
    const victim = w.cars.find(
      (c) =>
        !c.wrecked &&
        !(c.index === m.owner && m.t < 2) &&
        c.z - c.deck <= 6 &&
        Math.abs(c.deck - m.z) < 4 &&
        Math.abs(c.x - m.x) < 40 &&
        carGap(c, m.x, m.y) < trig,
    );
    if (victim) {
      w.mines.splice(i, 1);
      explode(w, m.x, m.y, m.def.power, w.cars[m.owner]!, m.z);
    }
  }
  if (w.mines.length > 14) w.mines.splice(0, 1);
}

export { light };
