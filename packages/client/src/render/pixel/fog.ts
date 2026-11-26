import { compile, FxRng, texture, uniforms, type Sources } from './gl';
import type { Lights } from './lighting';
import { MAX_CONES, MAX_LIGHTS } from './lighting';
import type { ReliefLayer } from './relief-layer';
import { depthRange, type StackView } from './stack-batch';
import { GROUND_VS, SKY_GLSL } from './stack-shaders';

/**
 * Ground fog: a low white blanket that lies in the hollows, rolls with the wind and is pushed
 * about by whatever drives through it. Looks only: the sim never knows.
 *
 * Two halves. The air over the whole map is a small fluid (`FogFluid`: Jos Stam's stable fluids,
 * as in keijiro's StableFluids: carry the flow along itself, make it free of sources, carry the
 * fog along the flow), a few thousand cells stepped thirty times a second, so a car leaves a
 * wake that curls shut behind it and a blast blows a hole that fills from its edges. The fog
 * itself is drawn the way everything here is, as a stack: a few flat sheets one over the other
 * (`FogPass`), each tested against the depth of what was drawn before it, so a car stands in it
 * to its sills, a drum is under it and a tree comes up out of it. It is not a volume, only a
 * mesh and a shader, which is why a phone can afford it.
 */

/** Things that stir the fog in one step: cars, rockets, blasts. */
export const MAX_STIRS = 16;
/** Fluid steps a second, and how many times the pressure is relaxed in each. */
const RATE = 30;
const RELAX = 6;
/** The most cells along the fluid's longer side, and the fewest art px to a cell. */
const CELLS = 320;
const MIN_CELL = 6;
/** Seconds for a hole to fill, and for the fog's pattern to forget it was pushed. */
const REFILL = 2.6;
const FORGET = 5;
/** How high the sheets lie over the ground (art px), lowest first. */
export const FOG_SHEETS = [1.5, 3.5, 5.5] as const;

/** The fluid's size for a world: cells across and down, and art px to the cell. */
export function fogGrid(w: number, h: number): { gw: number; gh: number; cell: number } {
  const cell = Math.max(MIN_CELL, Math.max(w, h) / CELLS);
  return { gw: Math.max(2, Math.ceil(w / cell)), gh: Math.max(2, Math.ceil(h / cell)), cell };
}

const FULL_VS = `#version 300 es
out vec2 v_uv;
void main() {
  int id = gl_VertexID % 3;
  vec2 p = vec2(id == 1 ? 3.0 : -1.0, id == 2 ? 3.0 : -1.0);
  v_uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const STIR_GLSL = `
uniform int u_n;
uniform vec4 u_sa[${MAX_STIRS}];  // from x, y, to x, y (art px): where it was a step ago, and is
uniform vec4 u_sv[${MAX_STIRS}];  // its speed x, y (px a second), how hard it shoves outwards, how much fog it clears
uniform float u_sr[${MAX_STIRS}]; // how wide
// How much of stir i reaches p (0 to 1), and which way out from its path p lies.
float stir(int i, vec2 p, out vec2 away) {
  vec2 a = u_sa[i].xy, ab = u_sa[i].zw - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
  vec2 d = p - (a + ab * t);
  float l = length(d);
  away = l > 0.001 ? d / l : vec2(0.0);
  float q = l / u_sr[i];
  return q >= 2.0 ? 0.0 : exp(-q * q * 1.6);
}`;

/** Carry the flow along itself, slow it a little, and add what stirs it. */
const FLOW_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_vel;
uniform vec2 u_world;
uniform float u_dt;
out vec4 o;${STIR_GLSL}
void main() {
  vec2 p = v_uv * u_world;
  vec2 v = texture(u_vel, v_uv).xy;
  v = texture(u_vel, (p - v * u_dt) / u_world).xy * exp(-u_dt * 0.9);
  for (int i = 0; i < ${MAX_STIRS}; i++) {
    if (i >= u_n) break;
    vec2 away;
    float g = stir(i, p, away);
    if (g <= 0.0) continue;
    v = mix(v, u_sv[i].xy * 0.7 + away * u_sv[i].z, min(1.0, g * 1.2));
  }
  // (still air at the edge of the map)
  vec2 e = min(v_uv, 1.0 - v_uv) * u_world;
  v *= clamp(min(e.x, e.y) / 24.0, 0.0, 1.0);
  o = vec4(v, 0.0, 1.0);
}`;

