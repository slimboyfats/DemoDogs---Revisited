import { DT, GRAVITY, type BotManifest } from '@demodogs/shared';
import type { Bot, Car } from './entities';
import { TAU, angDiff, clamp } from './math';
import { airburst, damage, explode, launch, light } from './damage';
import type { World } from './world';

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
  for (const s of w.statics) {
    const r = s.def.radius;
    if (!s.def.solid || Math.abs(s.x - nx) > r + 4 || Math.abs(s.y - ny) > r + 4) continue;
    const d = Math.hypot(nx - s.x, ny - s.y) || 1;
    if (d < r + 3.5) {
      nx = s.x + ((nx - s.x) / d) * (r + 3.5);
      ny = s.y + ((ny - s.y) / d) * (r + 3.5);
      [b.tx, b.ty] = botSpot(w, false);
    }
  }
  [b.x, b.y] = w.keepInside(nx, ny, 5);
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

export function updateProps(w: World): void {
  for (const p of w.props) {
    if (!p.alive) continue;
    if (p.fuse > 0) {
      p.fuse -= DT;
      if (p.fuse <= 0) {
        if (p.def.rocket) launch(w, p);
        else {
          p.alive = false;
          explode(w, p.x, p.y, p.def.blast ?? 1, p.owner >= 0 ? w.cars[p.owner]! : null);
          continue;
        }
      }
    }
    if (p.flying) {
      // a burst drum climbs on its own fire, and blows apart at the top or on whatever it hits
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      p.rot += p.spin * DT;
      p.vz -= GRAVITY * 0.55 * DT;
      p.z += p.vz * DT;
      const k = w.keepInside(p.x, p.y, p.def.radius);
      if (p.vz <= 0 || p.z <= 0 || k[0] !== p.x || k[1] !== p.y) airburst(w, p);
      continue;
    }
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    p.rot += p.spin * DT;
    if (p.z > 0 || p.vz) {
      p.vz -= GRAVITY * 0.95 * DT;
      p.z += p.vz * DT;
      if (p.z <= 0) {
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
    const k = w.keepInside(p.x, p.y, p.def.radius);
    if (k[0] !== p.x || k[1] !== p.y) {
      [p.x, p.y] = k;
      p.vx *= -0.4;
      p.vy *= -0.4;
    }
    for (const s of w.statics) {
      if (!s.def.solid) continue;
      const m = s.def.radius + p.def.radius;
      if (Math.abs(s.x - p.x) > m || Math.abs(s.y - p.y) > m) continue;
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < m) {
        p.x = s.x + (dx / d) * m;
        p.y = s.y + (dy / d) * m;
        p.vx *= -0.4;
        p.vy *= -0.4;
      }
    }
  }
}

// ---------------------------------------------------------------- pickups and weapons

export function updatePickups(w: World): void {
  const kinds = w.venue.pickups.map((id) => w.content.pickup.get(id)!);
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
      if (c.wrecked || Math.hypot(c.x - p.x, c.y - p.y) > 13) continue;
      p.on = false;
      p.t = 0;
      const hurt = c.hp < 70;
      const total = kinds.reduce((s, k) => s + (hurt ? k.hurtWeight : k.weight), 0);
      let roll = w.rng.next() * total;
      let got = kinds[kinds.length - 1]!;
      for (const k of kinds) {
        roll -= hurt ? k.hurtWeight : k.weight;
        if (roll < 0) {
          got = k;
          break;
        }
      }
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
      w.emit({ t: 'pickup', car: c.index, x: p.x, y: p.y, label, kind: got.kind });
      break;
    }
  }
}

export function fire(w: World, c: Car): void {
  const wpn = c.weapon;
  if (!wpn || c.ammo <= 0 || c.fireCd > 0 || c.wrecked) return;
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  c.fireCd = wpn.cooldown;
  c.ammo--;
  if (wpn.kind === 'rocket')
    w.rockets.push({
      x: c.x + cs * 15,
      y: c.y + sn * 15,
      h: c.h,
      v: (wpn.speed ?? 340) + Math.max(0, c.vf),
      owner: c.index,
      life: wpn.life ?? 2,
      def: wpn,
    });
  else w.mines.push({ x: c.x - cs * 15, y: c.y - sn * 15, owner: c.index, t: 0, def: wpn });
  w.emit({ t: 'fire', car: c.index, weapon: wpn.id });
  if (c.ammo <= 0) c.weapon = null;
}

