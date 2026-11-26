import { batter, footing } from './damage';
import {
  BASE_SPEED,
  DT,
  GRAVITY,
  HELD,
  TUNE_MAX,
  TUNE_STEP,
  type AiManifest,
  type CarManifest,
  type Controls,
} from '@demodogs/shared';
import { draft, fitAddon, gearGuard, grind, jetOf, ramOf, roughOf, tankOf } from './addons';
import type { Car, Setup, StaticProp } from './entities';
import { clamp } from './math';
import { breakProp, damage, light } from './damage';
import { dugIn, padded } from './guards';
import { flatten } from './catchup';
import { crest, groundAt, moundAt } from './mounds';
import { pathAt, wobbleAt } from './pads';
import type { World } from './world';
import { pace } from './modifiers';
import {
  bound,
  CAR_HIGH,
  carGap,
  carShape,
  extent,
  hull,
  pointGap,
  newShape,
  newTouch,
  propTouch,
  reach,
  shapeGap,
  type Shape,
} from './shapes';

export { circles, hull } from './shapes';

/** What `footing` gives for firm, dry ground. */
const FIRM: readonly [number, number, boolean] = [1, 0, false];

/** Ground steeper than this (height per px) is a face: a car on the ground cannot drive up it. */
export const CLIFF = 1.1;
/** Ground that falls away faster than this in a tick leaves the car in the air. */
const DROP = 2;
/** A shape in the road that steps up more than this in one tick's travel has a sheer side (px). */
const LIP = 3;
/** How hard a car on the side of a raised road is pulled down off it, px a second squared. */
const SLIDE = 420;
/** A car that goes further than this in a tick has the way looked at in steps this long (px). */
const STRIDE = 4;

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
  const c: Car = {
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
            skill: 1,
            aggro: 0,
            stuckT: 0,
            revT: 0,
            boostT: 0,
            target: -1,
            targetT: 0,
            style: '',
            traits: { nerve: 0.5, greed: 0.5, block: 0.3, trigger: 0.5, wobble: 0.3 },
            side: 0,
            want: 0,
            block: Infinity,
            heldT: 0,
            aimT: 0,
            tries: 0,
            freeT: 0,
            jamT: 0,
          }
        : null,
    x: 0,
    y: 0,
    z: 0,
    vz: 0,
    surge: 0,
    surgeK: 1,
    pad: -1,
    deck: 0,
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
    held: 0,
    nitro: 1,
    hp,
    hp0: hp,
    roll: 0,
    lurch: 0,
    pitch: 0,
    pitchV: 0,
    bank: 0,
    bankV: 0,
    climb: 0,
    hole: -1,
    bounce: 0,
    wheelDist: 0,
    sway: 0,
    wrecked: false,
    wreckT: 0,
    downT: 0,
    onIdx: 0,
    onLap: 0,
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
    shield: 0,
    shieldMax: 0,
    shieldT: 0,
    weldRate: 0,
    weldT: 0,
    gun: w.gun,
    rounds: setup.rounds ?? w.gun?.ammo ?? 0,
    gunCd: 0,
    cash: 0,
    pit: false,
    fireCd: 0,
    hitCd: 0,
    scrapeCd: 0,
    has: { front: true, rear: true, top: true },
    lamps: 0,
    aiSpeed: 1,
    smokeT: 0,
    blade: null,
    springs: null,
    hop: -1,
    guards: {},
    size: 1,
    pace: 1,
    squashT: 0,
    morph: null,
    wind: null,
    collar: null,
    fit: {},
    draft: false,
    tricks: {},
  };
  if (c.ai && ai) character(w, c, ai, setup.skill);
  for (const id of setup.fit ?? []) {
    const def = w.content.pickup.get(id);
    if (def) fitAddon(w, c, def, true);
  }
  return c;
}

/**
 * Who is driving: the kind of driver that lists the car's name, or one picked by its name, and the
 * skill and aggression rolled for it. How hard the race is set (`world.level`) moves the skill.
 */
