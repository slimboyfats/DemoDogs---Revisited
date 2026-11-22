// rig.ts: a walk for a stacked character. No drawing here, only numbers.
//
// Ported to TypeScript from js/rig.js of loktar00/sprite-stack-animation (MIT, see
// THIRD_PARTY_NOTICES.md). The walk logic is unchanged; the arms are left out (the bots have none).
//
// Two ideas carry it:
//  1. The step clock is driven by distance, not time. Each call to step() adds (ground covered /
//     stride length) to one phase. A leg is planted for the first part of its cycle and swings for
//     the rest; the two legs are half a cycle apart. Because the clock only moves when the body
//     does, feet cannot slide or run ahead.
//  2. A planted foot is a fixed point in the world. The body travels over it, and the knee is
//     solved every frame from where the hip and the foot are: analytic two-bone inverse kinematics
//     (the law of cosines).

export type Vec3 = [number, number, number];
const TAU = Math.PI * 2;
const ease = (t: number) => t * t * (3 - 2 * t);
function turn(a: number, b: number, t: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

/** Two-bone IK: the middle joint for bones a and b from root to target, bending towards hint. */
export function solveTwoBone(root: Vec3, target: Vec3, a: number, b: number, hint: Vec3): Vec3 {
  let dx = target[0] - root[0];
  let dy = target[1] - root[1];
  let dz = target[2] - root[2];
  const len = Math.hypot(dx, dy, dz) || 1e-6;
  dx /= len;
  dy /= len;
  dz /= len;
  const d = Math.min(Math.max(len, Math.abs(a - b) + 1e-3), a + b - 1e-3);
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const along = hint[0] * dx + hint[1] * dy + hint[2] * dz;
  let px = hint[0] - along * dx;
  let py = hint[1] - along * dy;
  let pz = hint[2] - along * dz;
  const pl = Math.hypot(px, py, pz);
  if (pl < 1e-6) {
    px = 0;
    py = 0;
    pz = 1;
  } else {
    px /= pl;
    py /= pl;
    pz /= pl;
  }
  return [
    root[0] + dx * a * cosA + px * a * sinA,
    root[1] + dy * a * cosA + py * a * sinA,
    root[2] + dz * a * cosA + pz * a * sinA,
  ];
}

export interface RigConfig {
  thigh: number;
  shin: number;
  ankle: number;
  hipHalf: number;
  kneeHint: number;
  standHip: number;
  stride: number;
  duty: number;
  lift: number;
  bob: number;
  twist: number;
  spine: number;
}

export const DEFAULTS: RigConfig = {
  thigh: 7,
  shin: 7,
  ankle: 1.5,
  hipHalf: 2.4,
  kneeHint: 1,
  standHip: 13.2,
  stride: 18,
  duty: 0.6,
  lift: 2.4,
  bob: 0.35,
  twist: 0.16,
  spine: 9.5,
};

interface Foot {
  x: number;
  y: number;
  z: number;
  rot: number;
  planted: boolean;
  fx: number;
  fy: number;
  frot: number;
}

export interface Walker {
  c: RigConfig;
  x: number;
  y: number;
  h: number;
  dx: number;
  dy: number;
  phase: number;
  hipZ: number;
  steps: number;
  feet: [Foot, Foot];
}

export interface Leg {
  hip: Vec3;
  knee: Vec3;
  ankle: Vec3;
  sole: Vec3;
  rot: number;
  planted: boolean;
}

export interface Pose {
  x: number;
  y: number;
  heading: number;
  phase: number;
  pelvis: Vec3;
  hipsAngle: number;
  legs: Leg[];
}

const foot = (): Foot => ({ x: 0, y: 0, z: 0, rot: 0, planted: true, fx: 0, fy: 0, frot: 0 });

export function createWalker(cfg: Partial<RigConfig> = {}): Walker {
  const c = { ...DEFAULTS, ...cfg };
  const w: Walker = {
    c,
    x: 0,
    y: 0,
    h: 0,
    dx: 1,
    dy: 0,
    phase: 0,
    hipZ: c.standHip,
    steps: 0,
    feet: [foot(), foot()],
  };
  place(w, 0, 0, 0);
  return w;
}

function hipGround(w: Walker, i: number, h: number): [number, number] {
  const side = i ? 1 : -1;
  return [w.x - Math.sin(h) * side * w.c.hipHalf, w.y + Math.cos(h) * side * w.c.hipHalf];
}

/** Put the walker somewhere without walking there: both feet under the hips. */
export function place(w: Walker, x: number, y: number, h: number): void {
  w.x = x;
  w.y = y;
  w.h = h;
  w.dx = Math.cos(h);
  w.dy = Math.sin(h);
  w.hipZ = w.c.standHip;
  for (let i = 0; i < 2; i++) {
    const g = hipGround(w, i, h);
    const f = w.feet[i]!;
    f.x = g[0];
    f.y = g[1];
    f.z = 0;
    f.rot = h;
    f.planted = true;
  }
}

/** Move the body to (x, y) facing h. dt only smooths the hip height. */
export function step(w: Walker, x: number, y: number, h: number, dt: number): void {
  const c = w.c;
  const mx = x - w.x;
  const my = y - w.y;
  const dist = Math.hypot(mx, my);
  w.x = x;
  w.y = y;
  w.h = h;
  if (dist > 1e-6) {
    w.dx = mx / dist;
    w.dy = my / dist;
  }
  w.phase = (w.phase + dist / c.stride) % 1;
  const stance = c.duty * c.stride;
  let far = 0;
  for (let i = 0; i < 2; i++) {
    const f = w.feet[i]!;
    const g = hipGround(w, i, h);
    const p = (w.phase + i * 0.5) % 1;
    if (p < c.duty) {
      if (!f.planted) {
        const ahead = stance / 2 - p * c.stride;
        f.planted = true;
        f.x = g[0] + w.dx * ahead;
        f.y = g[1] + w.dy * ahead;
        f.rot = h;
        w.steps++;
      }
      f.z = 0;
      far = Math.max(far, Math.hypot(f.x - g[0], f.y - g[1]));
    } else {
      if (f.planted) {
        f.planted = false;
        f.fx = f.x;
        f.fy = f.y;
        f.frot = f.rot;
      }
      const u = (p - c.duty) / (1 - c.duty);
      const e = ease(u);
      const ahead = (1 - p) * c.stride + stance / 2;
      f.x = f.fx + (g[0] + w.dx * ahead - f.fx) * e;
      f.y = f.fy + (g[1] + w.dy * ahead - f.fy) * e;
      f.z = c.lift * Math.sin(Math.PI * u);
      f.rot = turn(f.frot, h, e);
    }
  }
  const reach = c.thigh + c.shin - 0.3;
  const most = c.ankle + Math.sqrt(Math.max(1, reach * reach - far * far));
  const want = Math.min(c.standHip, most);
  w.hipZ += (want - w.hipZ) * Math.min(1, (dt || 1 / 60) * 14);
  if (w.hipZ > most) w.hipZ = most;
}

/** Joints for drawing. (The reference's arms are left out: the bots have none.) */
export function pose(w: Walker): Pose {
  const c = w.c;
  const ph = w.phase * TAU;
  const fwd: Vec3 = [Math.cos(w.h), Math.sin(w.h), 0];
  const twist = c.twist * Math.cos(ph);
  const hipsAngle = w.h + twist;
  const pz = w.hipZ - c.bob * Math.cos(2 * ph);
  const P: Pose = {
    x: w.x,
    y: w.y,
    heading: w.h,
    phase: w.phase,
    pelvis: [w.x, w.y, pz],
    hipsAngle,
    legs: [],
  };
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1;
    const f = w.feet[i]!;
    const hip: Vec3 = [
      w.x - Math.sin(hipsAngle) * side * c.hipHalf,
      w.y + Math.cos(hipsAngle) * side * c.hipHalf,
      pz,
    ];
    const ankle: Vec3 = [f.x, f.y, f.z + c.ankle];
    P.legs.push({
      hip,
      knee: solveTwoBone(hip, ankle, c.thigh, c.shin, [
        fwd[0] * c.kneeHint,
        fwd[1] * c.kneeHint,
        0,
      ]),
      ankle,
      sole: [f.x, f.y, f.z],
      rot: f.rot,
      planted: f.planted,
    });
  }
  return P;
}
