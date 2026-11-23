/**
 * Shaders for the sprite-stack addon to mudders' pixel engine.
 *
 * A slice is one instanced quad. The vertex shader turns it like the canvas renderer does
 * (rotate on the ground, squash by the camera pitch, lift by height) and snaps its anchor to a
 * whole device pixel. It also gives every corner its true depth along the view direction, so the
 * depth buffer sorts slices pixel by pixel. That replaces the canvas renderer's per-frame sort,
 * and a car nosing into a tyre wall is hidden where it is behind it.
 *
 * The fragment shader reads the slice's texel straight from the atlas (texelFetch, no filtering),
 * fades with ordered-dither screen-door transparency, and adds the frame's point lights in hard
 * dithered bands, the way mudders lights its terrain.
 */

import { AZS, ELS } from './aux';
import { CONE_REACH, MAX_CONES, MAX_LIGHTS } from './lighting';

/** Slices higher than this (art px) are left out of wet ground's reflections. */
const MIRROR_TALL = 14;

export const STACK_VS = `#version 300 es
layout(location = 0) in vec4 a_pos;   // x, y, z (art px), lift (whole device px)
layout(location = 1) in float a_rot;
layout(location = 2) in vec4 a_uv;    // slice texel x, y, width, height
layout(location = 3) in float a_alpha;
layout(location = 4) in float a_res;   // texels per art px
layout(location = 5) in float a_tint;  // 0, or 1 + 0xRRGGBB: drawn in that one colour, a shade behind
uniform vec2 u_view;
uniform vec2 u_origin;   // device px of the world origin on the ground (whole pixels)
uniform float u_scale;
uniform float u_ys;
uniform vec2 u_dir;      // depth along the view: y * dir.x + z * dir.y
uniform vec2 u_drange;   // nearest depth, 1 / depth range
uniform float u_mirror;  // 1: the stacks upside down under the ground line (wet ground)
uniform float u_time;
uniform vec3 u_grow;     // a race rising out of the ground: focus x, y and how far it has got; z < 0: off
out vec2 v_tex;
out vec3 v_world;
flat out vec4 v_uv;
flat out float v_alpha;
flat out vec2 v_cs;
flat out float v_tint;
void main() {
  int id = gl_VertexID % 6;
  vec2 corner = vec2(id == 1 || id == 2 || id == 4 ? 1.0 : 0.0, id == 2 || id == 4 || id == 5 ? 1.0 : 0.0);
  vec2 local = (corner - 0.5) * a_uv.zw / a_res;
  float c = cos(a_rot), s = sin(a_rot);
  vec2 r = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vec2 anchor = floor(u_origin + vec2(a_pos.x * u_scale, a_pos.y * u_scale * u_ys) + 0.5);
  float lift = a_pos.w;
  float zz = a_pos.z;
  if (u_grow.z >= 0.0) {
    // rising slice by slice: the front climbs, later the further from the focus; a slice above
    // it waits on the ground and comes up as the front reaches it (after danielwh2's slice bloom)
    float f = u_grow.z - distance(a_pos.xy, u_grow.xy) * 0.14;
    float k = clamp((f - zz) / 7.0 + 1.0, 0.0, 1.0);
    k = k * k * (3.0 - 2.0 * k);
    lift = floor(lift * k + 0.5);
    zz *= k;
  }
  float up = 1.0;
  if (u_mirror > 0.5) {
    // the reflection: every slice as far below its foot as it stands above it, and rippled, each
    // row of the picture a step to one side or the other
    up = -1.0;
    anchor += vec2(floor(sin(lift * 0.45 + u_time * 2.6) * 1.5 + 0.5), lift);
  } else {
    anchor -= vec2(0.0, lift);
  }
  vec2 px = anchor + vec2(r.x * u_scale, r.y * u_scale * u_ys);
  v_world = vec3(a_pos.xy + r, zz);
  float d = v_world.y * u_dir.x + up * v_world.z * u_dir.y;
  // an outline copy sits a shade further off than the thing it outlines, so only its rim shows
  if (a_tint > 0.5) d -= 5.0;
  float far = clamp(1.0 - (d - u_drange.x) * u_drange.y, 0.0, 1.0);
  gl_Position = vec4(px.x / u_view.x * 2.0 - 1.0, 1.0 - px.y / u_view.y * 2.0, far * 2.0 - 1.0, 1.0);
  // only what stands low is mirrored (cars, drums, the foot of a tree): the rest would land far
  // down the screen, and every slice mirrored is a slice drawn twice
  if (u_mirror > 0.5 && (zz > ${MIRROR_TALL.toFixed(1)} || a_tint > 0.5)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  v_tex = corner * a_uv.zw;
  v_uv = a_uv;
  v_alpha = a_alpha;
  v_cs = vec2(c, s);
  v_tint = a_tint;
}`;

