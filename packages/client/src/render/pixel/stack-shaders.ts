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

export const STACK_VS = `#version 300 es
layout(location = 0) in vec4 a_pos;   // x, y, z (art px), lift (whole device px)
layout(location = 1) in float a_rot;
layout(location = 2) in vec4 a_uv;    // slice texel x, y, width, height
layout(location = 3) in float a_alpha;
layout(location = 4) in float a_res;   // texels per art px
uniform vec2 u_view;
uniform vec2 u_origin;   // device px of the world origin on the ground (whole pixels)
uniform float u_scale;
uniform float u_ys;
uniform vec2 u_dir;      // depth along the view: y * dir.x + z * dir.y
uniform vec2 u_drange;   // nearest depth, 1 / depth range
out vec2 v_tex;
out vec3 v_world;
flat out vec4 v_uv;
flat out float v_alpha;
void main() {
  int id = gl_VertexID % 6;
  vec2 corner = vec2(id == 1 || id == 2 || id == 4 ? 1.0 : 0.0, id == 2 || id == 4 || id == 5 ? 1.0 : 0.0);
  vec2 local = (corner - 0.5) * a_uv.zw / a_res;
  float c = cos(a_rot), s = sin(a_rot);
  vec2 r = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vec2 anchor = floor(u_origin + vec2(a_pos.x * u_scale, a_pos.y * u_scale * u_ys) + 0.5) - vec2(0.0, a_pos.w);
  vec2 px = anchor + vec2(r.x * u_scale, r.y * u_scale * u_ys);
  v_world = vec3(a_pos.xy + r, a_pos.z);
  float d = v_world.y * u_dir.x + v_world.z * u_dir.y;
  float far = clamp(1.0 - (d - u_drange.x) * u_drange.y, 0.0, 1.0);
  gl_Position = vec4(px.x / u_view.x * 2.0 - 1.0, 1.0 - px.y / u_view.y * 2.0, far * 2.0 - 1.0, 1.0);
  v_tex = corner * a_uv.zw;
  v_uv = a_uv;
  v_alpha = a_alpha;
}`;

export const STACK_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_tex;
in vec3 v_world;
flat in vec4 v_uv;
flat in float v_alpha;
uniform highp sampler2D u_atlas;
uniform vec4 u_lpos[8];  // x, y, radius, strength
uniform vec3 u_lcol[8];
uniform int u_lcount;
uniform float u_scale;
out vec4 o;
float bayer(ivec2 p) {
  int i = (p.y & 3) * 4 + (p.x & 3);
  int t[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(t[i]) + 0.5) / 16.0;
}
void main() {
  vec4 c;
  if (v_uv.y < 0.0) {
    // a loose voxel: flat colour packed as 0xRRGGBB in the texel-x slot
    int p = int(v_uv.x + 0.5);
    c = vec4(float((p >> 16) & 255), float((p >> 8) & 255), float(p & 255), 255.0) / 255.0;
  } else {
    ivec2 t = ivec2(v_uv.xy) + ivec2(clamp(floor(v_tex), vec2(0.0), v_uv.zw - 1.0));
    c = texelFetch(u_atlas, t, 0);
    if (c.a < 0.5) discard;
  }
  // the dither and the light bands step on a grid three to the art pixel, as fine as the art
  ivec2 cell = ivec2(floor(v_world.xy * 3.0)) + ivec2(0, int(floor(v_world.z * 3.0)));
  float b = bayer(cell);
  // see-through in screen space, on cells as fine as the art: every slice of a stack leaves the
  // same holes, so a faded deck or crown shows what is under it instead of filling in its gaps
  if (v_alpha < 1.0 && bayer(ivec2(floor(gl_FragCoord.xy * 3.0 / u_scale))) >= v_alpha) discard;
  vec3 l = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= u_lcount) break;
    vec4 p = u_lpos[i];
    float d = length(vec3(v_world.xy - p.xy, (v_world.z - 6.0) * 1.5));
    if (d >= p.z) continue;
    float f = 1.0 - d / p.z;
    float q = clamp(floor(f * (0.4 + 0.6 * f) * p.w * 4.0 + b - 0.5) / 4.0, 0.0, 1.5);
    l += u_lcol[i] * q;
  }
  vec3 k = min(vec3(0.7), l);
  o = vec4(min(vec3(1.0), c.rgb * (1.0 + k * 1.1) + k * (30.0 / 255.0)), 1.0);
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
out vec4 o;
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
  o = vec4(clamp(c * k * m, 0.0, 1.0), 1.0);
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
