import { compile, uniforms } from './gl';
import { BANG_RAMP, CKind, FIRE_RAMP, HOT, ringStrength, type Gust, type Ring } from './cells';
import { LIGHT_BANDS, MAX_LIGHTS, type Lights } from './lighting';
import { WIND } from './particles';
import { RELIEF_GLSL, type ReliefLayer } from './relief-layer';

/**
 * Fire and smoke on the GPU, after mudders' GPU particle engine (render/pixel/gpu-particles.ts):
 * the gas cells (bang, fire, smoke, fog) live in GPU buffers and are stepped by a
 * transform-feedback vertex shader, one pass a tick over the whole ring, so a blast can let go
 * tens of thousands of single cells and a phone still keeps up. Drawing reads the same buffer as
 * one point per cell on the screen's fine grid, in mudders' hard-stepped colours.
 *
 * The motion is mudders' too, given a height: a cell keeps its own way for a moment after it is
 * thrown, then the air takes it (how hard is the kind's `flow`), it walks at random a little
 * (`jitter`), drags, lifts on its heat, leans on the wind, and is wound into filaments by a
 * drifting curl-noise field (`swirl`). mudders gets its air from a fluid solver; here the air is
 * summed from what stirs it: a blast's shove (`Gust`), its rolls (`Ring`: the ground roll that
 * throws fire out along the ground and the cap that curls the ball over), the cars' wakes, and
 * whirlpools.
 *
 * Purely visual: nothing reads it back. Slots are a ring; spawning only uploads the new slots.
 * `Cells` keeps the CPU version (leaves, and everything where this cannot run).
 */

/** Floats per cell: x y z vx | vy vz age life | th kind rgb seed */
const F = 12;
/** Most rings, gusts, movers and whirlpools the shader takes in one pass. */
export const MAX_RINGS = 12;
export const MAX_GUSTS = 6;
export const MAX_MOVERS = 8;
export const MAX_SWIRLS = 4;
/** Slots to a chunk of the ring (see `until`). */
const CHUNK = 4096;
/** Ticks in a row the gas is stepped without a frame being drawn; past that it only ages. */
const UNSEEN = 4;

