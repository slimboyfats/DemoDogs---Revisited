import { compile, texture, uniforms } from './gl';
import type { LightBlock } from './light-block';
import { CONE_REACH, MAX_CONES, MAX_LIGHTS, type Lights } from './lighting';
import { RELIEF_GLSL, type ReliefLayer } from './relief-layer';
import type { SunShadow } from './sun-shadow';
import { SUN_GLSL } from './sun-glsl';

/** Art px between the finest probes. Each coarser level's stand twice as far apart. */
export const PROBE = 4;
/** Levels of probes. The last one's rays end `reach(LEVELS)` art px out. */
export const LEVELS = 4;
/** The most steps a ray is walked in (the coarsest level's). */
const MAX_STEPS = 32;
/** How steeply light climbs: a thing `h` high is a whole wall to a ray up to `h / CLIMB` px off. */
const CLIMB = 0.55;
/** Heights are kept in a byte's worth of this many art px. */
const TALL = 64;

/** What one level of probes is: how its rays are laid out and walked. */
export interface Level {
  /** Directions a probe looks in are a `side` by `side` block of tiles in the level's texture. */
  side: number;
  /** Art px between its probes. */
  spacing: number;
  /** Where along a ray its stretch starts, and how long it is (art px). */
  from: number;
  length: number;
  /** Steps the stretch is walked in, and the scene's mip level read at each. */
  steps: number;
  lod: number;
}

/**
 * The levels, finest first. Each has four times the directions of the one below it, a quarter of
 * the probes, and walks a stretch four times as long that starts where the one below ends: so
 * every level is the same number of texels, and together a ray is whole from the probe out.
 */
export function levels(probe = PROBE, count = LEVELS): Level[] {
  const out: Level[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      side: 2 << i,
      spacing: probe << i,
      from: (probe * (4 ** i - 1)) / 3,
      length: probe * 4 ** i,
      steps: Math.min(MAX_STEPS, 4 << i),
      lod: i,
    });
  }
  return out;
}

/** How far the last level's rays go (art px). */
export const reach = (probe = PROBE, count = LEVELS): number => (probe * (4 ** count - 1)) / 3;

/**
 * Traced light: rays walked across the frame's map of what stands where (LightBlock), so light
 * goes where it really can. Three things come out of it, for every spot of ground in view:
 *
 * - the light thrown back by what stands lit (a red wall in the sun, a car in a headlamp's beam)
 *   on everything round it, in its own colour, and stopped by whatever is in between;
 * - the light of what glows (tail lights, lit windows, lamp heads), with no light made for it;
 * - how much of the sky the spot sees, so the foot of a wall and the gap between two buildings
 *   are in shade of their own.
 *
 * It is done with radiance cascades (Alexander Sannikov's way of tracing a whole field at once,
 * written here from its description): a grid of probes, each looking a few ways a short
 * distance, and coarser grids looking more ways further out, folded into each other from the
 * coarsest down. No noise comes out of it, so nothing is blurred or kept from frame to frame.
 *
 * The scene is flat (the map is laid on the ground), but height is not forgotten: what a ray
 * meets counts for as much as it stands high for how far off it is, so a kerb shades only its
 * own foot and a tower a long way round it, and light passes over a low thing far away.
 */
export class TracedLight {
  /** The field: light thrown about (rgb, half of what it is) and how open the sky is (alpha). */
  readonly tex: WebGLTexture;
  private readonly scene: WebGLTexture;
  private readonly rungs: [WebGLTexture, WebGLTexture];
  private readonly fbo: WebGLFramebuffer;
  private readonly vao: WebGLVertexArrayObject;
  private readonly float: boolean;
  private sw = 0;
  private sh = 0;
  private readonly lv = levels();
  private progs: {
    scene: WebGLProgram;
    us: Record<string, WebGLUniformLocation | null>;
    level: WebGLProgram;
    ul: Record<string, WebGLUniformLocation | null>;
    fold: WebGLProgram;
    uf: Record<string, WebGLUniformLocation | null>;
  } | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    // half floats where they can be drawn into; bytes do, a little coarser in dim light
    this.float = !!gl.getExtension('EXT_color_buffer_float');
    this.tex = texture(gl, gl.LINEAR);
    this.scene = texture(gl, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
    this.rungs = [texture(gl, gl.LINEAR), texture(gl, gl.LINEAR)];
    this.fbo = gl.createFramebuffer();
    this.vao = gl.createVertexArray();
  }