function character(w: World, c: Car, ai: AiManifest, skill?: number): void {
  const A = c.ai!;
  const styles = ai.styles ?? [];
  // (the same driver is the same kind in every race: by name, not by lot)
  let h = 0;
  for (let i = 0; i < c.name.length; i++) h = (h * 31 + c.name.charCodeAt(i)) >>> 0;
  const style =
    styles.find((s) => s.drivers.includes(c.name)) ??
    (styles.length ? styles[h % styles.length]! : null);
  const aggro = style?.aggro ?? ai.aggro;
  A.skill = (skill ?? w.rng.range(ai.skill[0], ai.skill[1])) + (style?.pace ?? 0) + w.level.pace;
  A.aggro = w.rng.range(aggro[0], aggro[1]);
  if (!style) return;
  A.style = style.name;
  A.traits = {
    nerve: style.nerve,
    greed: style.greed,
    block: style.block,
    trigger: style.trigger,
    wobble: style.wobble,
  };
}

/** What a car weighs in a collision: its mass, by its size squared; more as a wreck or in a lead collar. */
export function heft(c: Car): number {
  return c.stats.mass * c.size * c.size * (c.wrecked ? 1.6 : 1) * (c.collar ? 1.5 : 1);
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
  const T = w.tuning;
  // a lit rocket bottle drives the car: flat out, no brakes, and it turns like a barge
  const jet = jetOf(c);
  if (jet > 1) ctl = { ...ctl, throttle: 1, brake: false, steer: ctl.steer * 0.6 };
  // knobbly tyres pay only part of what rough ground and slicks cost
  const rough = roughOf(c);
  // how far onto the rough it is: the road's edge is not a wall of mud, the cost comes in over
  // the first few px past it, and only as much as the tyres pay for it
  const harsh = w.offness(c.x, c.y) * rough;
  const wake = draft(w, c);
  const floor = (c.deck = w.support(c));
  // climbing a ramp: the deck lifts the car with it
  if (floor > 0 && c.z < floor) {
    c.z = floor;
    c.vz = Math.max(0, c.vz);
  }
  const airborne = c.z - floor > 0.6;
  c.offroad = off;
  let vf = c.vx * Math.cos(c.h) + c.vy * Math.sin(c.h);
  const weak = c.hp < 35 ? 0.86 : 1;
  const grip = clamp(Math.abs(vf) / 50, 0, 1);
  c.handbrake = ctl.brake && vf > 45 && Math.abs(ctl.steer) > 0.3;
  // the deck is clean: pools and pits are on the ground below it
  // (and so is a boardwalk: what it crosses is under its planks)
  const foot =
    airborne ||
    floor > 0 ||
    (w.craters.length === 0 && w.spills.length === 0) ||
    (!off && w.paths.length && pathAt(w, c.x, c.y))
      ? FIRM
      : footing(w, c.x, c.y);
  let dry: number = 1 - (1 - foot[0]) * rough;
  let bog: number = foot[1] * rough;
  const pit = foot[2];
  // a stretch of road with a surface of its own (dirt, ice, sand) grips and drags like it
  const surface = w.roadSurface && !off && !airborne && floor <= 0 ? w.roadSurface[c.idx] : null;
  if (surface) {
    dry = Math.min(dry, 1 - (1 - surface.grip) * rough);
    bog = Math.max(bog, surface.drag * T.softRoad * rough);
  }
  // rain takes grip everywhere, the deck included
  const hold = dry * w.grip;
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
  // loose boards under the wheels wag the car from side to side as it goes over them (and
  // let it straighten as it leaves them)
  const loose = airborne || floor > 0 ? 0 : wobbleAt(w, c.x, c.y);
  if (loose > 0 || c.sway !== 0) {
    const to =
      (Math.sin(c.wheelDist * 0.034 + c.index * 1.7) * 0.13 +
        Math.sin(c.wheelDist * 0.107 + c.index) * 0.04) *
      loose *
      grip;
    const by = clamp(to - c.sway, -0.03, 0.03);
    c.sway += by;
    c.h += by;
  }
  if (airborne) turn *= 0.15;
  c.h += (turn + c.spin) * DT;
  c.spin *= Math.exp(-3.5 * DT);
  const cs = Math.cos(c.h);
  const sn = Math.sin(c.h);
  vf = c.vx * cs + c.vy * sn;
  let vl = -c.vx * sn + c.vy * cs;
  const boost = ctl.boost && c.nitro > 0.02 && !airborne;
  c.boosting = boost;
  const tank = tankOf(c);
  c.nitro = boost
    ? Math.max(0, c.nitro - (0.32 * DT) / tank)
    : Math.min(1, c.nitro + 0.025 * DT * tank);
  const maxS =
    BASE_SPEED *
    S.speed *
    weak *
    (1 - (1 - T.offroadPace) * harsh) *
    (boost ? 1.33 * c.fuel : 1) *
    c.aiSpeed *
    c.pace *
    (c.surge > 0 ? c.surgeK : 1) *
    pace(w, c) *
    jet *
    wake;
  const before = vf;
  if (!airborne) {
    if (ctl.brake) {
      if (vf > 15) vf -= 330 * DT;
      else vf = Math.max(-72, vf - 150 * DT);
    } else if (ctl.throttle > 0 && vf < maxS) {
      const acc =
        240 *
        S.accel *
        (boost || c.surge > 0 ? 1.8 : 1) *
        Math.max(1, c.pace) *
        (jet > 1 ? 3 : 1) *
        (wake > 1 ? 1.3 : 1);
      vf += acc * ctl.throttle * DT * clamp(1.05 - vf / (maxS * 1.1), 0.12, 1);
    }
    vf -= vf * (0.42 + T.offroadDrag * harsh + bog) * DT;
    if (vf > maxS) vf -= (vf - maxS) * 2.6 * DT;
    vl *= Math.exp(-8 * S.grip * hold * (1 - 0.45 * harsh) * (c.handbrake ? 0.22 : 1) * DT);
  }
  c.vx = cs * vf - sn * vl;
  c.vy = sn * vf + cs * vl;
  // the lie of the land: a car on a slope is pulled down it (uphill is slower, downhill faster,
  // and a steep bank throws it back)
  const land = floor <= 0 ? w.relief : null;
  let uphill = 0;
  if (land && !airborne) {
    // (a terrace's face is not a slope to roll down: only the hills pull)
    const gx = clamp(land.dx(c.x, c.y), -0.5, 0.5);
    const gy = clamp(land.dy(c.x, c.y), -0.5, 0.5);
    c.vx -= gx * T.hillPull * DT;
    c.vy -= gy * T.hillPull * DT;
    if (land.plat) {
      // the side of a raised road is no place to stand: a car that has come down on it (driven
      // slowly off the top, or dropped there out of the air) slides off it to the ground
      const sx = (land.platAt(c.x + 2, c.y) - land.platAt(c.x - 2, c.y)) / 4;
      const sy = (land.platAt(c.x, c.y + 2) - land.platAt(c.x, c.y - 2)) / 4;
      const steep = Math.hypot(sx, sy);
      if (steep > CLIFF) {
        c.vx -= (sx / steep) * SLIDE * DT;
        c.vy -= (sy / steep) * SLIDE * DT;
      }
    }
    vf = c.vx * cs + c.vy * sn;
    uphill = (gx * cs + gy * sn) * Math.sign(vf || 1);
  }
  // what is holding it back, for the HUD to say
  c.held = airborne
    ? 0
    : (harsh > 0.2 && T.offroadPace < 1 ? HELD.rough : 0) |
      // (a climb is named once it costs something: a pull of 20 px/s² is about a tenth off)
      (uphill * T.hillPull > 20 ? HELD.hill : 0) |
      (bog > 0.3 ? HELD.sticky : 0) |
      (weak < 1 ? HELD.hurt : 0) |
      (c.pace < 1 ? HELD.weighed : 0);
  c.vf = vf;
  const x0 = c.x;
  const y0 = c.y;
  c.x += c.vx * DT;
  c.y += c.vy * DT;
  if ((land || w.mounds.length) && floor <= 0) {
    // the ground the car has come to: higher, lower, or a face it cannot climb
    const rise = groundAt(w, c.x, c.y) - groundAt(w, x0, y0);
    // (its middle, and the end or side of it that leads: a car stops with its nose at a face,
    // not half way into it)
    const v = Math.hypot(c.vx, c.vy);
    const f = v > 1 ? (c.vx * cs + c.vy * sn) / v : 0;
    const l = v > 1 ? (-c.vx * sn + c.vy * cs) / v : 0;
    const L = c.def.body.halfLength * c.size;
    const W = c.def.body.halfWidth * c.size;
    const lx = cs * f * L - sn * l * W;
    const ly = sn * f * L + cs * l * W;
    const face =
      faced(w, c, land, x0, y0, c.x, c.y) ??
      (v > 1 ? faced(w, c, land, x0 + lx, y0 + ly, c.x + lx, c.y + ly) : null) ??
      (land?.plat && c.z < 2 ? walled(land, x0, y0, c.x, c.y) : null);
    if (face) {
      c.x = x0;
      c.y = y0;
      c.climb = 0;
      bump(w, c, x0 - face[0] * 6, y0 - face[1] * 6, face[0], face[1], 0, 0.6);
    } else if (rise < -DROP) {
      // off the edge of a terrace: the car is in the air as high as the ground fell away
      c.z -= rise;
      c.climb = 0;
    } else if (c.z > 0) {
      c.z = Math.max(0, c.z - rise);
      c.climb = 0;
    } else crest(w, c);
  } else c.climb = 0;
  if (floor > 0 && c.vz <= 0 && c.z - floor < 1.5) {
    // running down a ramp keeps the wheels on it
    c.z = floor;
    c.vz = 0;
  } else if (c.z > floor || c.vz !== 0) {
    c.vz -= GRAVITY * w.gravity * DT;
    c.z += c.vz * DT;
    if (c.z <= floor) {
      c.z = floor;
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

/**
 * Whether a point of car c going from (ax, ay) to (bx, by) has come to a face it cannot climb:
 * a terrace, the side of a raised road, or the sheer side of a shape in the road (the lip of a
 * ramp come at from behind). The way back out of it, or null.
 */
function faced(
  w: World,
  c: Car,
  land: World['relief'],
  ax: number,
  ay: number,
  bx: number,
  by: number,
): [number, number] | null {
  if (land) {
    const rise = land.at(bx, by) - land.at(ax, ay);
    if (rise > 0) {
      const [ex, ey] = land.edge(bx, by);
      const steep = Math.hypot(ex, ey);
      // (the side of a raised road is a wall to anything that would not be well clear of it
      // there: there is no crawling up it and no coming down on it from a hop, the way up is
      // the ramp)
      const wall = land.plat && c.z - rise < 2 && land.platAt(bx, by) > land.platAt(ax, ay);
      if (steep > CLIFF && (wall || c.z < rise - 1)) return [-ex / steep, -ey / steep];
    }
  }
  if (w.mounds.length) {
    const step = moundAt(w, bx, by) - moundAt(w, ax, ay);
    const d = Math.hypot(bx - ax, by - ay);
    if (step > LIP && c.z < step - 1 && d > 0) return [(ax - bx) / d, (ay - by) / d];
  }
  return null;
}

/**
 * Whether the way from (ax, ay) to (bx, by) goes up through the side of a raised road. The side
 * is only a few px through, and a car fast enough (lit rocket, boost tile, a blast behind it)
 * goes further than that in a tick: looking only at where it ends up would let it through. The
 * way back out of the wall, or null. (For a car on the ground: `faced` has looked at the end.)
 */
function walled(
  land: NonNullable<World['relief']>,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): [number, number] | null {
  const d = Math.hypot(bx - ax, by - ay);
  if (d <= STRIDE) return null;
  const n = Math.ceil(d / STRIDE);
  let low = land.platAt(ax, ay);
  for (let k = 1; k < n; k++) {
    const x = ax + ((bx - ax) * k) / n;
    const y = ay + ((by - ay) * k) / n;
    const p = land.platAt(x, y);
    if (p > low) {
      const [ex, ey] = land.edge(x, y);
      const steep = Math.hypot(ex, ey);
      if (steep > CLIFF) return [-ex / steep, -ey / steep];
    }
    low = p;
  }
  return null;
}

/**
 * After the tick's collisions: a car on the ground that another car, or what it bounced off, has
 * pushed up into the side of a raised road goes back to (x, y), where its own driving left it.
 * The side is a wall to a shove as much as to an engine.
 */
export function hemmed(w: World, c: Car, x: number, y: number): void {
  const land = w.relief;
  if (!land?.plat || c.deck > 0 || (c.x === x && c.y === y)) return;
  const rise = land.platAt(c.x, c.y) - land.platAt(x, y);
  if (rise <= 0 || c.z - rise >= 2) return;
  const [ex, ey] = land.edge(c.x, c.y);
  if (Math.hypot(ex, ey) <= CLIFF && !walled(land, x, y, c.x, c.y)) return;
  c.x = x;
  c.y = y;
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
      if (!padded(w, c, px, py)) damage(w, c, (impact - 28) * 0.24 * hard, null, px, py);
      w.emit({ t: 'crash', x: px, y: py, impact: impact * 0.5, player: c === w.player });
    }
  } else if (impact > 8 && c.scrapeCd <= 0) {
    c.scrapeCd = 0.12;
    w.emit({ t: 'scrape', x: px, y: py, player: c === w.player });
  }
}

/** The list `near` fills for `collideWorld`. */
const WORLD_NEAR: StaticProp[] = [];
/** A car's hull, what it has run into, and where the two touch: filled again for each pair. */
const HULL = newShape();
const OTHER = newShape();
const AT = newTouch();
/** The corners of the box inside a hull's rounding, as x, y pairs. */
const CORNERS = new Float64Array(8);

/** The four corners of the box inside hull S's rounding, into `CORNERS`. */
function cornersOf(S: Shape): Float64Array {
  for (let k = 0; k < 4; k++) {
    const u = k & 1 ? -S.a : S.a;
    const v = k & 2 ? -S.b : S.b;
    CORNERS[k * 2] = S.x + u * S.cs - v * S.sn;
    CORNERS[k * 2 + 1] = S.y + u * S.sn + v * S.cs;
  }
  return CORNERS;
}

export function collideWorld(w: World, c: Car): void {
  // a swollen car hits scenery like the lorry it has become
  const big = Math.max(1, c.size);
  const O = w.oval;
  // the edge of the map: whichever corner of the hull is furthest past each side of it
  // (all four are taken from where the car stood before any of them was pushed back)
  const S = carShape(c, HULL);
  const R = S.r;
  const P = cornersOf(S);
  if (!O) {
    let left = 0;
    let right = 0;
    let top = 0;
    let foot = 0;
    for (let k = 0; k < 8; k += 2) {
      const px = P[k]!;
      const py = P[k + 1]!;
      if (10 + R - px > 10 + R - P[left]!) left = k;
      if (px > P[right]!) right = k;
      if (py < P[top + 1]!) top = k;
      if (py > P[foot + 1]!) foot = k;
    }
    const lx = P[left]!;
    const rx = P[right]!;
    const ty = P[top + 1]!;
    const fy = P[foot + 1]!;
    if (lx < 10 + R) bump(w, c, lx - R, P[left + 1]!, 1, 0, 10 + R - lx, 1);
    if (rx > w.w - 10 - R) bump(w, c, rx + R, P[right + 1]!, -1, 0, rx - (w.w - 10 - R), 1);
    if (ty < 10 + R) bump(w, c, P[top]!, ty - R, 0, 1, 10 + R - ty, 1);
    if (fy > w.h - 10 - R) bump(w, c, P[foot]!, fy + R, 0, -1, fy - (w.h - 10 - R), 1);
  } else {
    const lim = 1 - R / ((O.rx + O.ry) / 2);
    let worst = -1;
    let far = lim;
    for (let k = 0; k < 8; k += 2) {
      const q = Math.hypot((P[k]! - O.cx) / O.rx, (P[k + 1]! - O.cy) / O.ry);
      if (q > far) {
        far = q;
        worst = k;
      }
    }
    if (worst >= 0) {
      const px = P[worst]!;
      const py = P[worst + 1]!;
      let nx = -(px - O.cx) / O.rx / O.rx;
      let ny = -(py - O.cy) / O.ry / O.ry;
      const nl = Math.hypot(nx, ny);
      nx /= nl;
      ny /= nl;
      bump(w, c, px - nx * R, py - ny * R, nx, ny, ((far - lim) * (O.rx + O.ry)) / 2, 1.1);
    }
  }
  if (c.deck > 4) {
    if (!w.deckOpen?.[c.idx]) rails(w, c);
    return;
  }
  // (the circle that holds the whole hull: what is further off than that and its own is not looked at)
  const long = Math.hypot(reach(c), hull(c));
  for (const s of w.near(c.x, c.y, long + 4, WORLD_NEAR)) {
    if (s.down) continue;
    const far = bound(s.def) + long + 1;
    const fx = s.x - c.x;
    const fy = s.y - c.y;
    if (fx > far || fx < -far || fy > far || fy < -far || fx * fx + fy * fy > far * far) continue;
    if (!s.def.solid) {
      if (s.def.trample) trample(w, c, s);
      continue;
    }
    // high enough in the air, a car sails over what is low
    if (s.def.low !== undefined && c.z > s.def.low) continue;
    // (the hull where the car is now: something else may just have pushed it back)
    // (as much of it as stands at the car's own height: wheels up to roof, wherever it is)
    const foot = c.z - (s.lift ?? 0);
    const gap = propTouch(
      carShape(c, HULL),
      s.def,
      s.x,
      s.y,
      s.rot,
      OTHER,
      AT,
      false,
      foot,
      foot + CAR_HIGH * c.size,
    );
    if (gap >= 0) continue;
    let nx = AT.nx;
    let ny = AT.ny;
    let px = AT.px;
    let py = AT.py;
    let depth = -gap;
    // a wall so thin, hit so fast, that the hull is already past its middle: the nearest way out
    // is then the far side. The way out is the side the car came from (where it was a tick ago),
    // as far as the two overlap along it.
    const wasX = c.x - c.vx * DT;
    const wasY = c.y - c.vy * DT;
    if ((wasX - px) * nx + (wasY - py) * ny < 0 && pointGap(OTHER, wasX, wasY, AT) > 0) {
      nx = AT.nx;
      ny = AT.ny;
      px = AT.px;
      py = AT.py;
      depth = extent(OTHER, nx, ny) + extent(HULL, nx, ny) - ((c.x - s.x) * nx + (c.y - s.y) * ny);
      if (depth <= 0) continue;
    }
    // a hard enough ram knocks pieces off it, and may bring it down: then the car ploughs
    // on through, slower, instead of bouncing off
    const vn = -(c.vx * nx + c.vy * ny);
    if (
      vn > (22 + 23 * s.def.hardness) / big &&
      c.z < 6 &&
      batter(w, s, (vn * big - 35) * 0.5 * c.def.stats.mass * big * big, 'impact', px, py)
    ) {
      const keep = big > 1 ? 0.9 : 0.72;
      c.vx *= keep;
      c.vy *= keep;
      if (!padded(w, c, px, py))
        damage(w, c, ((vn - 28) * 0.1 * s.def.hardness) / big, null, px, py);
      w.emit({ t: 'crash', x: px, y: py, impact: vn * 0.5, player: c === w.player });
      continue;
    }
    bump(w, c, px, py, nx, ny, depth, s.def.hardness);
    // a sprung thing throws the car back off itself
    const kick = s.def.bounce;
    if (kick) {
      const out = c.vx * nx + c.vy * ny;
      if (out < kick) {
        c.vx += nx * (kick - out);
        c.vy += ny * (kick - out);
        if (kick - out > 30)
          w.emit({ t: 'bounce', car: c.index, prop: s.index, x: px, y: py, power: kick });
      }
    }
  }
}

/** Long grass, corn and flowers go down under a car that drives over them, and stay down. */
function trample(w: World, c: Car, s: StaticProp): void {
  if (c.z > 2 || c.vx * c.vx + c.vy * c.vy < 64) return;
  // (it is well under the car before it goes down, not brushed by a corner)
  if (carGap(c, s.x, s.y) > s.def.radius - hull(c) * 0.2) return;
  s.down = true;
  w.emit({ t: 'trample', prop: s.index, car: c.index, x: s.x, y: s.y });
}

/**
 * A car up on a deck is kept on it by the rails along its edges (where it has them: see
 * `deckOpen`); nothing below is in its way.
 */
function rails(w: World, c: Car): void {
  const T = w.track!;
  const i = c.idx;
  const a = T.a[i]!;
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  const S = carShape(c, HULL);
  const R = S.r;
  const lim = w.road / 2 - R;
  const P = cornersOf(S);
  // the corner of the hull furthest over each rail
  for (const sg of [1, -1]) {
    let worst = -1;
    let over = lim;
    for (let k = 0; k < 8; k += 2) {
      const off = ((P[k]! - T.x[i]!) * nx + (P[k + 1]! - T.y[i]!) * ny) * sg;
      if (off > over) {
        over = off;
        worst = k;
      }
    }
    if (worst < 0) continue;
    bump(
      w,
      c,
      P[worst]! + nx * sg * R,
      P[worst + 1]! + ny * sg * R,
      -nx * sg,
      -ny * sg,
      over - lim,
      0.7,
    );
  }
}

/** Damage multiplier by where a car was hit: the front is its ram, a door is soft. */
export function zoneFactor(lx: number): number {
  return lx > 6 ? 0.45 : Math.abs(lx) < 5 ? 1.35 : 0.9;
}

export function collideCars(w: World, a: Car, b: Car): void {
  const reach = 15 * (a.size + b.size);
  if (Math.abs(a.x - b.x) > reach || Math.abs(a.y - b.y) > reach || Math.abs(a.z - b.z) > 10)
    return;
  // the two hulls: where they are deepest into each other, and the way from a into b there
  const gap = shapeGap(carShape(b, OTHER), carShape(a, HULL), AT);
  const best = gap < 0 ? { px: AT.px, py: AT.py, ov: -gap, nx: AT.nx, ny: AT.ny } : null;
  if (!best || flatten(w, a, b)) return;
  const ma = heft(a) * dugIn(a);
  const mb = heft(b) * dugIn(b);
  const tot = ma + mb;
  a.x -= (best.nx * best.ov * mb) / tot;
  a.y -= (best.ny * best.ov * mb) / tot;
  b.x += (best.nx * best.ov * ma) / tot;
  b.y += (best.ny * best.ov * ma) / tot;
  // spiked hubs chew whatever runs alongside, however gently the two are touching
  grind(w, a, b, toLocal(a, best.px, best.py), best.px, best.py);
  grind(w, b, a, toLocal(b, best.px, best.py), best.px, best.py);
  const vrel = (b.vx - a.vx) * best.nx + (b.vy - a.vy) * best.ny;
  if (vrel >= 0) return;
  const j = (-(1 + 0.32) * vrel) / (1 / ma + 1 / mb);
  a.vx -= (j / ma) * best.nx;
  a.vy -= (j / ma) * best.ny;
  b.vx += (j / mb) * best.nx;
  b.vy += (j / mb) * best.ny;
  // a hit off the centre line turns the car
  const ra = toLocal(a, best.px, best.py).map((v) => v / a.size) as [number, number];
  const rb = toLocal(b, best.px, best.py).map((v) => v / b.size) as [number, number];
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
    const da = ((base * zoneFactor(ra[0]) * mb) / 1.1) * ramOf(b) * gearGuard(a, ra);
    const db = ((base * zoneFactor(rb[0]) * ma) / 1.1) * ramOf(a) * gearGuard(b, rb);
    damage(w, a, da, b, best.px, best.py);
    damage(w, b, db, a, best.px, best.py);
  }
  if (w.kind === 'derby' && impact > 60) {
    if (a.ai) a.ai.revT = w.rng.range(0.3, 0.7);
    if (b.ai) b.ai.revT = w.rng.range(0.3, 0.7);
  }
  w.emit({ t: 'crash', x: best.px, y: best.py, impact, player });
}