const UPDATE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 a0; // x y z vx
layout(location = 1) in vec4 a1; // vy vz age life
layout(location = 2) in vec4 a2; // th kind rgb seed
uniform float u_dt;
uniform float u_aged; // seconds to age by: u_dt, plus any ticks nobody saw
uniform float u_tick;
uniform vec2 u_wind;
uniform int u_nr;
uniform vec4 u_ra[${MAX_RINGS}]; // x y z vz
uniform vec4 u_rb[${MAX_RINGS}]; // R r spin strength
uniform int u_ng;
uniform vec4 u_ga[${MAX_GUSTS}]; // x y z R
uniform float u_gb[${MAX_GUSTS}]; // outward speed
uniform int u_nm;
uniform vec4 u_ma[${MAX_MOVERS}]; // x y z R
uniform vec4 u_mb[${MAX_MOVERS}]; // ux uy sp -
uniform int u_ns;
uniform vec4 u_sw[${MAX_SWIRLS}]; // x y R k*dt
out vec4 o0;
out vec4 o1;
out vec4 o2;
float hash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
float fall(float x) { return 1.0 / (1.0 + x + 0.5 * x * x); }
// value noise and its curl: a divergence-free swirl field drifting with time (mudders')
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float psi(vec2 p, float t) {
  return noise(p * 0.085 + vec2(t * 0.24, -t * 0.36)) + 0.5 * noise(p * 0.19 - vec2(t * 0.54, 0.0));
}
vec2 curl(vec2 p, float t) {
  const float e = 0.6;
  float dx = psi(p + vec2(e, 0.0), t) - psi(p - vec2(e, 0.0), t);
  float dy = psi(p + vec2(0.0, e), t) - psi(p - vec2(0.0, e), t);
  return vec2(dy, -dx) / (2.0 * e) * 14.0;
}
// where the air is going at a point (art px a second)
vec3 air(vec3 p) {
  vec3 a = vec3(0.0);
  for (int i = 0; i < ${MAX_GUSTS}; i++) {
    if (i >= u_ng) break;
    vec4 g = u_ga[i];
    vec3 d = p - g.xyz;
    float len = length(d);
    float q = len / g.w;
    if (q > 4.0 || len < 0.01) continue;
    a += d / len * (u_gb[i] * q * 1.9 / (1.0 + q * q * q));
  }
  for (int i = 0; i < ${MAX_RINGS}; i++) {
    if (i >= u_nr) break;
    vec4 g = u_ra[i];
    vec4 h = u_rb[i];
    vec2 d = p.xy - g.xy;
    float reach = h.x + h.y * 3.0;
    if (abs(d.x) > reach || abs(d.y) > reach) continue;
    float rho = length(d);
    float dr = rho - h.x;
    float dh = p.z - g.z;
    float dd = length(vec2(dr, dh)) + 0.001;
    float q = dd / h.y;
    float fl = 2.0 / (1.0 + q * q);
    float s = h.z * q * fl * h.w / dd;
    // nothing crosses the axis: the pull inward dies away towards it
    if (rho > 0.01) a.xy += s * dh * d / rho * min(1.0, rho / (h.x * 0.7));
    a.z += -s * dr + g.w * fl * 0.35 * h.w;
  }
  return a;
}
// the air the cars stir (see Cells.stir)
vec3 wake(vec3 p) {
  vec3 a = vec3(0.0);
  for (int m = 0; m < ${MAX_MOVERS}; m++) {
    if (m >= u_nm) break;
    vec4 A = u_ma[m];
    vec4 B = u_mb[m];
    float R = A.w;
    float reach = R * 4.0;
    vec2 d = p.xy - A.xy;
    if (abs(d.x) > reach || abs(d.y) > reach) continue;
    float hz = p.z - A.z;
    if (hz > R * 2.0) continue;
    float along = d.x * B.x + d.y * B.y;
    if (along > R * 1.5 || along < -reach) continue;
    float side = -d.x * B.y + d.y * B.x;
    float sp = B.z;
    float RR = R * R;
    float low = fall(max(0.0, hz) / (R * 0.8));
    float fa = 0.0;
    float fs = 0.0;
    if (along < 0.0) {
      fa += sp * 0.75 * fall(side * side / (RR * 0.6)) * fall(-along / (R * 2.2));
      float ca = along + R * 0.9;
      float r2 = RR * 0.35;
      for (int k = -1; k <= 1; k += 2) {
        float fk = float(k);
        float cs = side - fk * R * 0.45;
        float t = sp * 0.9 * fk * R * 0.6 / (r2 + ca * ca + cs * cs);
        fa -= cs * t;
        fs += ca * t;
      }
    } else {
      float bow = fall(along / (R * 0.6)) * fall(side * side / RR);
      fs += (side < 0.0 ? -1.0 : 1.0) * sp * 0.6 * bow;
      fa += sp * 0.3 * bow;
    }
    fa *= low;
    fs *= low;
    a.x += fa * B.x - fs * B.y;
    a.y += fa * B.y + fs * B.x;
    a.z += abs(fs) * 0.15;
  }
  return a;
}
void main() {
  o0 = a0;
  o1 = a1;
  o2 = a2;
  float life = a1.w;
  if (a1.z >= life) return; // dead: left as it is until its slot is used again
  float age = a1.z + u_aged;
  float t = age / life;
  int k = int(a2.y + 0.5);
  vec3 p = a0.xyz;
  vec3 v = vec3(a0.w, a1.x, a1.y);
  float th = a2.x;
  float id = float(gl_VertexID);
  // each cell a little different, so a burst spreads instead of moving as one sheet
  float h = hash(vec2(id, a2.w)) - 0.5;
  float k60 = u_dt * 60.0;
  if (k == ${CKind.Fog}) {
    // a smoke screen: heavy and cold, it seeks its own height and churns slowly there
    vec3 ai = air(p) + wake(p);
    float f = min(1.0, 2.5 * u_dt);
    float roll = age * (0.8 + th) + th * 30.0;
    v.x += (ai.x + u_wind.x * 0.25 + sin(roll) * 5.0 - v.x) * f;
    v.y += (ai.y + u_wind.y * 0.25 + cos(roll) * 5.0 - v.y) * f;
    v.z += (ai.z + (2.0 + th * 9.0 - p.z) * 1.5 - v.z) * f;
    p += v * u_dt;
  } else {
    // per kind: how hard the air carries it, its random walk (art px a tick), what it keeps of
    // its speed a tick, its lift, its swirl, and how it leans on the wind
    bool bang = k == ${CKind.Bang};
    bool fire = k == ${CKind.Fire};
    float flow = bang ? 0.5 : fire ? 0.95 : 0.8;
    float jit = bang ? 0.25 : fire ? 0.42 : 0.23;
    float drag = fire ? 0.96 : 0.95;
    float lift = bang ? 14.0 : fire ? 14.0 : 11.0 * (1.0 - t * 0.6);
    float swirl = bang ? 0.0 : fire ? 75.0 : 95.0;
    // the wind leans on a blast from its first tick: the ball is blown over as it flies out
    float lean = bang ? 0.6 : fire ? 0.6 + t * 0.4 : 0.6 + t * 0.8;
    drag = 1.0 - (1.0 - drag) * (1.0 + h * 0.5);
    v *= pow(drag, k60);
    v.z += lift * (1.0 + h) * u_dt;
    v.xy += u_wind * lean * 3.0 * u_dt;
    // a thing just thrown keeps its own way for a moment before the air takes it, so a blast's
    // fire flies out as a ball first and is rolled up after
    float ticks = age * 60.0;
    float own = min(1.0, 0.03 + ticks * ticks / 700.0);
    // ...but a car going by drags it along at once, however fresh
    vec3 wk = wake(p);
    float near = min(1.0, dot(wk, wk) / 64.0);
    flow *= mix(own, 1.0, near);
    vec3 ai = air(p) * mix(1.0, own, near) + wk;
    float sp = dot(ai, ai);
    // still air leaves it alone
    if (sp > 1.0) v += (ai - v) * min(1.0, flow * (1.0 + h * 0.5) * min(1.0, sp / 64.0) * k60);
    // the swirl grows as smoke ages and spreads into bigger eddies
    if (swirl > 0.0) {
      float sw = swirl * (0.4 + t) * u_dt;
      v.xy += curl(p.xy + vec2(p.z * 0.6, -p.z * 0.4), u_tick * u_dt) * sw;
      v.z += curl(vec2(p.x + p.y, p.z * 1.3 + 40.0), u_tick * u_dt).x * sw * 0.5;
    }
    p += v * u_dt;
    float ja = hash(vec2(id * 0.37, u_tick * 1.31)) * 6.2831853;
    float jz = hash(vec2(u_tick * 0.77, id * 0.61)) - 0.5;
    p += vec3(cos(ja), sin(ja), jz * 1.2) * jit * k60;
  }
  if (p.z < 0.0) {
    // the ground: what was going down spreads along it
    p.z = 0.0;
    v.z = 0.0;
  }
  for (int s = 0; s < ${MAX_SWIRLS}; s++) {
    if (s >= u_ns) break;
    vec4 w = u_sw[s];
    vec2 d = w.xy - p.xy;
    if (abs(d.x) > w.z || abs(d.y) > w.z) continue;
    float dl = length(d);
    if (dl > w.z || dl < 1.5) continue;
    float q = w.w * (0.4 + 1.6 * (1.0 - dl / w.z)) / dl;
    p.xy += vec2(d.x * 0.7 - d.y, d.y * 0.7 + d.x) * q;
  }
  o0 = vec4(p, v.x);
  o1 = vec4(v.y, v.z, age, life);
}`;

const NOP_FS = `#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(0.0); }`;

