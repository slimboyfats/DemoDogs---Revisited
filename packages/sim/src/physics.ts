import { batter, footing } from './damage';
import {
  BASE_SPEED,
  CAR_OFFSET,
  CAR_RADIUS,
  DT,
  GRAVITY,
  TUNE_MAX,
  TUNE_STEP,
  type AiManifest,
  type CarManifest,
  type Controls,
} from '@demodogs/shared';
import type { Car, Setup } from './entities';
import { clamp } from './math';
import { breakProp, damage, light } from './damage';
import type { World } from './world';

export function makeCar(
  w: World,
  def: CarManifest,
  paint: string,
  name: string,
  isPlayer: boolean,
  ai: AiManifest | null,
  setup: Setup = {},
): Car {
  const behaviour = ai ? w.content.behaviours.get(ai.behaviour)! : null;
  const t = setup.tune ?? {};
  const lv = (n: number | undefined) => clamp(Math.floor(n ?? 0), 0, TUNE_MAX);
  const hp = clamp(setup.hp ?? 100, 1, 100);
  const gun = setup.weapon ? (w.content.weapon.get(setup.weapon.id) ?? null) : null;
  return {
    index: 0,
    def,
    stats: {
      speed: def.stats.speed * (1 + TUNE_STEP.speed * lv(t.engine)),
      accel: def.stats.accel * (1 + TUNE_STEP.accel * lv(t.engine)),
      grip: def.stats.grip * (1 + TUNE_STEP.grip * lv(t.tyres)),
      mass: def.stats.mass,
      armor: def.stats.armor * (1 + TUNE_STEP.armor * lv(t.armor)),
    },
    ram: setup.ram ?? 1,
    fuel: setup.fuel ?? 1,
    name,
    paint,
    isPlayer,
    seat: -1,
    ai:
      ai && behaviour
        ? {
            behaviour,
            lane: w.rng.range(-0.5, 0.5),
            phase: w.rng.range(0, 100),
            skill: setup.skill ?? w.rng.range(ai.skill[0], ai.skill[1]),
            aggro: w.rng.range(ai.aggro[0], ai.aggro[1]),
            stuckT: 0,
            revT: 0,
            boostT: 0,
            target: -1,
            targetT: 0,
          }
        : null,
    x: 0,
    y: 0,
    z: 0,
    vz: 0,
    h: 0,
    vx: 0,
    vy: 0,
    vf: 0,
    spin: 0,
    steer: 0,
    throttle: 0,
    boosting: false,
    handbrake: false,
    sliding: false,
    offroad: false,
    nitro: 1,
    hp,
    hp0: hp,
    roll: 0,
    lurch: 0,
    bounce: 0,
    wheelDist: 0,
    wrecked: false,
    wreckT: 0,
    wreckTick: 0,
    idx: 0,
    lap: 0,
    progress: 0,
    finished: false,
    finishTime: 0,
    wrongT: 0,
    score: 0,
    wrecks: 0,
    smashed: 0,
    weapon: gun,
    ammo: gun ? setup.weapon!.ammo : 0,
    invuln: 0,
    gun: w.gun,
    rounds: setup.rounds ?? w.gun?.ammo ?? 0,
    gunCd: 0,
    cash: 0,
    pit: false,
    fireCd: 0,
    hitCd: 0,
    scrapeCd: 0,
    has: { front: true, rear: true, top: true },
    aiSpeed: 1,
    smokeT: 0,
  };
}

/** The two hull circles of a car. */
export function circles(c: Car): [[number, number], [number, number]] {
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  return [
    [c.x + cs * CAR_OFFSET, c.y + sn * CAR_OFFSET],
    [c.x - cs * CAR_OFFSET, c.y - sn * CAR_OFFSET],
  ];
}

/** A world point in the car's frame: x forward, y to its right. */
export function toLocal(c: Car, x: number, y: number): [number, number] {
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  const dx = x - c.x;
  const dy = y - c.y;
  return [dx * cs + dy * sn, -dx * sn + dy * cs];
}

/**
 * One tick of driving. Steering turns the car; the speed it already has keeps going the way it was,
 * and grip pulls it round, so a car drifts when it turns hard or the handbrake is on.
 */
