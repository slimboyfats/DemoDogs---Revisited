/** The steps a light's ray is walked in, at most. */
export const RAY_STEPS = 22;

/**
 * GLSL: is the way open from the point `p` (ground x, y) standing `z` above the ground to a
 * light at `l`, `lz` above it? The frame's blockers are in `u_lm` (see LightBlock): for each
 * art px of ground, the top and the underside of what stands there. The ray is walked in steps
 * that start a different way along in each cell (`jit`, the cell's place in the Bayer grid), so
 * a shadow's edge is dithered, never banded. Nothing within `near` of the light blocks it: that
 * is the thing the light comes from.
 */
export const BLOCK_GLSL = `
uniform highp sampler2D u_lm;
uniform vec4 u_lmbox;   // the ground the blockers' map covers: x, y, width, height
uniform float u_lmk;    // 0: lights throw no shadows
float lightOpen(vec2 p, float z, vec2 l, float lz, float near, float jit) {
  if (u_lmk <= 0.0) return 1.0;
  vec2 d = l - p;
  float len = length(d);
  if (len < near + 4.0) return 1.0;
  float n = clamp(ceil(len / 4.0), 4.0, ${RAY_STEPS.toFixed(1)});
  for (int i = 0; i < ${RAY_STEPS}; i++) {
    if (float(i) >= n) break;
    float t = (float(i) + jit) / n;
    float along = t * len;
    if (along < 2.5 || len - along < near) continue;
    vec2 uv = (p + d * t - u_lmbox.xy) / u_lmbox.zw;
    if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) continue;
    vec2 m = textureLod(u_lm, uv, 0.0).rg;
    float h = mix(z, lz, t);
    // (what hovers a little off the ground, a pickup, shades it as if it stood there: only a
    // deck or a bough well overhead lets a low light pass under it)
    float under = (1.0 - m.g) * 255.0;
    float top = m.r * 255.0;
    // (a thing with some body to it, that is: a bit of wreckage in the air throws no streak)
    if (m.r > 0.0 && h <= top + 0.5 && ((under < 8.0 && top - under >= 4.0) || h >= under - 0.5)) return 0.0;
  }
  return 1.0;
}`;

/** A slice into the blockers' map: where it lies on the ground, and how high it stands. */
export const BLOCK_VS = `#version 300 es
layout(location = 0) in vec4 a_pos;
layout(location = 1) in float a_rot;
layout(location = 2) in vec4 a_uv;
layout(location = 3) in float a_alpha;
layout(location = 4) in float a_res;
layout(location = 5) in float a_tint;
layout(location = 6) in vec2 a_tilt;
layout(location = 7) in float a_air;
layout(location = 8) in vec4 a_trim;
uniform vec4 u_lmbox;
out vec2 v_tex;
out float v_high;
flat out float v_air;
flat out vec4 v_uv;
void main() {
  int id = gl_VertexID % 6;
  vec2 corner = vec2(id == 1 || id == 2 || id == 4 ? 1.0 : 0.0, id == 2 || id == 4 || id == 5 ? 1.0 : 0.0);
  // (the quad is only the part of the slice that has anything in it)
  vec2 cut = mix(a_trim.xy, a_trim.zw, corner);
  vec2 local = (cut - 0.5 * a_uv.zw) / a_res;
  float c = cos(a_rot), s = sin(a_rot);
  vec2 r = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  v_high = max(0.0, a_pos.z + dot(r, a_tilt));
  v_air = a_air;
  vec2 g = (a_pos.xy + r - u_lmbox.xy) / u_lmbox.zw;
  gl_Position = vec4(g * 2.0 - 1.0, 0.0, 1.0);
  // an outline copy blocks nothing, nor does what has all but faded away
  if (a_tint > 0.5 || a_alpha < 0.15) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  v_tex = cut;
  v_uv = a_uv;
}`;

/**
 * Red: the slice's height; green: that height from the top. Blended by MAX: the top and the
 * underside. The second target takes the slice's colour (and its height as alpha), for the light
 * that things throw back on the ground beside them; the third the light of what glows (a lamp's
 * texels in their own colour), for the traced light (glow-field.ts).
 */
export const BLOCK_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_tex;
in float v_high;
flat in float v_air;
flat in vec4 v_uv;
uniform highp sampler2D u_atlas;
uniform highp sampler2D u_aux;
uniform float u_lamps;   // 1: the atlas has its second texture, where the lamps are marked
layout(location = 0) out vec4 o;
layout(location = 1) out vec4 oc;
layout(location = 2) out vec4 oe;
void main() {
  vec3 c;
  float lamp = 0.0;
  if (v_uv.y >= 0.0) {
    ivec2 t = ivec2(v_uv.xy) + ivec2(clamp(floor(v_tex), vec2(0.0), v_uv.zw - 1.0));
    vec4 x = texelFetch(u_atlas, t, 0);
    if (x.a < 0.5) discard;
    c = x.rgb;
    if (u_lamps > 0.5) lamp = float(int(texelFetch(u_aux, t, 0).g * 255.0 + 0.5) & 7) / 7.0;
  } else {
    int p = int(v_uv.x + 0.5);
    c = vec3(float((p >> 16) & 255), float((p >> 8) & 255), float(p & 255)) / 255.0;
  }
  float h = min(255.0, v_high + 1.0) / 255.0;
  // (a thing in a jump is as if it stood on the ground under it: a light does not pass under a
  // car in the air, it falls on it, and the car throws its shadow)
  o = vec4(h, 1.0 - clamp(v_high - v_air, 0.0, 255.0) / 255.0, 0.0, 1.0);
  oc = vec4(c, h);
  oe = vec4(c * lamp, lamp);
}`;

/**
 * GLSL (the ground): the light thrown back at the ground point `wp` by what stands beside it
 * on the side away from the sun, so a wall or a car in the sun spills its colour on the ground
 * in front of it. `u_bounce`: the way shadows fall (unit x, y) and how strong the sun is.
 */
export const BOUNCE_GLSL = `
uniform sampler2D u_lc;
uniform vec3 u_bounce;
vec3 bounced(vec2 wp) {
  if (u_bounce.z <= 0.0 || u_lmk <= 0.0) return vec3(0.0);
  // (nothing bounces on to ground that something stands on)
  vec4 own = textureLod(u_lc, (wp - u_lmbox.xy) / u_lmbox.zw, 0.0);
  if (own.a * 255.0 > 3.0) return vec3(0.0);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float d = 2.0 + float(i) * 3.0;
    vec4 m = textureLod(u_lc, (wp + u_bounce.xy * d - u_lmbox.xy) / u_lmbox.zw, 0.0);
    // a thing throws light about as far as it is tall
    float tall = m.a * 255.0;
    sum += m.rgb * clamp((tall * 1.6 - d) / 6.0, 0.0, 1.0) * (1.0 - float(i) * 0.22);
  }
  return sum * u_bounce.z;
}`;