/**
 * Drawing: one point per cell. Pass 0 is smoke, soot, fog and fire past its hot steps; pass 1
 * the hot fire and the bang; pass 2 the additive glow over the hottest. The rules are mudders'
 * (its DRAW_VS): every cell steps through its colours on its own clock and winks out on its own
 * threshold, and smoke catches the light of the fire beside it in the same hard bands as the
 * ground.
 */
const DRAW_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 a0;
layout(location = 1) in vec4 a1;
layout(location = 2) in vec4 a2;
uniform vec2 u_view;
uniform vec2 u_origin;
uniform float u_cell;  // device px per fine cell
uniform float u_grid;  // fine cells per art px
uniform float u_ys;
uniform float u_cosP;${RELIEF_GLSL}
uniform int u_pass;
uniform vec3 u_fire[13];
uniform vec3 u_bang[9];
uniform vec3 u_hot;
uniform int u_lcount;
uniform vec4 u_lpos[${MAX_LIGHTS}];
uniform vec3 u_lcol[${MAX_LIGHTS}];
uniform vec3 u_amb; // the sky's light on smoke and fog (1 by day)
out vec4 v_color;
float stepT(float t, float th, float n) { return min(1.0, floor(t * n + th) / n); }
vec3 rgbOf(float c) {
  float r = floor(c / 65536.0);
  float g = floor((c - r * 65536.0) / 256.0);
  float b = c - r * 65536.0 - g * 256.0;
  return vec3(r, g, b) / 255.0;
}
void main() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // off screen unless drawn
  gl_PointSize = 0.0;
  v_color = vec4(0.0);
  float life = a1.w;
  float age = a1.z;
  if (age >= life) return;
  int k = int(a2.y + 0.5);
  float t = age / life;
  float th = a2.x;
  float n = 1.0;
  vec3 c = vec3(0.0);
  float a = 1.0;
  bool lit = false;
  if (k == ${CKind.Wisp}) {
    if (u_pass != 0) return;
    if (th >= min(1.0, t * 8.0 + 0.4) * (t < 0.5 ? 1.0 : (1.0 - t) / 0.5)) return;
    float s = stepT(t, th, 6.0);
    c = min(vec3(1.0), rgbOf(a2.z) * (s < 0.34 ? 0.55 : s < 0.67 ? 1.0 : 1.45));
    lit = true;
  } else if (k == ${CKind.Fog}) {
    if (u_pass != 0) return;
    if (t > 0.8 && th < (t - 0.8) / 0.2) return;
    float s = stepT(t, th, 4.0);
    n = t < 0.85 ? 3.0 : 2.0;
    c = min(vec3(1.0), rgbOf(a2.z) * (0.8 + s * 0.35));
    lit = true;
  } else if (k == ${CKind.Fire}) {
    float s = stepT(t, th, 12.0);
    bool hot = s < 0.42;
    if (th >= (t < 0.45 ? 1.0 : (1.0 - t) / 0.55)) return;
    if (u_pass == 2) {
      if (s >= 0.2) return;
      c = u_hot;
      a = 0.4;
    } else {
      if (hot != (u_pass == 1)) return;
      c = u_fire[int(floor(s * 12.0 + 0.5))];
    }
  } else if (k == ${CKind.Bang}) {
    if (u_pass == 0) return;
    if (th >= (t < 0.7 ? 1.0 : (1.0 - t) / 0.3)) return;
    float f = stepT(max(0.0, t - 0.3) / 0.7, th, 8.0);
    if (u_pass == 2) {
      if (f >= 0.5) return;
      c = u_hot;
      a = 0.4;
    } else c = u_bang[int(floor(f * 8.0 + 0.5))];
  } else return;
  if (lit) c *= u_amb;
  if (lit && u_lcount > 0) {
    vec3 L = vec3(0.0);
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (i >= u_lcount) break;
      vec4 lt = u_lpos[i];
      float dist = length(vec3(a0.xy - lt.xy, (a0.z - 6.0) * 0.8));
      if (dist >= lt.z) continue;
      float f = 1.0 - dist / lt.z;
      float e = f * (0.4 + 0.6 * f) * lt.w;
      L += u_lcol[i] * clamp(floor(e * ${LIGHT_BANDS}.0 + th - 0.5) / ${LIGHT_BANDS}.0, 0.0, 1.5);
    }
    c = min(vec3(1.0), c + L * 0.55);
  }
  // on the fine grid: odd sizes sit on a cell, even ones on the line between cells
  vec2 m = vec2(a0.x, a0.y * u_ys - (a0.z + groundAt(a0.xy)) * u_cosP) * u_grid;
  vec2 at = mod(n, 2.0) > 0.5 ? floor(m) + 0.5 : floor(m + 0.5);
  vec2 px = u_origin + at * u_cell;
  gl_Position = vec4(px.x / u_view.x * 2.0 - 1.0, 1.0 - px.y / u_view.y * 2.0, 0.0, 1.0);
  gl_PointSize = n * u_cell;
  v_color = vec4(c * a, a);
}`;

const DRAW_FS = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 o;
void main() { o = v_color; }`;