  private size(w: number, h: number): void {
    if (w === this.sw && h === this.sh) return;
    const gl = this.gl;
    this.sw = w;
    this.sh = h;
    const pw = w / PROBE;
    const ph = h / PROBE;
    const alloc = (t: WebGLTexture, tw: number, th: number, float: boolean) => {
      gl.bindTexture(gl.TEXTURE_2D, t);
      if (float)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, tw, th, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    };
    alloc(this.scene, w, h, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    alloc(this.rungs[0], pw * 2, ph * 2, this.float);
    alloc(this.rungs[1], pw * 2, ph * 2, this.float);
    alloc(this.tex, pw, ph, false);
  }

  /**
   * Trace the frame. `block` is the frame's map (already drawn), `sun` the sun's shadow map and
   * `sunc` its light (left out: no sun), `glow` how far lamps stand out (0 to 1).
   * Leaves the framebuffer and viewport at `target`, `w` by `h`.
   */
  trace(
    block: LightBlock,
    lights: Lights,
    relief: ReliefLayer,
    sun: SunShadow | null,
    sunc: readonly [number, number, number],
    glow: number,
    target: WebGLFramebuffer | null,
    w: number,
    h: number,
  ): void {
    const gl = this.gl;
    const [bw, bh] = block.size;
    if (bw < 1 || bh < 1) return;
    this.size(bw, bh);
    const P = (this.progs ??= this.build());
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.bindVertexArray(this.vao);
    const into = (t: WebGLTexture, tw: number, th: number) => {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.viewport(0, 0, tw, th);
    };
    const bindTex = (unit: number, t: WebGLTexture, at: WebGLUniformLocation | null) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(at, unit);
    };

    // 1: the scene the rays cross: what gives light off, and how high what stands there is
    into(this.scene, bw, bh);
    gl.useProgram(P.scene);
    const us = P.us;
    bindTex(0, block.tex, us.u_lm!);
    bindTex(1, block.col, us.u_lc!);
    bindTex(4, block.em, us.u_em!);
    gl.uniform4fv(us.u_lmbox!, block.box);
    relief.bind(2, us.u_relief!, us.u_rgrid!, us.u_rface!);
    if (sun) sun.bind(3, us.u_sh!, us.u_shbox!, us.u_shear!);
    else bindTex(3, block.col, us.u_sh!);
    gl.uniform3f(us.u_sunc!, sun ? sunc[0] : 0, sun ? sunc[1] : 0, sun ? sunc[2] : 0);
    gl.uniform1f(us.u_glow!, glow);
    gl.uniform4fv(us.u_lpos!, lights.pos);
    gl.uniform3fv(us.u_lcol!, lights.col);
    gl.uniform1i(us.u_lcount!, lights.count);
    gl.uniform4fv(us.u_cone!, lights.cones);
    gl.uniform1i(us.u_ccount!, lights.coneCount);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene);
    gl.generateMipmap(gl.TEXTURE_2D);

    // 2: the levels, coarsest first, each folding in the one above it
    const cw = (bw / PROBE) * 2;
    const ch = (bh / PROBE) * 2;
    gl.useProgram(P.level);
    const ul = P.ul;
    gl.uniform2f(ul.u_ssize!, bw, bh);
    gl.uniform2f(ul.u_csize!, cw, ch);
    let from = 0;
    for (let i = this.lv.length - 1; i >= 0; i--) {
      const L = this.lv[i]!;
      const to = 1 - from;
      into(this.rungs[to]!, cw, ch);
      bindTex(0, this.scene, ul.u_scene!);
      bindTex(1, this.rungs[from]!, ul.u_up!);
      gl.uniform4f(ul.u_c!, L.side, L.spacing, L.from, L.length);
      gl.uniform3f(ul.u_m!, L.steps, L.lod, i < this.lv.length - 1 ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      from = to;
    }

    // 3: every probe's rays added up: the light at that spot from all round
    into(this.tex, bw / PROBE, bh / PROBE);
    gl.useProgram(P.fold);
    bindTex(0, this.rungs[from]!, P.uf.u_low!);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, w, h);
  }

  /** Bind the field to texture unit `unit`. It lies over the same ground as the blockers' map. */
  bind(unit: number, sampler: WebGLUniformLocation | null): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(sampler, unit);
    gl.activeTexture(gl.TEXTURE0);
  }

  private build(): NonNullable<TracedLight['progs']> {
    const gl = this.gl;
    const scene = compile(gl, TRI_VS, SCENE_FS);
    const level = compile(gl, TRI_VS, LEVEL_FS);
    const fold = compile(gl, TRI_VS, FOLD_FS);
    return {
      scene,
      us: uniforms(gl, scene, [
        'u_lm',
        'u_lc',
        'u_em',
        'u_lmbox',
        'u_relief',
        'u_rgrid',
        'u_rface',
        'u_sh',
        'u_shbox',
        'u_shear',
        'u_sunc',
        'u_glow',
        'u_lpos',
        'u_lcol',
        'u_lcount',
        'u_cone',
        'u_ccount',
      ]),
      level,
      ul: uniforms(gl, level, ['u_scene', 'u_up', 'u_ssize', 'u_csize', 'u_c', 'u_m']),
      fold,
      uf: uniforms(gl, fold, ['u_low']),
    };
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.tex);
    gl.deleteTexture(this.scene);
    gl.deleteTexture(this.rungs[0]);
    gl.deleteTexture(this.rungs[1]);
    gl.deleteFramebuffer(this.fbo);
    gl.deleteVertexArray(this.vao);
    if (this.progs) {
      gl.deleteProgram(this.progs.scene);
      gl.deleteProgram(this.progs.level);
      gl.deleteProgram(this.progs.fold);
    }
  }
}

