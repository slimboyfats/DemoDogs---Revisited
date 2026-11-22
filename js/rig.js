// rig.js: a walk for a stacked character. No drawing here, only numbers.
//
// Two ideas carry it:
//  1. The step clock is driven by distance, not time. Each call to step() adds (ground covered / stride length) to
//     one phase. A leg is planted for the first part of its cycle and swings for the rest; the two legs are half a
//     cycle apart. Because the clock only moves when the body does, feet cannot slide or run ahead.
//  2. A planted foot is a fixed point in the world. The body travels over it, and the knee is solved every frame
//     from where the hip and the foot are: analytic two-bone inverse kinematics (the law of cosines).
(function (global) {
  'use strict';
  const TAU = Math.PI * 2;
  function ease(t) { return t * t * (3 - 2 * t); }
  function turn(a, b, t) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * t; }

  // Two-bone IK. root and target are [x, y, z]; a and b are the bone lengths; hint is the direction the middle
  // joint should bend towards. Returns the middle joint. The triangle root-joint-target has sides a, b and the
  // distance d between root and target, so the angle at the root follows from the law of cosines.
  function solveTwoBone(root, target, a, b, hint) {
    let dx = target[0] - root[0], dy = target[1] - root[1], dz = target[2] - root[2];
    const len = Math.hypot(dx, dy, dz) || 1e-6; dx /= len; dy /= len; dz /= len;
    const d = Math.min(Math.max(len, Math.abs(a - b) + 1e-3), a + b - 1e-3);    // out of reach: the limb is straight
    const cosA = (a * a + d * d - b * b) / (2 * a * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    // the bend direction: the hint with its part along the limb removed
    const along = hint[0] * dx + hint[1] * dy + hint[2] * dz;
    let px = hint[0] - along * dx, py = hint[1] - along * dy, pz = hint[2] - along * dz;
    const pl = Math.hypot(px, py, pz);
    if (pl < 1e-6) { px = 0; py = 0; pz = 1; } else { px /= pl; py /= pl; pz /= pl; }
    return [root[0] + dx * a * cosA + px * a * sinA, root[1] + dy * a * cosA + py * a * sinA, root[2] + dz * a * cosA + pz * a * sinA];
  }

  const DEFAULTS = {
    thigh: 7, shin: 7,        // leg bones
    ankle: 1.5,               // the ankle's height over the sole
    hipHalf: 2.4,             // half the distance between the hips
    kneeHint: 1,              // 1: knees bend forward; -1: backward
    standHip: 13.2,           // hip height when standing
    stride: 18,               // ground covered by one full cycle (two steps)
    duty: 0.6,                // the part of a cycle a foot is planted; over 0.5 is a walk, under it a run
    lift: 2.4,                // how high a swinging foot rises
    bob: 0.35,                // hips rise and fall, twice a cycle
    twist: 0.16,              // hips turn with the leading leg (radians); the shoulders turn against it
    spine: 9.5,               // from the hips up to the shoulders (or to the top of a body without arms)
    arms: true, shoulderHalf: 7.5, upperArm: 4.6, foreArm: 4.6, armSwing: 0.55
  };

  function createWalker(cfg) {
    const c = Object.assign({}, DEFAULTS, cfg || {});
    const w = { c: c, x: 0, y: 0, h: 0, dx: 1, dy: 0, phase: 0, hipZ: c.standHip, steps: 0, feet: [] };
    for (let i = 0; i < 2; i++) w.feet.push({ x: 0, y: 0, z: 0, rot: 0, planted: true, fx: 0, fy: 0, frot: 0 });
    place(w, 0, 0, 0);
    return w;
  }
  function hipGround(w, i, h) { const side = i ? 1 : -1, c = w.c; return [w.x - Math.sin(h) * side * c.hipHalf, w.y + Math.cos(h) * side * c.hipHalf]; }

  // Put the walker somewhere without walking there: both feet under the hips.
  function place(w, x, y, h) {
    w.x = x; w.y = y; w.h = h; w.dx = Math.cos(h); w.dy = Math.sin(h); w.hipZ = w.c.standHip;
    for (let i = 0; i < 2; i++) { const g = hipGround(w, i, h), f = w.feet[i]; f.x = g[0]; f.y = g[1]; f.z = 0; f.rot = h; f.planted = true; }
  }

  // Move the body to (x, y) facing h. Call once per fixed time step; dt only smooths the hip height.
  function step(w, x, y, h, dt) {
    const c = w.c, mx = x - w.x, my = y - w.y, dist = Math.hypot(mx, my);
    w.x = x; w.y = y; w.h = h;
    if (dist > 1e-6) { w.dx = mx / dist; w.dy = my / dist; }
    w.phase = (w.phase + dist / c.stride) % 1;
    const stance = c.duty * c.stride;            // ground the body covers while one foot is down
    let far = 0;
    for (let i = 0; i < 2; i++) {
      const f = w.feet[i], g = hipGround(w, i, h), p = (w.phase + i * 0.5) % 1;
      if (p < c.duty) {
        if (!f.planted) {                        // touchdown: half a stance ahead of the hip, so the hip passes over it mid-stance
          const ahead = stance / 2 - p * c.stride;
          f.planted = true; f.x = g[0] + w.dx * ahead; f.y = g[1] + w.dy * ahead; f.rot = h; w.steps++;
        }
        f.z = 0;                                 // planted: x and y are not touched until the foot lifts
        far = Math.max(far, Math.hypot(f.x - g[0], f.y - g[1]));
      } else {
        if (f.planted) { f.planted = false; f.fx = f.x; f.fy = f.y; f.frot = f.rot; }
        const u = (p - c.duty) / (1 - c.duty), e = ease(u);
        const ahead = (1 - p) * c.stride + stance / 2;   // where the hip will be at touchdown, plus half a stance
        f.x = f.fx + (g[0] + w.dx * ahead - f.fx) * e; f.y = f.fy + (g[1] + w.dy * ahead - f.fy) * e;
        f.z = c.lift * Math.sin(Math.PI * u);
        f.rot = turn(f.frot, h, e);
      }
    }
    // hip height: as high as standing allows, but never so high that a planted foot is out of reach
    const reach = c.thigh + c.shin - 0.3, most = c.ankle + Math.sqrt(Math.max(1, reach * reach - far * far));
    const want = Math.min(c.standHip, most);
    w.hipZ += (want - w.hipZ) * Math.min(1, (dt || 1 / 60) * 14);
    if (w.hipZ > most) w.hipZ = most;
  }

  // Everything a drawing needs, as plain data: joints are [x, y, z]. arms is empty when the character has none.
  function pose(w) {
    const c = w.c, ph = w.phase * TAU, fwd = [Math.cos(w.h), Math.sin(w.h), 0];
    const twist = c.twist * Math.cos(ph), hipsAngle = w.h + twist, shouldersAngle = w.h - twist * 1.2;
    const pz = w.hipZ - c.bob * Math.cos(2 * ph);
    const P = { x: w.x, y: w.y, heading: w.h, phase: w.phase, pelvis: [w.x, w.y, pz], top: [w.x, w.y, pz + c.spine], hipsAngle: hipsAngle, shouldersAngle: shouldersAngle, legs: [], arms: [] };
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1, f = w.feet[i];
      const hip = [w.x - Math.sin(hipsAngle) * side * c.hipHalf, w.y + Math.cos(hipsAngle) * side * c.hipHalf, pz];
      const ankle = [f.x, f.y, f.z + c.ankle];
      P.legs.push({ hip: hip, knee: solveTwoBone(hip, ankle, c.thigh, c.shin, [fwd[0] * c.kneeHint, fwd[1] * c.kneeHint, 0]), ankle: ankle, sole: [f.x, f.y, f.z], rot: f.rot, planted: f.planted });
      if (!c.arms) continue;
      // the arm swings against the leg on its side; the elbow is solved with the same function, bending backwards
      const sh = [w.x - Math.sin(shouldersAngle) * side * c.shoulderHalf, w.y + Math.cos(shouldersAngle) * side * c.shoulderHalf, pz + c.spine];
      const a = side * c.armSwing * Math.cos(ph), L = (c.upperArm + c.foreArm) * 0.93;
      const hand = [sh[0] + fwd[0] * Math.sin(a) * L, sh[1] + fwd[1] * Math.sin(a) * L, sh[2] - Math.cos(a) * L];
      P.arms.push({ shoulder: sh, elbow: solveTwoBone(sh, hand, c.upperArm, c.foreArm, [-fwd[0], -fwd[1], 0]), hand: hand });
    }
    return P;
  }

  global.Rig = { solveTwoBone: solveTwoBone, createWalker: createWalker, place: place, step: step, pose: pose, DEFAULTS: DEFAULTS };
})(window);