/**
 * The flames into the light map's third target (see LightBlock), for the traced light: each hot
 * fire cell and each cell of a bang is a spot of its own colour on the ground under it, so the
 * light a fire throws has the shape of its flames and moves as they twirl. Alpha stays 0: that
 * is what tells a flame from a lamp's texel there. The other two targets get nothing (the map
 * is blended by MAX).
 */
const EMIT_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 a0;
layout(location = 1) in vec4 a1;
layout(location = 2) in vec4 a2;
uniform vec4 u_box;
uniform vec3 u_fire[13];
uniform vec3 u_bang[9];
out vec3 v_color;
float stepT(float t, float th, float n) { return min(1.0, floor(t * n + th) / n); }
void main() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 0.0;
  v_color = vec3(0.0);
  float life = a1.w;
  float age = a1.z;
  if (age >= life) return;
  int k = int(a2.y + 0.5);
  float t = age / life;
  float th = a2.x;
  vec3 c;
  if (k == ${CKind.Fire}) {
    float s = stepT(t, th, 12.0);
    if (s >= 0.42 || th >= (t < 0.45 ? 1.0 : (1.0 - t) / 0.55)) return;
    c = u_fire[int(floor(s * 12.0 + 0.5))];
  } else if (k == ${CKind.Bang}) {
    if (th >= (t < 0.7 ? 1.0 : (1.0 - t) / 0.3)) return;
    c = u_bang[int(floor(stepT(max(0.0, t - 0.3) / 0.7, th, 8.0) * 8.0 + 0.5))];
  } else return;
  gl_Position = vec4((a0.xy - u_box.xy) / u_box.zw * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 2.0;
  v_color = c;
}`;

const EMIT_FS = `#version 300 es
precision mediump float;
in vec3 v_color;
layout(location = 0) out vec4 o;
layout(location = 1) out vec4 oc;
layout(location = 2) out vec4 oe;
void main() {
  o = vec4(0.0);
  oc = vec4(0.0);
  oe = vec4(v_color, 0.0);
}`;

const UPDATE_U = [
  'u_dt',
  'u_aged',
  'u_tick',
  'u_wind',
  'u_nr',
  'u_ra',
  'u_rb',
  'u_ng',
  'u_ga',
  'u_gb',
  'u_nm',
  'u_ma',
  'u_mb',
  'u_ns',
  'u_sw',
] as const;
const DRAW_U = [
  'u_view',
  'u_origin',
  'u_cell',
  'u_grid',
  'u_ys',
  'u_cosP',
  'u_relief',
  'u_rgrid',
  'u_rface',
  'u_pass',
  'u_fire',
  'u_bang',
  'u_hot',
  'u_lcount',
  'u_lpos',
  'u_lcol',
  'u_amb',
] as const;

const rgb3 = (c: number): number[] => [
  ((c >> 16) & 255) / 255,
  ((c >> 8) & 255) / 255,
  (c & 255) / 255,
];

/** Where the gas is drawn: the same view the quad batch gets, plus the projection. */
export interface GasView {
  w: number;
  h: number;
  ox: number;
  oy: number;
  /** Device px per art px, and fine cells per art px. */
  scale: number;
  grid: number;
  ys: number;
  cosP: number;
}

export class GasGpu {
  private readonly bufs: WebGLBuffer[];
  /** One vertex array per buffer: the same layout steps the cells and draws them as points. */
  private readonly vaos: WebGLVertexArrayObject[];
  private readonly tf: WebGLTransformFeedback;
  private readonly upd: WebGLProgram;
  private readonly drw: WebGLProgram;
  private readonly uu;
  private readonly du;
  private readonly emt: WebGLProgram;
  private readonly eu;
  /** Which buffer holds the current state. */
  private cur = 0;
  private head = 0;
  /**
   * The ring in chunks of `CHUNK` slots, and the tick each chunk's last cell burns out at: only
   * the chunks with something alive in them are stepped and drawn, so a quiet race costs a few
   * thousand cells and not the whole buffer.
   */
  private readonly until: Float64Array;
  /** The live chunks as runs of slots (first, count pairs), worked out once a tick. */
  private readonly runs: number[] = [];
  private now = 0;
  /**
   * Ticks stepped since a frame was last drawn, and the time owed to the cells for the ticks
   * skipped: gas nobody sees is not moved (a race run fast-forward, a tab in the background),
   * it only grows older, all at once, on the next tick that is seen.
   */
  private unseen = 0;
  private owed = 0;
  /** New cells waiting to go up, and the slot the first of them goes to. */
  private readonly stage = new Float32Array(8192 * F);
  private staged = 0;
  private stageAt = 0;
  private tick = 0;
  /** Cells let go in each of the last few seconds (a quarter of a second a slot). */
  private spawned: number[] = [];
  private readonly swirls: number[] = [];
  private readonly ra = new Float32Array(MAX_RINGS * 4);
  private readonly rb = new Float32Array(MAX_RINGS * 4);
  private readonly ga = new Float32Array(MAX_GUSTS * 4);
  private readonly gb = new Float32Array(MAX_GUSTS);
  private readonly ma = new Float32Array(MAX_MOVERS * 4);
  private readonly mb = new Float32Array(MAX_MOVERS * 4);
  private readonly sw = new Float32Array(MAX_SWIRLS * 4);
  private readonly fireRamp = new Float32Array(FIRE_RAMP.flatMap(rgb3));
  private readonly bangRamp = new Float32Array(BANG_RAMP.flatMap(rgb3));

  constructor(
    private readonly gl: WebGL2RenderingContext,
    readonly cap: number,
  ) {
    this.upd = compile(gl, UPDATE_VS, NOP_FS, ['o0', 'o1', 'o2']);
    this.drw = compile(gl, DRAW_VS, DRAW_FS);
    this.uu = uniforms(gl, this.upd, UPDATE_U);
    this.du = uniforms(gl, this.drw, DRAW_U);
    this.emt = compile(gl, EMIT_VS, EMIT_FS);
    this.eu = uniforms(gl, this.emt, ['u_box', 'u_fire', 'u_bang'] as const);
    const init = this.dead();
    this.bufs = [0, 1].map(() => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, init, gl.DYNAMIC_COPY);
      return b;
    });
    this.vaos = this.bufs.map((b) => {
      const v = gl.createVertexArray();
      gl.bindVertexArray(v);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      for (let k = 0; k < 3; k++) {
        gl.enableVertexAttribArray(k);
        gl.vertexAttribPointer(k, 4, gl.FLOAT, false, F * 4, k * 16);
      }
      return v;
    });
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.tf = gl.createTransformFeedback();
    this.until = new Float64Array(Math.ceil(cap / CHUNK));
  }

  /** Every slot dead: age 1, life 0. */
  private dead(): Float32Array {
    const init = new Float32Array(this.cap * F);
    for (let i = 0; i < this.cap; i++) init[i * F + 6] = 1;
    return init;
  }

  /** About how many cells are alive (what was let go in the last three seconds). */
  get live(): number {
    let n = this.staged;
    for (const s of this.spawned) n += s;
    return Math.min(this.cap, n);
  }

  add(
    kind: CKind,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    th: number,
    rgb: number,
  ): void {
    // a full stage, or one that has reached the end of the ring, goes up first
    if (this.staged * F >= this.stage.length || this.stageAt + this.staged >= this.cap)
      this.upload();
    if (this.staged === 0) this.stageAt = this.head;
    const o = this.staged * F;
    const S = this.stage;
    S[o] = x;
    S[o + 1] = y;
    S[o + 2] = Math.max(0, z);
    S[o + 3] = vx;
    S[o + 4] = vy;
    S[o + 5] = vz;
    S[o + 6] = 0;
    S[o + 7] = life;
    S[o + 8] = th;
    S[o + 9] = kind;
    S[o + 10] = rgb;
    S[o + 11] = (th * 977 + this.tick) % 1024;
    this.staged++;
    // two ticks to spare, so both buffers hold the chunk's cells dead before it is left alone
    const c = (this.head / CHUNK) | 0;
    const end = this.now + Math.ceil(life * 60) + 3;
    if (end > this.until[c]!) this.until[c] = end;
    this.head = (this.head + 1) % this.cap;
  }

  /** A whirlpool this tick (see `Cells.swirl`). */
  swirl(x: number, y: number, R: number, kdt: number): void {
    if (this.swirls.length < MAX_SWIRLS * 4) this.swirls.push(x, y, R, kdt);
  }

  private upload(): void {
    if (this.staged === 0) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs[this.cur]!);
    gl.bufferSubData(gl.ARRAY_BUFFER, this.stageAt * F * 4, this.stage, 0, this.staged * F);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    if (this.spawned.length === 0) this.spawned.push(0);
    this.spawned[this.spawned.length - 1]! += this.staged;
    this.staged = 0;
  }

  /** One tick: what was let go goes up, then every cell is carried, ages and burns out. */
  step(
    dt: number,
    rings: readonly Ring[],
    gusts: readonly Gust[],
    movers: Float32Array,
    nMovers: number,
  ): void {
    if (this.tick % 15 === 0) {
      this.spawned.push(0);
      if (this.spawned.length > 12) this.spawned.shift();
    }
    this.tick++;
    this.now++;
    this.upload();
    const runs = this.runs;
    runs.length = 0;
    for (let c = 0; c < this.until.length; c++) {
      if (this.until[c]! <= this.now) continue;
      const first = c * CHUNK;
      const n = Math.min(CHUNK, this.cap - first);
      const last = runs.length - 2;
      if (last >= 0 && runs[last]! + runs[last + 1]! === first) runs[last + 1]! += n;
      else runs.push(first, n);
    }
    if (runs.length === 0 || ++this.unseen > UNSEEN) {
      if (runs.length) this.owed += dt;
      else this.owed = 0;
      this.swirls.length = 0;
      return;
    }
    const gl = this.gl;
    const u = this.uu;
    gl.useProgram(this.upd);
    gl.uniform1f(u.u_dt, dt);
    gl.uniform1f(u.u_aged, dt + this.owed);
    this.owed = 0;
    gl.uniform1f(u.u_tick, this.tick % 8192);
    gl.uniform2f(u.u_wind, WIND[0], WIND[1]);
    const nr = Math.min(MAX_RINGS, rings.length);
    for (let i = 0; i < nr; i++) {
      const g = rings[rings.length - nr + i]!;
      this.ra.set([g.x, g.y, g.z, g.vz], i * 4);
      this.rb.set([g.R, g.r, g.spin, ringStrength(g)], i * 4);
    }
    gl.uniform1i(u.u_nr, nr);
    gl.uniform4fv(u.u_ra, this.ra);
    gl.uniform4fv(u.u_rb, this.rb);
    const ng = Math.min(MAX_GUSTS, gusts.length);
    for (let i = 0; i < ng; i++) {
      const g = gusts[gusts.length - ng + i]!;
      this.ga.set([g.x, g.y, g.z, g.R], i * 4);
      this.gb[i] = g.v;
    }
    gl.uniform1i(u.u_ng, ng);
    gl.uniform4fv(u.u_ga, this.ga);
    gl.uniform1fv(u.u_gb, this.gb);
    const nm = Math.min(MAX_MOVERS, nMovers);
    for (let m = 0; m < nm; m++) {
      const o = m * 7;
      this.ma.set([movers[o]!, movers[o + 1]!, movers[o + 2]!, movers[o + 6]!], m * 4);
      this.mb.set([movers[o + 3]!, movers[o + 4]!, movers[o + 5]!, 0], m * 4);
    }
    gl.uniform1i(u.u_nm, nm);
    gl.uniform4fv(u.u_ma, this.ma);
    gl.uniform4fv(u.u_mb, this.mb);
    this.sw.fill(0);
    this.sw.set(this.swirls.slice(0, MAX_SWIRLS * 4));
    gl.uniform1i(u.u_ns, Math.min(MAX_SWIRLS, this.swirls.length / 4));
    gl.uniform4fv(u.u_sw, this.sw);
    this.swirls.length = 0;

    const next = 1 - this.cur;
    gl.bindVertexArray(this.vaos[this.cur]!);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.tf);
    gl.enable(gl.RASTERIZER_DISCARD);
    for (let i = 0; i < runs.length; i += 2) {
      const first = runs[i]!;
      const n = runs[i + 1]!;
      gl.bindBufferRange(
        gl.TRANSFORM_FEEDBACK_BUFFER,
        0,
        this.bufs[next]!,
        first * F * 4,
        n * F * 4,
      );
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, first, n);
      gl.endTransformFeedback();
    }
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindVertexArray(null);
    this.cur = next;
  }

  /**
   * Draw one pass (0 smoke and cool fire, 1 hot fire and bang, 2 glow). Blending is the
   * caller's: premultiplied for 0 and 1, additive for 2.
   */
  draw(
    v: GasView,
    lights: Lights,
    pass: 0 | 1 | 2,
    amb?: Float32Array,
    relief?: ReliefLayer,
  ): void {
    this.upload();
    this.unseen = 0;
    const runs = this.runs;
    if (runs.length === 0) return;
    const gl = this.gl;
    const u = this.du;
    gl.useProgram(this.drw);
    gl.uniform2f(u.u_view, v.w, v.h);
    gl.uniform2f(u.u_origin, v.ox, v.oy);
    gl.uniform1f(u.u_cell, v.scale / v.grid);
    gl.uniform1f(u.u_grid, v.grid);
    gl.uniform1f(u.u_ys, v.ys);
    gl.uniform1f(u.u_cosP, v.cosP);
    relief?.bind(2, u.u_relief, u.u_rgrid, u.u_rface);
    gl.uniform1i(u.u_pass, pass);
    gl.uniform3fv(u.u_fire, this.fireRamp);
    gl.uniform3fv(u.u_bang, this.bangRamp);
    gl.uniform3fv(u.u_hot, rgb3(HOT));
    gl.uniform1i(u.u_lcount, lights.count);
    gl.uniform4fv(u.u_lpos, lights.pos);
    gl.uniform3fv(u.u_lcol, lights.col);
    if (amb) gl.uniform3fv(u.u_amb, amb);
    else gl.uniform3f(u.u_amb, 1, 1, 1);
    gl.bindVertexArray(this.vaos[this.cur]!);
    for (let i = 0; i < runs.length; i += 2) gl.drawArrays(gl.POINTS, runs[i]!, runs[i + 1]!);
    gl.bindVertexArray(null);
  }

  /**
   * The flames as light, into the light map bound to be drawn into (`box`: the ground it
   * covers, x, y, width, height). Between LightBlock's `begin` and `end`.
   */
  emit(box: Float32Array): void {
    this.upload();
    const runs = this.runs;
    if (runs.length === 0) return;
    const gl = this.gl;
    gl.useProgram(this.emt);
    gl.uniform4fv(this.eu.u_box, box);
    gl.uniform3fv(this.eu.u_fire, this.fireRamp);
    gl.uniform3fv(this.eu.u_bang, this.bangRamp);
    gl.bindVertexArray(this.vaos[this.cur]!);
    for (let i = 0; i < runs.length; i += 2) gl.drawArrays(gl.POINTS, runs[i]!, runs[i + 1]!);
    gl.bindVertexArray(null);
  }

  clear(): void {
    const gl = this.gl;
    const init = this.dead();
    for (const b of this.bufs) {
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, init);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.staged = 0;
    this.head = 0;
    this.until.fill(0);
    this.owed = 0;
    this.runs.length = 0;
    this.spawned = [];
    this.swirls.length = 0;
  }

  dispose(): void {
    const gl = this.gl;
    for (const b of this.bufs) gl.deleteBuffer(b);
    for (const v of this.vaos) gl.deleteVertexArray(v);
    gl.deleteTransformFeedback(this.tf);
  }
}