/** One triangle over the whole target. */
const TRI_VS = `#version 300 es
void main() {
  gl_Position = vec4(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0, 0.0, 1.0);
}`;

/**
 * The scene, one texel to the art px of the blockers' map. rgb: half the light the spot gives
 * off (what glows there, and its own colour times the light that falls on it: the sun where the
 * sun's map says it reaches, the frame's lights and beams by how near they are). Alpha: how
 * high what stands there is, 0 for what light passes (the ground, low things, a deck overhead).
 */
const SCENE_FS = `#version 300 es
precision highp float;
uniform highp sampler2D u_lm;
uniform sampler2D u_lc;
uniform sampler2D u_em;
uniform vec4 u_lmbox;
uniform vec3 u_sunc;
uniform float u_glow;
uniform vec4 u_lpos[${MAX_LIGHTS}];
uniform vec3 u_lcol[${MAX_LIGHTS}];
uniform int u_lcount;
uniform vec4 u_cone[${MAX_CONES}];
uniform int u_ccount;
${RELIEF_GLSL}
${SUN_GLSL}
out vec4 o;
// How much of a light falls on the side of what stands at t (\`top\` high) that a ray across the
// ground meets: all of it where the next thing towards the light (\`to\`, a unit vector) is lower,
// so the side is open to it; a little of it otherwise (what spills off a lit top).
float faces(ivec2 t, float top, vec2 to) {
  float next = texelFetch(u_lm, t + ivec2(floor(to * 2.5 + 0.5)), 0).r * 255.0 - 1.0;
  return next < top - 3.0 ? 1.0 : 0.15;
}
void main() {
  ivec2 t = ivec2(gl_FragCoord.xy);
  vec2 m = texelFetch(u_lm, t, 0).rg;
  vec3 e = texelFetch(u_em, t, 0).rgb * u_glow * 7.0;
  float solid = 0.0;
  if (m.r > 0.0) {
    float top = m.r * 255.0 - 1.0;
    float under = (1.0 - m.g) * 255.0;
    if (top >= 5.0 && under <= 4.0) solid = min(1.0, top / ${TALL.toFixed(1)});
    if (top >= 3.0) {
      vec2 wp = u_lmbox.xy + gl_FragCoord.xy;
      vec3 lit = vec3(0.0);
      float away = length(u_shear.xy);
      if (u_sunc.r + u_sunc.g + u_sunc.b > 0.0 && away > 0.001)
        lit = u_sunc * (1.0 - sunShade(vec3(wp, groundAt(wp) + top))) * faces(t, top, -u_shear.xy / away);
      for (int i = 0; i < ${MAX_LIGHTS}; i++) {
        if (i >= u_lcount) break;
        vec4 p = u_lpos[i];
        float d = distance(wp, p.xy);
        if (d >= p.z) continue;
        float f = 1.0 - d / p.z;
        lit += u_lcol[i] * f * (0.4 + 0.6 * f) * p.w * faces(t, top, (p.xy - wp) / max(d, 0.01));
      }
      for (int i = 0; i < ${MAX_CONES}; i++) {
        if (i >= u_ccount) break;
        vec4 c = u_cone[i];
        vec2 d = wp - c.xy;
        float along = dot(d, c.zw);
        if (along <= 0.0 || along >= ${CONE_REACH.toFixed(1)}) continue;
        float side = abs(d.x * c.w - d.y * c.z) / (2.5 + along * 0.34);
        if (side >= 1.0) continue;
        float f = 1.0 - along / ${CONE_REACH.toFixed(1)};
        lit += vec3(1.0, 0.93, 0.74) * f * (0.5 + 0.5 * f) * (1.0 - side * side) * 1.15 * faces(t, top, -c.zw);
      }
      e += texelFetch(u_lc, t, 0).rgb * lit * 1.5;
    }
  }
  o = vec4(min(vec3(1.0), e * 0.5), solid);
}`;