export function drive(w: World, c: Car, ctl: Controls): void {
  const S = c.stats;
  const off = w.offroad(c.x, c.y);
  const airborne = c.z > 0.6;
  c.offroad = off;
  let vf = c.vx * Math.cos(c.h) + c.vy * Math.sin(c.h);
  const weak = c.hp < 35 ? 0.86 : 1;
  const grip = clamp(Math.abs(vf) / 50, 0, 1);
  c.handbrake = ctl.brake && vf > 45 && Math.abs(ctl.steer) > 0.3;
  const [hold, bog, pit] = airborne ? [1, 0, false] : footing(w, c.x, c.y);
  // dropping into a crater at speed throws the car up off its far lip
  if (pit && !c.pit && Math.abs(vf) > 70) c.vz = Math.max(c.vz, Math.min(70, Math.abs(vf) * 0.3));
  if (!airborne) c.pit = pit;
  let turn =
    ctl.steer *
    3.0 *
    S.grip *
    grip *
    Math.sign(vf || 1) *
    (c.handbrake ? 1.4 : 1) *
    (0.45 + 0.55 * hold);
  if (c.hp < 30) turn += Math.sin(w.time * 9 + c.wheelDist * 0.05) * 0.25 * grip;
  if (airborne) turn *= 0.15;
  c.h += (turn + c.spin) * DT;
  c.spin *= Math.exp(-3.5 * DT);
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  vf = c.vx * cs + c.vy * sn;
  let vl = -c.vx * sn + c.vy * cs;
  const boost = ctl.boost && c.nitro > 0.02 && !airborne;
  c.boosting = boost;
  c.nitro = boost ? Math.max(0, c.nitro - 0.32 * DT) : Math.min(1, c.nitro + 0.025 * DT);
  const maxS =
    BASE_SPEED * S.speed * weak * (off ? 0.56 : 1) * (boost ? 1.33 * c.fuel : 1) * c.aiSpeed;
  const before = vf;
  if (!airborne) {
    if (ctl.brake) {
      if (vf > 15) vf -= 330 * DT;
      else vf = Math.max(-72, vf - 150 * DT);
    } else if (ctl.throttle > 0 && vf < maxS) {
      const acc = 240 * S.accel * (boost ? 1.8 : 1);
      vf += acc * ctl.throttle * DT * clamp(1.05 - vf / (maxS * 1.1), 0.12, 1);
    }
    vf -= vf * ((off ? 1.4 : 0.42) + bog) * DT;
    if (vf > maxS) vf -= (vf - maxS) * 2.6 * DT;
    vl *= Math.exp(-8 * S.grip * hold * (off ? 0.55 : 1) * (c.handbrake ? 0.22 : 1) * DT);
  }
  c.vx = cs * vf - sn * vl;
  c.vy = sn * vf + cs * vl;
  c.vf = vf;
  c.x += c.vx * DT;
  c.y += c.vy * DT;
  if (c.z > 0 || c.vz !== 0) {
    c.vz -= GRAVITY * DT;
    c.z += c.vz * DT;
    if (c.z <= 0) {
      c.z = 0;
      if (c.vz < -90) {
        w.emit({ t: 'land', car: c.index, impact: -c.vz });
        c.vz = -c.vz * 0.3;
      } else c.vz = 0;
    }
  }
  // the stack's animation: lean in corners, squat under power, dive on the brakes, rattle off-road
  const lat = vf * turn * 0.0045 - vl * 0.012;
  c.roll += (clamp(lat, -1.6, 1.6) - c.roll) * Math.min(1, 9 * DT);
  c.lurch += (clamp(((vf - before) / DT) * -0.004, -1.2, 1.2) - c.lurch) * Math.min(1, 8 * DT);
  c.bounce =
    off && Math.abs(vf) > 30
      ? w.rng.next() < 0.3
        ? w.rng.range(0, 0.8)
        : c.bounce * 0.7
      : c.bounce * 0.8;
  c.wheelDist += vf * DT;
  c.steer += (ctl.steer - c.steer) * Math.min(1, 12 * DT);
  c.throttle = ctl.throttle;
  c.sliding =
    !airborne &&
    !c.wrecked &&
    (Math.abs(vl) > 38 || c.handbrake || (boost && vf < 70) || (ctl.brake && vf > 60));
}

