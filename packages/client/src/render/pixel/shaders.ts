/**
 * Shaders from mudders' pixel engine (packages/client/src/render/pixel/shaders.ts), kept as they are
 * there: the instanced quad used for ground marks, shadows and particles.
 */
export const QUAD_VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_size;
layout(location = 2) in float a_rot;
layout(location = 3) in vec4 a_color;
layout(location = 4) in float a_shape;
uniform vec2 u_view;
uniform vec2 u_origin;
uniform float u_scale;
out vec2 v_local;
out vec4 v_color;
flat out int v_shape;
flat out vec3 v_blob; // centre (map cells) + radius, for pixel blobs
flat out vec4 v_seg;  // trail head and tail cells (shape 7)
void main() {
  v_seg = vec4(0.0);
  int id = gl_VertexID % 6;
  vec2 corner = vec2(id == 1 || id == 2 || id == 4 ? 1.0 : 0.0, id == 2 || id == 4 || id == 5 ? 1.0 : 0.0);
  vec2 l = corner - 0.5;
  v_local = l * 2.0;
  v_color = a_color;
  v_shape = int(a_shape + 0.5);
  v_blob = vec3(a_pos, a_size.x * 0.5);
  float c = cos(a_rot), s = sin(a_rot);
  vec2 off = vec2(l.x * a_size.x, l.y * a_size.y);
  off = vec2(off.x * c - off.y * s, off.x * s + off.y * c);
  vec2 px = u_origin + (a_pos + off) * u_scale;
  gl_Position = vec4(px.x / u_view.x * 2.0 - 1.0, 1.0 - px.y / u_view.y * 2.0, 0.0, 1.0);
}`;

export const QUAD_FS = `#version 300 es
precision highp float;
in vec2 v_local;
in vec4 v_color;
flat in int v_shape;
flat in vec3 v_blob;
flat in vec4 v_seg;
uniform vec2 u_view;
uniform vec2 u_origin;
uniform float u_scale;
out vec4 o;
void main() {
  float a = 1.0;
  float d = length(v_local);
  if (v_shape == 1) {        // soft glow
    a = clamp(1.0 - d, 0.0, 1.0);
    a = a * a;
  } else if (v_shape == 2) { // disc with a 1px-ish soft edge
    if (d > 1.0) discard;
    a = clamp((1.0 - d) * 6.0, 0.0, 1.0);
  } else if (v_shape == 3) { // ring
    a = clamp(1.0 - abs(d - 0.85) * 8.0, 0.0, 1.0);
  } else if (v_shape == 4) { // pixel blob: snapped to map cells, hard bands, ordered dither
    vec2 dev = vec2(gl_FragCoord.x, u_view.y - gl_FragCoord.y);
    vec2 cell = floor((dev - u_origin) / u_scale);
    float k = length(cell + 0.5 - v_blob.xy) / max(v_blob.z, 0.5);
    if (k > 1.0) discard;
    ivec2 ic = ivec2(cell) & 1;
    float bayer = float(ic.x * 2 + ic.y * 3 & 3) / 4.0; // 2x2 ordered dither
    if (k < 0.45) a = 1.0;
    else if (k < 0.75) a = 0.6;
    else a = bayer < 0.5 ? 0.35 : 0.0;
    if (a <= 0.0) discard;
  } else if (v_shape == 7) { // trail: a cell-snapped line from head to tail, dimming in steps
    vec2 dev = vec2(gl_FragCoord.x, u_view.y - gl_FragCoord.y);
    vec2 cell = floor((dev - u_origin) / u_scale) + 0.5;
    vec2 ab = v_seg.zw - v_seg.xy;
    float l2 = max(dot(ab, ab), 1e-4);
    float f = clamp(dot(cell - v_seg.xy, ab) / l2, 0.0, 1.0);
    vec2 q = v_seg.xy + ab * f - cell;
    if (max(abs(q.x), abs(q.y)) > 0.5) discard;
    a = f < 0.34 ? 1.0 : f < 0.67 ? 0.55 : 0.28;
  } else if (v_shape == 6) { // stipple: a cloud of single opaque cells, denser at the core
    vec2 dev = vec2(gl_FragCoord.x, u_view.y - gl_FragCoord.y);
    vec2 cell = floor((dev - u_origin) / u_scale);
    float k = length(cell + 0.5 - v_blob.xy) / max(v_blob.z, 0.5);
    if (k > 1.0) discard;
    // each cell's own die, re-rolled as the blob moves a cell, so the cloud shimmers
    float h = fract(sin(dot(cell, vec2(12.9898, 78.233)) + dot(floor(v_blob.xy), vec2(3.1, 7.7))) * 43758.5453);
    if (h > v_color.a * (1.25 - k * 0.7)) discard;
    vec3 c = k > 0.6 ? min(vec3(1.0), v_color.rgb * 1.3) : v_color.rgb; // pale fringe, one step
    o = vec4(c, 1.0);
    return;
  } else if (v_shape == 5) { // solid pixel blob: opaque cells, one dithered edge band
    vec2 dev = vec2(gl_FragCoord.x, u_view.y - gl_FragCoord.y);
    vec2 cell = floor((dev - u_origin) / u_scale);
    float k = length(cell + 0.5 - v_blob.xy) / max(v_blob.z, 0.5);
    if (k > 1.0) discard;
    ivec2 ic = ivec2(cell) & 1;
    if (k > 0.86 && (ic.x ^ ic.y) == 1) discard;
  }
  o = vec4(v_color.rgb * v_color.a * a, v_color.a * a); // premultiplied
}`;
