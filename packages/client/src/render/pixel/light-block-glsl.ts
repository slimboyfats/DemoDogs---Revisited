/** The steps a light's ray is walked in, at most. */
export const RAY_STEPS = 14;

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
    if (m.r > 0.0 && h <= m.r * 255.0 + 0.5 && h >= (1.0 - m.g) * 255.0 - 0.5) return 0.0;
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
uniform vec4 u_lmbox;
out vec2 v_tex;
out float v_high;
flat out vec4 v_uv;
void main() {
  int id = gl_VertexID % 6;
  vec2 corner = vec2(id == 1 || id == 2 || id == 4 ? 1.0 : 0.0, id == 2 || id == 4 || id == 5 ? 1.0 : 0.0);
  vec2 local = (corner - 0.5) * a_uv.zw / a_res;
  float c = cos(a_rot), s = sin(a_rot);
  vec2 r = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  v_high = max(0.0, a_pos.z + dot(r, a_tilt));
  vec2 g = (a_pos.xy + r - u_lmbox.xy) / u_lmbox.zw;
  gl_Position = vec4(g * 2.0 - 1.0, 0.0, 1.0);
  // an outline copy blocks nothing, nor does what has all but faded away
  if (a_tint > 0.5 || a_alpha < 0.15) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  v_tex = corner * a_uv.zw;
  v_uv = a_uv;
}`;

/** Red: the slice's height; green: that height from the top. Blended by MAX: the top and the underside. */
export const BLOCK_FS = `#version 300 es
precision highp float;
in vec2 v_tex;
in float v_high;
flat in vec4 v_uv;
uniform highp sampler2D u_atlas;
out vec4 o;
void main() {
  if (v_uv.y >= 0.0) {
    ivec2 t = ivec2(v_uv.xy) + ivec2(clamp(floor(v_tex), vec2(0.0), v_uv.zw - 1.0));
    if (texelFetch(u_atlas, t, 0).a < 0.5) discard;
  }
  float h = min(255.0, v_high + 1.0) / 255.0;
  o = vec4(h, 1.0 - min(255.0, v_high) / 255.0, 0.0, 1.0);
}`;