/** A car against something that does not move, along normal (nx, ny) by depth. */
function bump(
  w: World,
  c: Car,
  px: number,
  py: number,
  nx: number,
  ny: number,
  depth: number,
  hard: number,
): void {
  c.x += nx * depth;
  c.y += ny * depth;
  const vn = c.vx * nx + c.vy * ny;
  if (vn >= 0) return;
  c.vx -= 1.35 * vn * nx;
  c.vy -= 1.35 * vn * ny;
  const L = toLocal(c, px, py);
  c.spin += clamp(L[1] * vn * 0.004 * Math.sign(L[0] || 1), -4, 4);
  const impact = -vn;
  if (impact > 30) {
    if (c.hitCd <= 0) {
      c.hitCd = 0.15;
      damage(w, c, (impact - 28) * 0.24 * hard, null, px, py);
      w.emit({ t: 'crash', x: px, y: py, impact: impact * 0.5, player: c === w.player });
    }
  } else if (impact > 8 && c.scrapeCd <= 0) {
    c.scrapeCd = 0.12;
    w.emit({ t: 'scrape', x: px, y: py, player: c === w.player });
  }
}

export function collideWorld(w: World, c: Car): void {
  const R = CAR_RADIUS;
  for (const p of circles(c)) {
    const O = w.oval;
    if (!O) {
      if (p[0] < 10 + R) bump(w, c, p[0] - R, p[1], 1, 0, 10 + R - p[0], 1);
      if (p[0] > w.w - 10 - R) bump(w, c, p[0] + R, p[1], -1, 0, p[0] - (w.w - 10 - R), 1);
      if (p[1] < 10 + R) bump(w, c, p[0], p[1] - R, 0, 1, 10 + R - p[1], 1);
      if (p[1] > w.h - 10 - R) bump(w, c, p[0], p[1] + R, 0, -1, p[1] - (w.h - 10 - R), 1);
    } else {
      const ex = (p[0] - O.cx) / O.rx;
      const ey = (p[1] - O.cy) / O.ry;
      const q = Math.hypot(ex, ey);
      const lim = 1 - R / ((O.rx + O.ry) / 2);
      if (q > lim) {
        let nx = -ex / O.rx;
        let ny = -ey / O.ry;
        const nl = Math.hypot(nx, ny);
        nx /= nl;
        ny /= nl;
        bump(w, c, p[0] - nx * R, p[1] - ny * R, nx, ny, ((q - lim) * (O.rx + O.ry)) / 2, 1.1);
      }
    }
  }
  for (const s of w.near(c.x, c.y, 20)) {
    const r = s.def.radius;
    if (s.down || !s.def.solid || Math.abs(s.x - c.x) > r + 16 || Math.abs(s.y - c.y) > r + 16)
      continue;
    for (const p of circles(c)) {
      const dx = p[0] - s.x;
      const dy = p[1] - s.y;
      const d = Math.hypot(dx, dy);
      const m = r + R;
      if (d >= m || d <= 0.001) continue;
      // a hard enough ram knocks pieces off it, and may bring it down: then the car ploughs
      // on through, slower, instead of bouncing off
      const vn = -(c.vx * dx + c.vy * dy) / d;
      const px = s.x + (dx / d) * r;
      const py = s.y + (dy / d) * r;
      if (
        vn > 22 + 23 * s.def.hardness &&
        c.z < 6 &&
        batter(w, s, (vn - 35) * 0.5 * c.def.stats.mass, 'impact', px, py)
      ) {
        c.vx *= 0.72;
        c.vy *= 0.72;
        damage(w, c, (vn - 28) * 0.1 * s.def.hardness, null, px, py);
        w.emit({ t: 'crash', x: px, y: py, impact: vn * 0.5, player: c === w.player });
        break;
      }
      bump(w, c, px, py, dx / d, dy / d, m - d, s.def.hardness);
    }
  }
}

/** Damage multiplier by where a car was hit: the front is its ram, a door is soft. */
export function zoneFactor(lx: number): number {
  return lx > 6 ? 0.45 : Math.abs(lx) < 5 ? 1.35 : 0.9;
}