/** How much the flow spreads or gathers at each cell. */
const SPREAD_FS = `#version 300 es
precision highp float;
uniform sampler2D u_vel;
out vec4 o;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy), m = textureSize(u_vel, 0) - 1;
  float l = texelFetch(u_vel, clamp(c - ivec2(1, 0), ivec2(0), m), 0).x;
  float r = texelFetch(u_vel, clamp(c + ivec2(1, 0), ivec2(0), m), 0).x;
  float d = texelFetch(u_vel, clamp(c - ivec2(0, 1), ivec2(0), m), 0).y;
  float u = texelFetch(u_vel, clamp(c + ivec2(0, 1), ivec2(0), m), 0).y;
  o = vec4(0.5 * (r - l + u - d), 0.0, 0.0, 1.0);
}`;

/** One relaxing of the pressure that would undo that spreading (Jacobi). */
const PRESS_FS = `#version 300 es
precision highp float;
uniform sampler2D u_prs;
uniform sampler2D u_div;
out vec4 o;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy), m = textureSize(u_prs, 0) - 1;
  float l = texelFetch(u_prs, clamp(c - ivec2(1, 0), ivec2(0), m), 0).x;
  float r = texelFetch(u_prs, clamp(c + ivec2(1, 0), ivec2(0), m), 0).x;
  float d = texelFetch(u_prs, clamp(c - ivec2(0, 1), ivec2(0), m), 0).x;
  float u = texelFetch(u_prs, clamp(c + ivec2(0, 1), ivec2(0), m), 0).x;
  o = vec4((l + r + d + u - texelFetch(u_div, c, 0).x) * 0.25, 0.0, 0.0, 1.0);
}`;

/** Take the pressure's slope out of the flow: what is left neither spreads nor gathers, it swirls. */
const SWIRL_FS = `#version 300 es
precision highp float;
uniform sampler2D u_vel;
uniform sampler2D u_prs;
out vec4 o;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy), m = textureSize(u_prs, 0) - 1;
  float l = texelFetch(u_prs, clamp(c - ivec2(1, 0), ivec2(0), m), 0).x;
  float r = texelFetch(u_prs, clamp(c + ivec2(1, 0), ivec2(0), m), 0).x;
  float d = texelFetch(u_prs, clamp(c - ivec2(0, 1), ivec2(0), m), 0).x;
  float u = texelFetch(u_prs, clamp(c + ivec2(0, 1), ivec2(0), m), 0).x;
  o = vec4(texelFetch(u_vel, c, 0).xy - 0.5 * vec2(r - l, u - d), 0.0, 1.0);
}`;

/**
 * Carry the fog along the flow. What is kept for each cell is how far the fog there has been
 * pushed from where it lay (x, y: the picture of the fog is read that far back, so its wisps
 * are dragged and curled) and how much of it has been cleared away (z). Both mend with time.
 */