export function collideProps(w: World, c: Car): void {
  const long = reach(c) + 2;
  // (nothing loose is as big as this: most props are passed by on it alone)
  const coarse = long + 24;
  for (const p of w.props) {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    if (!p.alive || dx > coarse || dx < -coarse || dy > coarse || dy < -coarse) continue;
    if (p.z - c.deck > 10 || c.deck - p.z > 10) continue;
    const far = long + bound(p.def);
    if (dx > far || dx < -far || dy > far || dy < -far) continue;
    const pm = p.def.mass ?? 0.5;
    {
      // its shape against the hull: it is pushed out of the car the nearest way
      const gap = propTouch(carShape(c, HULL), p.def, p.x, p.y, p.rot, OTHER, AT, true);
      if (gap >= 0) continue;
      const nx = AT.nx;
      const ny = AT.ny;
      p.x -= nx * gap;
      p.y -= ny * gap;
      const vrel = (p.vx - c.vx) * nx + (p.vy - c.vy) * ny;
      if (vrel >= 0) continue;
      const mc = heft(c) * 3;
      const j = (-1.5 * vrel) / (1 / mc + 1 / pm);
      p.vx += (j / pm) * nx;
      p.vy += (j / pm) * ny;
      c.vx -= (j / mc) * nx;
      c.vy -= (j / mc) * ny;
      const impact = -vrel * Math.max(1, c.size);
      p.spin += w.rng.range(-1, 1) * impact * 0.15;
      if (p.def.breaksAt !== undefined && impact > p.def.breaksAt) {
        breakProp(w, p, c);
        continue;
      }
      if (p.def.explodesAt !== undefined && impact > p.def.explodesAt) light(p, c.index, 0.05);
      p.vz = Math.max(p.vz, impact * p.def.launch);
      if (impact > 40) w.emit({ t: 'scrape', x: p.x, y: p.y, player: c === w.player });
    }
  }
}