/** Helpers the ground and the stacks share, so the two agree to the cell. */
const SKY_GLSL = `
float bayer(ivec2 p) {
  int i = (p.y & 3) * 4 + (p.x & 3);
  int t[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(t[i]) + 0.5) / 16.0;
}
float hash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
// Soft noise, 0 to 1, in patches one unit across.
float soft(vec2 g) {
  vec2 i = floor(g);
  vec2 f = g - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Where water stands on wet ground, 0 to 1: soft patches a dozen art px across.
float puddle(vec2 wp) {
  return smoothstep(0.57, 0.7, soft(wp / 11.0));
}
// A headlamp's beam on the ground at wp: 0 outside it, brightest near the lamp.
uniform vec4 u_cone[${MAX_CONES}];  // x, y, unit direction
uniform int u_ccount;
float beam(vec2 wp, vec4 c) {
  vec2 d = wp - c.xy;
  float along = dot(d, c.zw);
  if (along <= 0.0 || along >= ${CONE_REACH.toFixed(1)}) return 0.0;
  float wide = 2.5 + along * 0.34;
  float side = abs(d.x * c.w - d.y * c.z) / wide;
  if (side >= 1.0) return 0.0;
  float e = 1.0 - along / ${CONE_REACH.toFixed(1)};
  return e * (0.5 + 0.5 * e) * (1.0 - side * side) * 1.15;
}`;