const CARRY_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_vel;
uniform sampler2D u_dye;
uniform vec2 u_world;
uniform float u_dt;
uniform vec2 u_wind;
out vec4 o;${STIR_GLSL}
void main() {
  vec2 p = v_uv * u_world;
  vec2 v = texture(u_vel, v_uv).xy;
  // (the wind the fog drifts on takes its holes and its wakes along too)
  vec3 k = texture(u_dye, (p - (v + u_wind) * u_dt) / u_world).xyz;
  vec2 off = (k.xy + v * u_dt) * exp(-u_dt / ${FORGET.toFixed(1)});
  float far = length(off);
  if (far > 70.0) off *= 70.0 / far;
  float gone = k.z * exp(-u_dt / ${REFILL.toFixed(1)});
  for (int i = 0; i < ${MAX_STIRS}; i++) {
    if (i >= u_n) break;
    vec2 away;
    gone = max(gone, stir(i, p, away) * u_sv[i].w);
  }
  o = vec4(off, min(gone, 1.0), 1.0);
}`;

/** One thing stirring the fog. */
export interface Stir {
  /** Where it was a step ago and where it is (art px). */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  vx: number;
  vy: number;
  /** How wide (art px), how hard it shoves the air outwards (px a second), how much fog it clears (0 to 1). */
  r: number;
  push: number;
  clear: number;
}

/**
 * The air over the map as a fluid on the GPU. Needs a float target to draw into; where there is
 * none (`ok` false) the fog still lies and drifts, and nothing pushes it.
 */
export class FogFluid {
  readonly ok: boolean;
  private gw = 0;
  private gh = 0;
  private ww = 1;
  private wh = 1;
  private readonly fbo: WebGLFramebuffer | null = null;
  private readonly vao: WebGLVertexArrayObject | null = null;
  private vel: WebGLTexture[] = [];
  private prs: WebGLTexture[] = [];
  private dye: WebGLTexture[] = [];
  private div: WebGLTexture | null = null;
  private readonly still: WebGLTexture;
  private progs: {
    flow: WebGLProgram;
    spread: WebGLProgram;
    press: WebGLProgram;
    swirl: WebGLProgram;
    carry: WebGLProgram;
    u: Record<
      'flow' | 'spread' | 'press' | 'swirl' | 'carry',
      Record<string, WebGLUniformLocation | null>
    >;
  } | null = null;
  private owed = 0;
  private readonly sa = new Float32Array(MAX_STIRS * 4);
  private readonly sv = new Float32Array(MAX_STIRS * 4);
  private readonly sr = new Float32Array(MAX_STIRS);
  /** Steps taken (for tests and the perf readout). */
  steps = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.ok = !!gl.getExtension('EXT_color_buffer_float');
    // (what the fog reads when nothing can stir it: nowhere pushed, nothing cleared)
    this.still = texture(gl, gl.NEAREST);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array(4),
    );
    if (!this.ok) return;
    this.fbo = gl.createFramebuffer();
    this.vao = gl.createVertexArray();
  }

  /** A new world: still air over all of it. */
  reset(w: number, h: number): void {
    this.ww = w;
    this.wh = h;
    this.owed = 0;
    if (!this.ok) return;
    const gl = this.gl;
    const { gw, gh } = fogGrid(w, h);
    for (const t of [...this.vel, ...this.prs, ...this.dye, this.div]) if (t) gl.deleteTexture(t);
    this.gw = gw;
    this.gh = gh;
    const make = () => {
      const t = texture(gl, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gw, gh, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return t;
    };
    this.vel = [make(), make()];
    this.prs = [make(), make()];
    this.dye = [make(), make()];
    this.div = make();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private build(): NonNullable<FogFluid['progs']> {
    const gl = this.gl;
    const flow = compile(gl, FULL_VS, FLOW_FS);
    const spread = compile(gl, FULL_VS, SPREAD_FS);
    const press = compile(gl, FULL_VS, PRESS_FS);
    const swirl = compile(gl, FULL_VS, SWIRL_FS);
    const carry = compile(gl, FULL_VS, CARRY_FS);
    const stirs = ['u_n', 'u_sa', 'u_sv', 'u_sr', 'u_world', 'u_dt'] as const;
    return {
      flow,
      spread,
      press,
      swirl,
      carry,
      u: {
        flow: uniforms(gl, flow, ['u_vel', ...stirs]),
        spread: uniforms(gl, spread, ['u_vel']),
        press: uniforms(gl, press, ['u_prs', 'u_div']),
        swirl: uniforms(gl, swirl, ['u_vel', 'u_prs']),
        carry: uniforms(gl, carry, ['u_vel', 'u_dye', 'u_wind', ...stirs]),
      },
    };
  }

  /**
   * Move the air on by `dt` seconds of the race, stirred by `stirs`, the fog drifting on `wind`. Steps are whole (a thirtieth
   * of a second), two a frame at most; `force` takes one whatever the clock says. Returns how many
   * were taken. Leaves the
   * framebuffer and viewport at `target`, `W` by `H`, blending and depth testing off.
   */
  advance(
    dt: number,
    stirs: readonly Stir[],
    wind: readonly [number, number],
    target: WebGLFramebuffer | null,
    W: number,
    H: number,
    force = false,
  ): number {
    if (!this.ok || !this.gw) return 0;
    this.owed = Math.min(this.owed + dt, 2 / RATE);
    let n = Math.floor(this.owed * RATE + 1e-6);
    if (force && n < 1) n = 1;
    if (n < 1) return 0;
    this.owed = Math.max(0, this.owed - n / RATE);
    const gl = this.gl;
    const P = (this.progs ??= this.build());
    const m = Math.min(stirs.length, MAX_STIRS);
    for (let i = 0; i < m; i++) {
      const s = stirs[i]!;
      this.sa.set([s.ax, s.ay, s.bx, s.by], i * 4);
      this.sv.set([s.vx, s.vy, s.push, s.clear], i * 4);
      this.sr[i] = s.r;
    }
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.gw, this.gh);
    gl.bindVertexArray(this.vao);
    const into = (t: WebGLTexture) =>
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const bind = (unit: number, t: WebGLTexture, at: WebGLUniformLocation | null) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(at, unit);
    };
    const stirred = (u: Record<string, WebGLUniformLocation | null>, count: number) => {
      gl.uniform1i(u.u_n!, count);
      gl.uniform4fv(u.u_sa!, this.sa);
      gl.uniform4fv(u.u_sv!, this.sv);
      gl.uniform1fv(u.u_sr!, this.sr);
      gl.uniform2f(u.u_world!, this.ww, this.wh);
      gl.uniform1f(u.u_dt!, 1 / RATE);
    };
    const tri = () => gl.drawArrays(gl.TRIANGLES, 0, 3);
    for (let s = 0; s < n; s++) {
      // (what stirs it is laid along its whole path in the first step, and not again)
      const count = s === 0 ? m : 0;
      gl.useProgram(P.flow);
      into(this.vel[1]!);
      bind(0, this.vel[0]!, P.u.flow.u_vel!);
      stirred(P.u.flow, count);
      tri();
      gl.useProgram(P.spread);
      into(this.div!);
      bind(0, this.vel[1]!, P.u.spread.u_vel!);
      tri();
      gl.useProgram(P.press);
      bind(1, this.div!, P.u.press.u_div!);
      for (let i = 0; i < RELAX; i++) {
        into(this.prs[1]!);
        bind(0, this.prs[0]!, P.u.press.u_prs!);
        tri();
        this.prs.reverse();
      }
      gl.useProgram(P.swirl);
      into(this.vel[0]!);
      bind(0, this.vel[1]!, P.u.swirl.u_vel!);
      bind(1, this.prs[0]!, P.u.swirl.u_prs!);
      tri();
      gl.useProgram(P.carry);
      into(this.dye[1]!);
      bind(0, this.vel[0]!, P.u.carry.u_vel!);
      bind(1, this.dye[0]!, P.u.carry.u_dye!);
      stirred(P.u.carry, count);
      gl.uniform2f(P.u.carry.u_wind!, wind[0], wind[1]);
      tri();
      this.dye.reverse();
      this.steps++;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, W, H);
    return n;
  }

  /** How the fog has been pushed and cleared, for the pass that draws it. */
  get pushed(): WebGLTexture {
    return this.dye[0] ?? this.still;
  }

  dispose(): void {
    const gl = this.gl;
    for (const t of [...this.vel, ...this.prs, ...this.dye, this.div, this.still])
      if (t) gl.deleteTexture(t);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    if (this.vao) gl.deleteVertexArray(this.vao);
  }
}

/** The side of the fog's picture: two soft cloudy patterns that repeat, one to a channel. */
const NOISE = 128;

/** Cloudy noise that tiles: a few sizes of soft blobs laid over each other, 0 to 255. */
export function fogNoise(size = NOISE, seed = 0x51f06): Uint8Array {
  const out = new Uint8Array(size * size * 2);
  const rng = new FxRng(seed);
  for (let ch = 0; ch < 2; ch++) {
    const sum = new Float32Array(size * size);
    let weight = 0;
    for (let cells = 4, amp = 1; cells <= 32; cells *= 2, amp *= 0.5) {
      const lat = new Float32Array(cells * cells);
      for (let i = 0; i < lat.length; i++) lat[i] = rng.next();
      const at = (x: number, y: number) => lat[(y % cells) * cells + (x % cells)]!;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const gx = (x / size) * cells;
          const gy = (y / size) * cells;
          const ix = Math.floor(gx);
          const iy = Math.floor(gy);
          let fx = gx - ix;
          let fy = gy - iy;
          fx = fx * fx * (3 - 2 * fx);
          fy = fy * fy * (3 - 2 * fy);
          const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * fx;
          const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * fx;
          sum[y * size + x]! += (a + (b - a) * fy) * amp;
        }
      weight += amp;
    }
    // (stretched to fill 0 to 1, so the thresholds the shader cuts it at mean the same every time)
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of sum) {
      lo = Math.min(lo, v / weight);
      hi = Math.max(hi, v / weight);
    }
    for (let i = 0; i < sum.length; i++)
      out[i * 2 + ch] = Math.round(((sum[i]! / weight - lo) / (hi - lo)) * 255);
  }
  return out;
}

const fogFs = (relief: boolean): string => `#version 300 es
${relief ? '#define RELIEF' : ''}
precision highp float;
precision highp int;
in vec2 v_uv;
uniform vec2 u_size;
uniform sampler2D u_noise;
uniform sampler2D u_dye;
uniform float u_z;       // how high this sheet lies over the ground
uniform float u_k;       // which sheet, 0 the lowest to 1 the highest
uniform float u_rise;    // ground px a thing shows further up the picture for each px it is high
uniform vec4 u_depth;    // depth along the view: y * x + height * y, less z, times w
uniform float u_amount;  // how much fog, 0 to 1
uniform float u_alpha;   // how much one sheet hides
uniform float u_time;
uniform vec2 u_wind;     // px a second the fog drifts
uniform vec3 u_col;      // the fog in the sky's light
uniform float u_lk;      // how much lamps and fires light it (none by day)
uniform vec2 u_low;      // on raised ground: full fog below x, none above y
uniform vec4 u_lpos[${MAX_LIGHTS}];
uniform vec3 u_lcol[${MAX_LIGHTS}];
uniform int u_lcount;
#ifdef RELIEF
uniform sampler2D u_map;
uniform float u_hk;      // height for one row of the map's shift
#endif
out vec4 o;${SKY_GLSL}
void main() {
  // the ground that a thing u_z high shows over at this pixel, and how high that ground stands
  vec2 wp = v_uv * u_size;
  wp.y += u_z * u_rise;
  float gh = 0.0;
  float thin = 1.0;
#ifdef RELIEF
  float shift = floor(texelFetch(u_map, ivec2(clamp(floor(wp), vec2(0.0), u_size - 1.0)), 0).r * 255.0 + 0.5);
  wp.y += shift;
  gh = shift * u_hk;
  // it lies in the low ground and thins out up the banks: none on a hilltop or a raised road
  thin = 1.0 - smoothstep(u_low.x, u_low.y, gh);
  if (thin <= 0.0) discard;
#endif
  vec4 dye = texture(u_dye, wp / u_size);
  // the fog's own picture: two cloudy patterns sliding over each other on the wind, read where
  // the fog here was before the flow carried it (so a wake drags and curls the wisps)
  vec2 q = wp - dye.xy + u_k * vec2(5.0, -3.0);
  float n = texture(u_noise, (q - u_wind * u_time) / 230.0).r * 0.52
    + texture(u_noise, (q * vec2(1.0, 1.25) - u_wind.yx * vec2(-0.7, 1.6) * u_time) / 83.0 + 0.37).g * 0.32
    + texture(u_noise, (q - u_wind * 2.2 * u_time) / 31.0 + 0.71).r * 0.16;
  // banks of it with clear ground between, fewer and smaller the higher the sheet: a bank is
  // thick in its middle and its top is a smaller shape than its foot
  float from = mix(0.72, 0.36, u_amount) + u_k * 0.07;
  float a = smoothstep(from, from + 0.17, n) * (1.0 - dye.z) * thin * u_alpha;
  if (a < 0.012) discard;
  vec3 c = u_col * (0.9 + 0.1 * n + 0.06 * u_k);
  if (u_lk > 0.0) {
    // lamps and fires in the fog: it takes their colour, more than the ground under it does
    vec3 l = vec3(0.0);
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (i >= u_lcount) break;
      vec4 lp = u_lpos[i];
      float dist = length(wp - lp.xy);
      if (dist >= lp.z) continue;
      float e = 1.0 - dist / lp.z;
      l += u_lcol[i] * e * e * min(lp.w, 1.4) * level(u_lgz[i], gh, dist);
    }
    for (int i = 0; i < ${MAX_CONES}; i++) {
      if (i >= u_ccount) break;
      float f = beam(wp, u_cone[i], u_coneh[i].w);
      if (f <= 0.0) continue;
      float far = distance(wp, u_cone[i].xy);
      l += vec3(1.0, 0.93, 0.74) * min(f, 0.8) * 0.6 * level(u_coneh[i].y + u_coneh[i].x + u_coneh[i].z * far, gh, far);
    }
    c += l * u_lk;
  }
  o = vec4(shoulder(c) * a, a);
  gl_FragDepth = clamp(1.0 - (wp.y * u_depth.x + (gh + u_z) * u_depth.y - u_depth.z) * u_depth.w, 0.0, 1.0);
}`;

export interface FogLook {
  /** How much fog, 0 to 1. */
  amount: number;
  /** Seconds of the race, and the wind (px a second). */
  time: number;
  wind: readonly [number, number];
  /** The sky's light on open ground, and how dark it is (0 day to 1 night). */
  light: Float32Array;
  dark: number;
  /** How many sheets to draw (1 to 3: fewer on a phone that is struggling). */
  sheets: number;
}

/** The fog drawn: its sheets, lowest first, over everything that has written depth. */
export class FogPass {
  private prog: WebGLProgram | null = null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private reliefMap = false;
  private readonly vao: WebGLVertexArrayObject;
  private readonly noise: WebGLTexture;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.vao = gl.createVertexArray();
    this.noise = texture(gl, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, NOISE, NOISE, 0, gl.RG, gl.UNSIGNED_BYTE, fogNoise());
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  /**
   * Draw the fog over the frame so far. Sets blending and the depth test as it needs them and
   * leaves blending on (colour times its cover) and the depth test off.
   */
  draw(
    v: StackView,
    lights: Lights,
    relief: ReliefLayer,
    size: readonly [number, number],
    pushed: WebGLTexture,
    look: FogLook,
  ): void {
    if (look.amount <= 0.01) return;
    const gl = this.gl;
    // (programs are kept by `compile`: the other one is there again when the ground changes back)
    if (this.prog && this.reliefMap !== !!relief.map) this.prog = null;
    if (!this.prog) {
      this.reliefMap = !!relief.map;
      this.prog = compile(gl, GROUND_VS, fogFs(this.reliefMap));
      this.u = uniforms(gl, this.prog, [
        'u_view',
        'u_origin',
        'u_scale',
        'u_ys',
        'u_size',
        'u_noise',
        'u_dye',
        'u_z',
        'u_k',
        'u_rise',
        'u_depth',
        'u_amount',
        'u_alpha',
        'u_time',
        'u_wind',
        'u_col',
        'u_lk',
        'u_low',
        'u_lpos',
        'u_lcol',
        'u_lcount',
        'u_cone',
        'u_ccount',
        'u_coneh',
        'u_lgz',
        'u_map',
        'u_hk',
      ]);
    }
    const u = this.u;
    gl.useProgram(this.prog);
    gl.uniform2f(u.u_view!, v.w, v.h);
    gl.uniform2f(u.u_origin!, v.ox, v.oy);
    gl.uniform1f(u.u_scale!, v.scale);
    gl.uniform1f(u.u_ys!, v.ys);
    gl.uniform2f(u.u_size!, size[0], size[1]);
    const dir0 = v.zk / v.scale;
    const [lo, hi] = depthRange(v);
    gl.uniform4f(u.u_depth!, dir0, v.ys, lo, 1 / (hi - lo));
    gl.uniform1f(u.u_rise!, dir0 / v.ys);
    gl.uniform1f(u.u_amount!, look.amount);
    gl.uniform1f(u.u_time!, look.time);
    gl.uniform2f(u.u_wind!, look.wind[0], look.wind[1]);
    // white by day, the night's own blue after dark, and only then lit by lamps
    const L = look.light;
    const night = Math.min(1, Math.max(0, (look.dark - 0.25) / 0.35));
    // (paler than the ground in the same light: fog is white, and takes less of a low sun's colour)
    const top = Math.max(L[0]!, L[1]!, L[2]!);
    const pale = (c: number) => c + (top - c) * 0.55;
    gl.uniform3f(u.u_col!, 0.95 * pale(L[0]!), 0.96 * pale(L[1]!), 0.98 * pale(L[2]!));
    gl.uniform1f(u.u_lk!, night * 0.45);
    // (the banks keep the lowest third of the venue's heights, and are gone by two thirds)
    const high = Math.max(relief.top, 12);
    gl.uniform2f(u.u_low!, high * 0.3, high * 0.65);
    gl.uniform1i(u.u_lcount!, lights.count);
    gl.uniform4fv(u.u_lpos!, lights.pos);
    gl.uniform3fv(u.u_lcol!, lights.col);
    gl.uniform4fv(u.u_cone!, lights.cones);
    gl.uniform1i(u.u_ccount!, lights.coneCount);
    gl.uniform4fv(u.u_coneh!, lights.coneh);
    gl.uniform1fv(u.u_lgz!, lights.gz);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.noise);
    gl.uniform1i(u.u_noise!, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, pushed);
    gl.uniform1i(u.u_dye!, 3);
    if (relief.map) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, relief.map);
      gl.uniform1i(u.u_map!, 1);
      gl.uniform1f(u.u_hk!, v.ys / dir0);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(false);
    gl.bindVertexArray(this.vao);
    const n = Math.max(1, Math.min(FOG_SHEETS.length, look.sheets));
    // (fewer sheets each hide more, so the fog is as thick whatever a phone can afford)
    const alpha = 1 - Math.pow(1 - 0.66, 1 / n);
    for (let i = 0; i < n; i++) {
      gl.uniform1f(u.u_z!, FOG_SHEETS[n === 1 ? 1 : i]!);
      gl.uniform1f(u.u_k!, n === 1 ? 0 : i / (FOG_SHEETS.length - 1));
      gl.uniform1f(u.u_alpha!, alpha);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.disable(gl.DEPTH_TEST);
  }

  dispose(): void {
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteTexture(this.noise);
  }
}

/** Every program this file draws with, to start building before any is needed (`prelink`). */
export const FOG_PROGRAMS: readonly Sources[] = [
  [GROUND_VS, fogFs(false)],
  [GROUND_VS, fogFs(true)],
  [FULL_VS, FLOW_FS],
  [FULL_VS, SPREAD_FS],
  [FULL_VS, PRESS_FS],
  [FULL_VS, SWIRL_FS],
  [FULL_VS, CARRY_FS],
];