/**
 * The gun fires by itself when a rival is in the sights: the nearest running car within the gun's
 * range and a narrow cone off the nose. Rounds are few, so none are spent on an empty road. Most
 * rounds strike; a hit is a small blow where the round lands.
 */
export function shoot(w: World, c: Car): void {
  const g = c.gun;
  c.gunCd -= DT;
  if (!g || c.rounds <= 0 || c.gunCd > 0) return;
  const range = g.range ?? 110;
  const aim = g.aim ?? 0.12;
  let best: Car | null = null;
  let bd = range;
  for (const o of w.cars) {
    if (o === c || o.wrecked || o.invuln > 0 || o.z > 10) continue;
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (d < bd && Math.abs(angDiff(Math.atan2(o.y - c.y, o.x - c.x), c.h)) < aim) {
      bd = d;
      best = o;
    }
  }
  if (!best) return;
  c.rounds--;
  c.gunCd = g.cooldown;
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  const x = c.x + cs * (c.def.body.halfLength + 1);
  const y = c.y + sn * (c.def.body.halfLength + 1);
  const hit = w.rng.next() < 0.8;
  // a hit lands on the near side of the target, a miss flies on past it
  const off = w.rng.range(-3, 3);
  const reach = hit ? bd - 5 : range;
  const tx = c.x + cs * reach - sn * off;
  const ty = c.y + sn * reach + cs * off;
  w.emit({ t: 'shot', car: c.index, x, y, tx, ty, hit: hit ? best.index : -1 });
  if (hit) damage(w, best, g.damage ?? 1.5, c, tx, ty);
}

export function updateRockets(w: World): void {
  for (let i = w.rockets.length - 1; i >= 0; i--) {
    const r = w.rockets[i]!;
    r.life -= DT;
    // homing: lean towards a car in front
    let best: Car | null = null;
    let bd = 160;
    for (const c of w.cars) {
      if (c.index === r.owner || c.wrecked) continue;
      const d = Math.hypot(c.x - r.x, c.y - r.y);
      if (d < bd && Math.abs(angDiff(Math.atan2(c.y - r.y, c.x - r.x), r.h)) < 0.5) {
        bd = d;
        best = c;
      }
    }
    const turn = (r.def.homing ?? 0) * DT;
    if (best) r.h += clamp(angDiff(Math.atan2(best.y - r.y, best.x - r.x), r.h), -turn, turn);
    r.x += Math.cos(r.h) * r.v * DT;
    r.y += Math.sin(r.h) * r.v * DT;
    let hit = r.life <= 0;
    const k = w.keepInside(r.x, r.y, 2);
    if (k[0] !== r.x || k[1] !== r.y) hit = true;
    if (!hit)
      hit = w.cars.some(
        (c) => c.index !== r.owner && c.z < 10 && Math.hypot(c.x - r.x, c.y - r.y) < 10,
      );
    if (!hit)
      hit = w.statics.some(
        (s) => s.def.solid && Math.hypot(s.x - r.x, s.y - r.y) < s.def.radius + 2,
      );
    if (!hit)
      hit = w.props.some(
        (p) => p.alive && p.def.radius > 3 && Math.hypot(p.x - r.x, p.y - r.y) < p.def.radius + 2,
      );
    if (hit) {
      w.rockets.splice(i, 1);
      explode(w, r.x, r.y, r.def.power, w.cars[r.owner]!);
    }
  }
}

export function updateMines(w: World): void {
  for (let i = w.mines.length - 1; i >= 0; i--) {
    const m = w.mines[i]!;
    m.t += DT;
    if (m.t < (m.def.arm ?? 0.7)) continue;
    const trig = m.def.trigger ?? 11;
    const victim = w.cars.find(
      (c) =>
        !c.wrecked &&
        !(c.index === m.owner && m.t < 2) &&
        c.z <= 6 &&
        Math.hypot(c.x - m.x, c.y - m.y) < trig,
    );
    if (victim) {
      w.mines.splice(i, 1);
      explode(w, m.x, m.y, m.def.power, w.cars[m.owner]!);
    }
  }
  if (w.mines.length > 14) w.mines.splice(0, 1);
}

export { light };