export function collideCars(w: World, a: Car, b: Car): void {
  if (Math.abs(a.x - b.x) > 30 || Math.abs(a.y - b.y) > 30 || Math.abs(a.z - b.z) > 10) return;
  const R = CAR_RADIUS;
  let best: { px: number; py: number; ov: number; nx: number; ny: number } | null = null;
  for (const p of circles(a))
    for (const q of circles(b)) {
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const d = Math.hypot(dx, dy);
      const ov = R * 2 - d;
      if (ov > 0 && (!best || ov > best.ov)) {
        const nx = d > 0.001 ? dx / d : 1;
        const ny = d > 0.001 ? dy / d : 0;
        best = { px: p[0] + nx * R, py: p[1] + ny * R, ov, nx, ny };
      }
    }
  if (!best) return;
  const ma = a.stats.mass * (a.wrecked ? 1.6 : 1);
  const mb = b.stats.mass * (b.wrecked ? 1.6 : 1);
  const tot = ma + mb;
  a.x -= (best.nx * best.ov * mb) / tot;
  a.y -= (best.ny * best.ov * mb) / tot;
  b.x += (best.nx * best.ov * ma) / tot;
  b.y += (best.ny * best.ov * ma) / tot;
  const vrel = (b.vx - a.vx) * best.nx + (b.vy - a.vy) * best.ny;
  if (vrel >= 0) return;
  const j = (-(1 + 0.32) * vrel) / (1 / ma + 1 / mb);
  a.vx -= (j / ma) * best.nx;
  a.vy -= (j / ma) * best.ny;
  b.vx += (j / mb) * best.nx;
  b.vy += (j / mb) * best.ny;
  // a hit off the centre line turns the car
  const ra = toLocal(a, best.px, best.py);
  const rb = toLocal(b, best.px, best.py);
  a.spin += clamp(((-ra[1] * j * 0.0016) / ma) * Math.sign(ra[0] + 0.01), -5, 5);
  b.spin += clamp(((rb[1] * j * 0.0016) / mb) * Math.sign(rb[0] + 0.01), -5, 5);
  const impact = -vrel;
  // `player` is only what the events say (the screen's own car); the rules use isPlayer
  const player = a === w.player || b === w.player;
  if (impact < 20) {
    if (impact > 8 && (a.isPlayer || b.isPlayer) && a.scrapeCd <= 0) {
      a.scrapeCd = 0.1;
      w.emit({ t: 'scrape', x: best.px, y: best.py, player });
    }
    return;
  }
  const base = (impact - 20) * 0.28;
  // a pinned pair keeps touching: only the first knock of a shove does damage
  const fresh = a.hitCd <= 0 && b.hitCd <= 0;
  a.hitCd = b.hitCd = 0.3;
  if (fresh) {
    damage(w, a, ((base * zoneFactor(ra[0]) * mb) / 1.1) * b.ram, b, best.px, best.py);
    damage(w, b, ((base * zoneFactor(rb[0]) * ma) / 1.1) * a.ram, a, best.px, best.py);
  }
  if (w.kind === 'derby' && impact > 60) {
    if (a.ai) a.ai.revT = w.rng.range(0.3, 0.7);
    if (b.ai) b.ai.revT = w.rng.range(0.3, 0.7);
  }
  w.emit({ t: 'crash', x: best.px, y: best.py, impact, player });
}

export function collideProps(w: World, c: Car): void {
  for (const p of w.props) {
    if (!p.alive || p.z > 10 || Math.abs(p.x - c.x) > 22 || Math.abs(p.y - c.y) > 22) continue;
    const pr = p.def.radius;
    const pm = p.def.mass ?? 0.5;
    for (const q of circles(c)) {
      const dx = p.x - q[0];
      const dy = p.y - q[1];
      const d = Math.hypot(dx, dy);
      const m = pr + CAR_RADIUS;
      if (d >= m || d < 0.001) continue;
      const nx = dx / d;
      const ny = dy / d;
      p.x += nx * (m - d);
      p.y += ny * (m - d);
      const vrel = (p.vx - c.vx) * nx + (p.vy - c.vy) * ny;
      if (vrel >= 0) continue;
      const mc = c.stats.mass * 3;
      const j = (-1.5 * vrel) / (1 / mc + 1 / pm);
      p.vx += (j / pm) * nx;
      p.vy += (j / pm) * ny;
      c.vx -= (j / mc) * nx;
      c.vy -= (j / mc) * ny;
      const impact = -vrel;
      p.spin += w.rng.range(-1, 1) * impact * 0.15;
      if (p.def.breaksAt !== undefined && impact > p.def.breaksAt) {
        breakProp(w, p, c);
        break;
      }
      if (p.def.explodesAt !== undefined && impact > p.def.explodesAt) light(p, c.index, 0.05);
      p.vz = Math.max(p.vz, impact * p.def.launch);
      if (impact > 40) w.emit({ t: 'scrape', x: p.x, y: p.y, player: c === w.player });
    }
  }
}
