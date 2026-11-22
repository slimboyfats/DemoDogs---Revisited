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
  vec2 local = (corner - 0.5) * a_uv.zw;
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
  ivec2 cell = ivec2(floor(v_world.xy)) + ivec2(0, int(floor(v_world.z)));
  float b = bayer(cell);
  if (v_alpha < 1.0 && b >= v_alpha) discard;
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
out vec4 o;
void main() {
  o = vec4(texture(u_tex, v_uv).rgb, 1.0);
}`;