export const STACK_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_tex;
in vec3 v_world;
flat in vec4 v_uv;
flat in float v_alpha;
flat in vec2 v_cs;
flat in float v_tint;
uniform highp sampler2D u_atlas;
uniform highp sampler2D u_aux;
uniform vec4 u_lpos[${MAX_LIGHTS}];  // x, y, radius, strength
uniform vec3 u_lcol[${MAX_LIGHTS}];
uniform int u_lcount;
uniform float u_scale;
uniform vec2 u_view;
uniform vec2 u_origin;
uniform float u_ys;
uniform float u_lit;     // 0: flat, as before there was a sky (and no second texture read)
uniform vec3 u_amb;      // what every surface gets
uniform vec3 u_sun;      // what one square to the sun gets on top of that
uniform vec3 u_sdir;     // towards the sun
uniform float u_glow;    // how far lamps stand out, 0 to 1
uniform float u_snow;    // how much snow lies, 0 to 1
uniform float u_wet;     // how wet the ground is, 0 to 1
uniform float u_mirror;
out vec4 o;${SKY_GLSL}
void main() {
  if (u_mirror > 0.5) {
    // the reflection in wet ground shows through a screen door, most where water stands: the
    // cells that are not let through are turned away before anything is read
    vec2 dev = vec2(gl_FragCoord.x, u_view.y - gl_FragCoord.y);
    vec2 wp = (dev - u_origin) / vec2(u_scale, u_scale * u_ys);
    if (bayer(ivec2(floor(gl_FragCoord.xy * 0.5))) >= u_wet * (0.26 + 0.6 * puddle(wp))) discard;
  }
  vec4 c;
  ivec2 t = ivec2(0);
  bool stack = v_uv.y >= 0.0;
  if (!stack) {
    // a loose voxel: flat colour packed as 0xRRGGBB in the texel-x slot
    int p = int(v_uv.x + 0.5);
    c = vec4(float((p >> 16) & 255), float((p >> 8) & 255), float(p & 255), 255.0) / 255.0;
  } else {
    t = ivec2(v_uv.xy) + ivec2(clamp(floor(v_tex), vec2(0.0), v_uv.zw - 1.0));
    c = texelFetch(u_atlas, t, 0);
    if (c.a < 0.5) discard;
  }
  if (v_tint > 0.5) {
    // an outline copy: one flat colour, unlit
    int p = int(v_tint - 0.5);
    o = vec4(float((p >> 16) & 255), float((p >> 8) & 255), float(p & 255), 255.0) / 255.0;
    return;
  }
  // the dither and the light bands step on a grid three to the art pixel, as fine as the art
  ivec2 cell = ivec2(floor(v_world.xy * 3.0)) + ivec2(0, int(floor(v_world.z * 3.0)));
  float b = bayer(cell);
  // see-through in screen space, on cells as fine as the art: every slice of a stack leaves the
  // same holes, so a faded deck or crown shows what is under it instead of filling in its gaps
  if (v_alpha < 1.0 && bayer(ivec2(floor(gl_FragCoord.xy * 3.0 / u_scale))) >= v_alpha) discard;
  // which way the texel faces (turned with the thing it is part of), whether sky is over it, and
  // whether it is a lamp: baked from the stack's shape, read from the atlas's second texture
  vec3 n = vec3(0.0, 0.0, 1.0);
  float known = 0.0;
  float lamp = 0.0;
  bool sky = false;
  if (stack && u_lit > 0.5) {
    ivec2 a = ivec2(texelFetch(u_aux, t, 0).rg * 255.0 + 0.5);
    if (a.x > 0) {
      int v = a.x - 1;
      float nz = float(v % ${ELS}) / ${(ELS - 1).toFixed(1)};
      float az = float(v / ${ELS}) * ${((Math.PI * 2) / AZS).toFixed(6)};
      float h = sqrt(max(0.0, 1.0 - nz * nz));
      vec2 l = vec2(cos(az), sin(az)) * h;
      n = vec3(l.x * v_cs.x - l.y * v_cs.y, l.x * v_cs.y + l.y * v_cs.x, nz);
      known = 1.0;
    }
    lamp = float(a.y & 7) / 7.0;
    sky = (a.y & 128) != 0;
  }
  if (u_mirror > 0.5) {
    // dim and a little blue; a lamp still shows its own colour
    vec3 r = c.rgb * (u_amb + u_sun * 0.5) * vec3(0.74, 0.8, 0.9);
    o = vec4(mix(r, min(vec3(1.0), c.rgb * 1.2), lamp * u_glow), 1.0);
    return;
  }
  // snow lies on what faces up with nothing over it, a texel at a time, flat tops first
  if (u_snow > 0.0 && sky && n.z > 0.45) {
    float h = hash(vec2(t) + 17.0);
    // (what is warm and moving, a car, only gets a dusting)
    if (h < u_snow * (v_tint < -0.5 ? 0.3 : 1.0) * (0.35 + 1.1 * n.z * n.z) - 0.2) {
      c.rgb = h < 0.12 ? vec3(0.8, 0.86, 0.95) : vec3(0.93, 0.96, 1.0);
      lamp = 0.0;
    }
  }
  // the sun: full on what is square to it, none on what faces away, in hard dithered steps
  float ndl = dot(n, u_sdir);
  float q = clamp(floor(ndl * 5.0 + 0.02 + b * 0.96) / 5.0, 0.0, 1.0);
  vec3 base = u_amb + u_sun * q;
  // what is square to the sun catches a bright edge; what faces away takes a little of the
  // sky's blue instead, so shade is cool and never dead
  if (known > 0.5) {
    if (ndl > 0.9) base += u_sun * 0.22;
    else if (ndl < 0.0) base += vec3(-0.03, 0.0, 0.05) * dot(u_sun, vec3(0.6));
  }
  vec3 l = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= u_lcount) break;
    vec4 p = u_lpos[i];
    vec3 to = vec3(p.xy - v_world.xy, 8.0 - v_world.z);
    float d = length(vec3(to.xy, (v_world.z - 6.0) * 1.5));
    if (d >= p.z) continue;
    float f = 1.0 - d / p.z;
    // a light falls hardest on what is turned towards it
    float face = mix(1.0, 0.55 + 0.7 * max(0.0, dot(n, normalize(to))), known);
    float e = clamp(floor(f * (0.4 + 0.6 * f) * p.w * face * 4.0 + b - 0.5) / 4.0, 0.0, 1.5);
    l += u_lcol[i] * e;
  }
  for (int i = 0; i < ${MAX_CONES}; i++) {
    if (i >= u_ccount) break;
    vec4 p = u_cone[i];
    float f = beam(v_world.xy, p);
    if (f <= 0.0) continue;
    vec3 to = vec3(p.xy - v_world.xy, 5.0 - v_world.z);
    float face = mix(1.0, 0.25 + 1.0 * max(0.0, dot(n, normalize(to))), known);
    l += vec3(1.0, 0.93, 0.74) * clamp(floor(f * face * 4.0 + b - 0.5) / 4.0, 0.0, 1.5);
  }
  vec3 k = min(vec3(0.7), l);
  vec3 rgb = min(vec3(1.0), c.rgb * (base + k * 1.1) + k * (30.0 / 255.0));
  // a lamp shows its own colour however dark it is round it
  rgb = mix(rgb, min(vec3(1.0), c.rgb * 1.25 + 0.1), lamp * u_glow);
  o = vec4(rgb, 1.0);
}`;

/** The ground: one textured quad over the world rectangle, squashed by the pitch. */
export const GROUND_VS = `#version 300 es
uniform vec2 u_view;
uniform vec2 u_origin;
uniform float u_scale;
uniform float u_ys;
uniform vec2 u_size;
out vec2 v_uv;
void main() {
  int id = gl_VertexID % 6;
  vec2 corner = vec2(id == 1 || id == 2 || id == 4 ? 1.0 : 0.0, id == 2 || id == 4 || id == 5 ? 1.0 : 0.0);
  vec2 px = u_origin + vec2(corner.x * u_size.x * u_scale, corner.y * u_size.y * u_scale * u_ys);
  gl_Position = vec4(px.x / u_view.x * 2.0 - 1.0, 1.0 - px.y / u_view.y * 2.0, 1.0, 1.0);
  v_uv = corner;
}`;

export const GROUND_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_size;
uniform float u_fine;
uniform vec4 u_lpos[${MAX_LIGHTS}];  // x, y, radius, strength
uniform vec3 u_lcol[${MAX_LIGHTS}];
uniform int u_lcount;
uniform vec3 u_amb;    // the sky's light on flat ground (ambient plus the sun on a flat top)
uniform float u_snow;
uniform float u_wet;
out vec4 o;${SKY_GLSL}
vec3 tex(vec2 t) {
  return texelFetch(u_tex, ivec2(clamp(t, vec2(0.0), u_size - 1.0)), 0).rgb;
}
void main() {
  // The ground is painted one texel to the art pixel and drawn on the screen's fine grid (u_fine
  // cells to the art pixel, about two device pixels a cell). Nothing is blended: every fine cell
  // takes one texel's colour whole, and where two texels meet the edge is dithered between them
  // on the Bayer grid, so a kerb or a road edge steps in fine cells, crisp, as in mudders.
  vec2 cell = floor(v_uv * u_size * u_fine);
  vec2 p = (cell + 0.5) / u_fine - 0.5;
  vec2 i = floor(p);
  vec2 f = p - i;
  ivec2 ci = ivec2(cell);
  vec2 d = vec2(bayer(ci), bayer(ci.yx + ivec2(2, 1)));
  vec3 c = tex(i + step(d, f));
  // The material under the cell, from its colour: grass is green, tarmac is grey, the rest dirt.
  float mx = max(c.r, max(c.g, c.b));
  float sat = mx - min(c.r, min(c.g, c.b));
  float grass = step(0.03, c.g - max(c.r, c.b) * 0.97) * step(0.06, sat);
  float tar = (1.0 - grass) * (1.0 - step(0.075, sat));
  float dirt = 1.0 - grass - tar;
  // Grain at three sizes, in flat steps, so no fill is ever flat.
  float h1 = hash(cell);
  float h2 = hash(floor(cell / 2.0) + 71.0);
  float h3 = hash(floor(cell / 5.0) + 13.0);
  float k = 1.0 + (floor(h1 * 3.0) - 1.0) * 0.022 + (floor(h2 * 3.0) - 1.0) * 0.02 + (floor(h3 * 3.0) - 1.0) * 0.018;
  // grass: blades, a few cells tall, each its own shade, a light tip on some
  float row = cell.y + floor(hash(vec2(cell.x, 9.0)) * 3.0);
  float blade = hash(vec2(cell.x, floor(row / 3.0)));
  float tip = step(0.82, blade) * step(mod(row, 3.0), 0.5);
  float g = blade < 0.3 ? 0.84 : blade < 0.7 ? 1.0 : 1.08;
  g = mix(g, 1.2, tip);
  // tarmac: aggregate, single cells lighter or darker, and a rare pale chip
  float a1 = hash(cell + 401.0);
  float t = a1 < 0.07 ? 0.8 : a1 < 0.13 ? 1.16 : a1 > 0.995 ? 1.45 : 1.0;
  // dirt: pebbles, two cells across, light on top and dark below; and grit
  vec2 pc = floor(cell / 2.0);
  float pb = hash(pc + 907.0);
  float pebble = pb > 0.965 ? (mod(cell.y, 2.0) < 1.0 ? 1.22 : 0.82) : 1.0;
  float grit = a1 < 0.08 ? 0.86 : a1 > 0.94 ? 1.1 : 1.0;
  float m = grass * g + tar * t + dirt * pebble * grit;
  c = clamp(c * k * m, 0.0, 1.0);
  vec2 wp = (cell + 0.5) / u_fine;
  // Snow settles in patches, a cell at a time, and last on the tarmac where the cars keep it off.
  if (u_snow > 0.0) {
    // on grass and dirt it lies in drifts with dithered edges; on tarmac the cars keep it to a
    // thin dusting, a cell here and there, thicker where a drift has blown across
    float drift = soft(wp / 16.0 + 40.0);
    float fine = bayer(ci);
    float lie = mix(drift * 0.55 + soft(wp / 4.0 + 7.0) * 0.25 + fine * 0.2, drift * 0.3 + h1 * 0.35 + fine * 0.35, tar);
    if (lie < u_snow * (1.3 - 0.86 * tar) - 0.12) {
      // snow in two close tones dithered into each other (hollows a little blue), a fleck of
      // shadow here and there, and grass tips showing through until it lies deep
      float deep = soft(wp / 7.0 + 90.0) + (fine - 0.5) * 0.3;
      vec3 s = deep < 0.42 ? vec3(0.83, 0.87, 0.94) : vec3(0.93, 0.95, 0.99);
      if (h1 < 0.04) s *= 0.92;
      c = grass > 0.5 && tip > 0.5 && u_snow < 0.9 ? c : s;
    }
  }
  // Wet ground is darker, and darker and bluer again where water stands (the stacks' reflections
  // are drawn into the same puddles).
  if (u_wet > 0.0) {
    // (it soaks into grass, so less of it stands there)
    float pd = puddle(wp) * u_wet * (1.0 - 0.6 * grass);
    c *= 1.0 - 0.2 * u_wet;
    // standing water shows the sky: paler and bluer than the wet ground round it
    c = mix(c, c * 0.45 + vec3(0.2, 0.25, 0.33), pd * 0.7);
  }
  // Fire and lamps light the ground, in the same hard dithered bands as they light the stacks.
  vec3 l = vec3(0.0);
  float b = bayer(ci);
  for (int n = 0; n < ${MAX_LIGHTS}; n++) {
    if (n >= u_lcount) break;
    vec4 lp = u_lpos[n];
    float dist = length(wp - lp.xy);
    if (dist >= lp.z) continue;
    float e = 1.0 - dist / lp.z;
    l += u_lcol[n] * clamp(floor(e * (0.4 + 0.6 * e) * lp.w * 4.0 + b - 0.5) / 4.0, 0.0, 1.5);
  }
  for (int n = 0; n < ${MAX_CONES}; n++) {
    if (n >= u_ccount) break;
    l += vec3(1.0, 0.93, 0.74) * clamp(floor(beam(wp, u_cone[n]) * 4.0 + b - 0.5) / 4.0, 0.0, 1.5);
  }
  vec3 q = min(vec3(0.7), l);
  c = min(vec3(1.0), c * (u_amb + q * 1.1) + q * (30.0 / 255.0));
  o = vec4(c, 1.0);
}`;

/**
 * Shadows cast from the shape of tall scenery: a one-byte mask over the ground, drawn on the
 * ground's fine grid. Where the mask is part covered (its edge, blended between art px) it is
 * dithered on the Bayer grid, so the edge steps in fine cells instead of blurring.
 */
export const SHADOW_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_size;
uniform float u_alpha;
uniform float u_fine;
out vec4 o;
float bayer(ivec2 p) {
  int i = (p.y & 3) * 4 + (p.x & 3);
  int t[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(t[i]) + 0.5) / 16.0;
}
void main() {
  vec2 cell = floor(v_uv * u_size * u_fine);
  float a = texture(u_tex, (cell + 0.5) / (u_size * u_fine)).r;
  if (a < 0.05 || a < bayer(ivec2(cell))) discard;
  o = vec4(0.0, 0.0, 0.0, u_alpha);
}`;