/**
 * One level of probes. The texture is `side` by `side` tiles, one for each direction; a texel in
 * a tile is one probe's ray that way. The ray's own stretch is walked across the scene, then
 * what the level above saw further out the same way (its four rays in this one's arc, at the
 * four probes round this one) is added behind it, as far as this stretch let light through.
 * rgb: the light that comes back along the ray. Alpha: how open the ray is to the sky.
 */
const LEVEL_FS = `#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform sampler2D u_up;
uniform vec2 u_ssize;
uniform vec2 u_csize;
uniform vec4 u_c;   // tiles to the side, px between probes, where the stretch starts, its length
uniform vec3 u_m;   // steps, the scene's mip level, 1: there is a level above
out vec4 o;
void main() {
  float side = u_c.x;
  vec2 tile = u_csize / side;
  vec2 tl = floor(gl_FragCoord.xy / tile);
  vec2 pc = gl_FragCoord.xy - tl * tile;
  float k = tl.y * side + tl.x;
  float ang = (k + 0.5) / (side * side) * 6.2831853;
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 p = pc * u_c.y;
  float n = u_m.x;
  float st = u_c.w / n;
  vec3 rad = vec3(0.0);
  float open = 1.0;
  // a probe inside something looks out of it: its light is for that thing's own faces
  bool inside = u_c.z < 0.5;
  for (int i = 0; i < ${MAX_STEPS}; i++) {
    if (float(i) >= n || open < 0.02) break;
    float r = u_c.z + (float(i) + 0.5) * st;
    vec2 uv = (p + dir * r) / u_ssize;
    if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) break;
    vec4 s = textureLod(u_scene, uv, u_m.y);
    if (inside) {
      if (s.a > 0.0) continue;
      inside = false;
    }
    float high = s.a * ${TALL.toFixed(1)};
    float far = r * ${CLIMB.toFixed(2)} + 1.0;
    rad += open * s.rgb * min(1.0, max(high, 4.0) / far);
    open *= 1.0 - min(1.0, high / far);
  }
  if (u_m.z > 0.5) {
    float s2 = side * 2.0;
    vec2 tile2 = u_csize / s2;
    vec2 up = clamp(pc * 0.5, vec2(0.5), tile2 - 0.5);
    vec4 acc = vec4(0.0);
    for (int j = 0; j < 4; j++) {
      float m = k * 4.0 + float(j);
      vec2 t2 = vec2(mod(m, s2), floor(m / s2));
      acc += texture(u_up, (t2 * tile2 + up) / u_csize);
    }
    acc *= 0.25;
    rad += open * acc.rgb;
    open *= acc.a;
  }
  o = vec4(rad, open);
}`;

/** The finest level's four rays at each probe, added up. */
const FOLD_FS = `#version 300 es
precision highp float;
uniform sampler2D u_low;
out vec4 o;
void main() {
  ivec2 half_ = textureSize(u_low, 0) / 2;
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(u_low, p, 0) + texelFetch(u_low, p + ivec2(half_.x, 0), 0)
    + texelFetch(u_low, p + ivec2(0, half_.y), 0) + texelFetch(u_low, p + half_, 0);
  o = a * 0.25;
}`;

/**
 * GLSL for what is lit by the field: `traced(wp)` is the light thrown about at the ground point
 * `wp` (rgb, half of what it is) and how open the sky is there (alpha). Needs `u_lmbox`.
 */
export const TRACED_GLSL = `
uniform sampler2D u_gi;
uniform float u_gik;   // 0: nothing is traced; 1: it is; 2: show the field itself
vec4 traced(vec2 wp) {
  if (u_gik <= 0.0) return vec4(0.0, 0.0, 0.0, 1.0);
  vec2 uv = (wp - u_lmbox.xy) / u_lmbox.zw;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return vec4(0.0, 0.0, 0.0, 1.0);
  return texture(u_gi, uv);
}`;
