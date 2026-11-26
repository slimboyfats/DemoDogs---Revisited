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
import { BLOCK_GLSL, BOUNCE_GLSL } from './light-block-glsl';
import { FAR_DARK, FAR_SHADE } from '../relief-map';
import { RELIEF_GLSL } from './relief-layer';
import { SUN_GLSL } from './sun-glsl';
import { TRACED_GLSL } from './traced-light';

/**
 * Light falls off smoothly and a shadow's edge is soft. `?light=bands` gives the older look: light
 * in hard steps dithered into each other on the Bayer grid, and a shadow's edge dithered too.
 */
export const SMOOTH_LIGHT = !/[?&]light=bands\b/.test(
  (globalThis as { location?: { search?: string } }).location?.search ?? '',
);

/** Slices higher than this (art px) are left out of wet ground's reflections. */
const MIRROR_TALL = 14;

export const STACK_VS = `#version 300 es
layout(location = 0) in vec4 a_pos;   // x, y, z (art px), lift (whole device px)
layout(location = 1) in float a_rot;
layout(location = 2) in vec4 a_uv;    // slice texel x, y, width, height
layout(location = 3) in float a_alpha;
layout(location = 4) in float a_res;   // texels per art px
layout(location = 5) in float a_tint;  // 0; 1 + 0xRRGGBB: drawn in that one colour, a shade behind; -1 - bits: a car, and its dark lamps
layout(location = 6) in vec2 a_tilt;   // the slice lies sloped: height gained per art px east and south
layout(location = 8) in vec4 a_trim;   // the part of the slice drawn: texel x0, y0, x1, y1 within it
uniform vec2 u_view;
uniform vec2 u_origin;   // device px of the world origin on the ground (whole pixels)
uniform float u_scale;
uniform float u_ys;
uniform vec2 u_dir;      // depth along the view: y * dir.x + z * dir.y
uniform vec2 u_drange;   // nearest depth, 1 / depth range
uniform float u_mirror;  // 1: the stacks upside down under the ground line (wet ground)
uniform float u_time;
uniform vec3 u_grow;     // a race rising out of the ground: focus x, y and how far it has got; z < 0: off${RELIEF_GLSL}
out vec2 v_tex;
out vec3 v_world;
flat out vec4 v_uv;
flat out float v_alpha;
flat out vec2 v_cs;
flat out float v_tint;
flat out float v_shade;
flat out float v_gz;
flat out vec2 v_tilt;
// What stands in the shade of higher ground is in it too, the way the ground itself is painted
// (relief-map.ts): under a cliff to its upper left, and in the dark beyond the far edge of a drop.
float shadeAt(vec2 p, float g) {
  if (textureSize(u_relief, 0).x < 2) return 1.0;
  if (groundAt(p - 5.0) - g > 4.0 || groundAt(p - 12.0) - g > 10.0 || groundAt(p - 20.0) - g > 17.0)
    return 0.64;
  float rise = u_dir.x / u_ys;
  float sunk = 0.0;
  for (int i = 0; i < 4; i++) {
    float d = 4.0 + float(i) * 12.0;
    float dh = groundAt(p + vec2(0.0, d)) - g;
    if (dh < 5.0) continue;
    sunk = max(sunk, min(1.0, (dh * rise + ${FAR_SHADE.toFixed(1)} - d) / ${FAR_SHADE.toFixed(1)}) * min(1.0, dh / 14.0));
  }
  return 1.0 - ${FAR_DARK.toFixed(2)} * sunk;
}
void main() {
  int id = gl_VertexID % 6;
  vec2 corner = vec2(id == 1 || id == 2 || id == 4 ? 1.0 : 0.0, id == 2 || id == 4 || id == 5 ? 1.0 : 0.0);
  // (the quad is only the part of the slice that has anything in it)
  vec2 cut = mix(a_trim.xy, a_trim.zw, corner);
  vec2 local = (cut - 0.5 * a_uv.zw) / a_res;
  float c = cos(a_rot), s = sin(a_rot);
  vec2 r = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vec2 anchor = floor(u_origin + vec2(a_pos.x * u_scale, a_pos.y * u_scale * u_ys) + 0.5);
  // whatever it is stands on the ground, however high the ground is there
  float gz = groundAt(a_pos.xy);
  v_shade = shadeAt(a_pos.xy, gz);
  v_gz = gz;
  anchor.y -= floor(gz * u_scale * u_dir.x + 0.5);
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
  // a slice that lies sloped: each corner as much higher or lower as it is up or down the slope
  float tz = dot(r, a_tilt);
  vec2 px = anchor + vec2(r.x * u_scale, r.y * u_scale * u_ys - up * tz * u_scale * u_dir.x);
  v_world = vec3(a_pos.xy + r, zz + tz);
  float d = v_world.y * u_dir.x + (gz + up * v_world.z) * u_dir.y;
  // an outline copy sits a shade further off than the thing it outlines, so only its rim shows
  if (a_tint > 0.5) d -= 5.0;
  float far = clamp(1.0 - (d - u_drange.x) * u_drange.y, 0.0, 1.0);
  gl_Position = vec4(px.x / u_view.x * 2.0 - 1.0, 1.0 - px.y / u_view.y * 2.0, far * 2.0 - 1.0, 1.0);
  // only what stands low is mirrored (cars, drums, the foot of a tree): the rest would land far
  // down the screen, and every slice mirrored is a slice drawn twice
  if (u_mirror > 0.5 && (zz > ${MIRROR_TALL.toFixed(1)} || a_tint > 0.5)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  v_tex = cut;
  v_uv = a_uv;
  v_alpha = a_alpha;
  v_cs = vec2(c, s);
  v_tint = a_tint;
  v_tilt = a_tilt;
}`;

/** Helpers the ground and the stacks share, so the two agree to the cell. */
export const SKY_GLSL = `
// The film's shoulder (after the ACES curve's): what is brighter than paint can be is not cut off
// at white a channel at a time, it rolls off keeping its colour, and only the very brightest
// burns towards white. Under the knee nothing changes: painted colours stay as painted.
vec3 shoulder(vec3 x) {
  float m = max(x.r, max(x.g, x.b));
  if (m <= 0.78) return x;
  float to = 0.78 + 0.22 * (1.0 - exp(-(m - 0.78) / 0.3));
  return min(vec3(1.0), mix(x * (to / m), vec3(to), clamp((m - 1.05) * 0.45, 0.0, 0.7)));
}
float bayer(ivec2 p) {
  int i = (p.y & 3) * 4 + (p.x & 3);
  int t[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(t[i]) + 0.5) / 16.0;
}
// How much light, of x: as it is (smooth), or in n hard steps dithered into each other by b.
// lround is the same with the steps rounded down half a step, so the dimmest reach is none.
${
  SMOOTH_LIGHT
    ? `float lstep(float x, float n, float b) { return x; }
vec3 lstep(vec3 x, float n, float b) { return x; }
float lround(float x, float n, float b) { return x - 0.5 / n; }`
    : `float lstep(float x, float n, float b) { return floor(x * n + b) / n; }
vec3 lstep(vec3 x, float n, float b) { return floor(x * n + b) / n; }
float lround(float x, float n, float b) { return floor(x * n + b - 0.5) / n; }`
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
uniform vec4 u_coneh[${MAX_CONES}]; // a lamp's height over the ground under it, that ground's, the beam's climb a px, half the gap between its two lamps
uniform float u_lgz[${MAX_LIGHTS}]; // how high the ground stands under each point light
// How much of a light that stands \`from\` high reaches a spot \`at\` high and \`d\` away: all of
// it along a slope or a ramp, none of it over a sheer edge either way (the side of a raised
// road, the ground under a car in the air or up on a deck).
float level(float from, float at, float d) {
  return 1.0 - clamp((abs(from - at) - 4.0 - min(d * 0.3, 9.0)) / 4.0, 0.0, 1.0);
}
// (\`gap\`: how far to each side of c.xy its two lamps are: a beam from each, that run into one
// further out; 0 for one lamp)
// A beam's last number is half the gap between its two lamps, and 32 times how many px up the
// picture its start is drawn, for a car in the air: its foot is where the car is on the ground.
float coneLift(float w) { return floor(w / 32.0); }
float beam(vec2 wp, vec4 c, float gap) {
  gap -= coneLift(gap) * 32.0;
  vec2 d = wp - c.xy;
  float along = dot(d, c.zw);
  if (along <= 0.0 || along >= ${CONE_REACH.toFixed(1)}) return 0.0;
  float across = abs(d.x * c.w - d.y * c.z);
  float wide = 2.5 + along * 0.34;
  if (gap > 0.0) {
    across = abs(across - gap);
    wide = 2.0 + along * 0.27;
  }
  float side = across / wide;
  if (side >= 1.0) return 0.0;
  float e = 1.0 - along / ${CONE_REACH.toFixed(1)};
  return e * (0.5 + 0.5 * e) * (1.0 - side * side) * 1.25;
}${BLOCK_GLSL}`;

export const STACK_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_tex;
in vec3 v_world;
flat in vec4 v_uv;
flat in float v_alpha;
flat in vec2 v_cs;
flat in float v_tint;
flat in float v_shade;
flat in float v_gz;
flat in vec2 v_tilt;
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
uniform float u_shk;     // how strong the sun's cast shadows are (0: none are read)
uniform vec2 u_dir;      // cos and sin of the camera's pitch
uniform sampler2D u_lc;  // the light map's colours: what stands where, seen from above
out vec4 o;${SKY_GLSL}${SUN_GLSL}${TRACED_GLSL}
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
  // which material it is: 0 dull, then painted, metal, and polished (chrome, glass)
  int gloss = 0;
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
    gloss = (a.y >> 3) & 3;
    if (lamp > 0.0 && v_tint < -1.5) {
      // a car's lamp that is smashed or blinking: which corner of the slice it is at says which
      vec2 at = (floor(v_tex) + 0.5) / v_uv.zw - 0.5;
      if (abs(at.x) > 0.2) {
        int bit = (at.x > 0.0 ? 1 : 4) * (at.y > 0.0 ? 2 : 1);
        if (((int(-v_tint - 0.5)) & bit) != 0) {
          lamp = 0.0;
          gloss = 0;
          c.rgb *= 0.3;
        }
      }
    }
    sky = (a.y & 128) != 0;
  }
  // a slice that lies sloped (a ramp's face, a car on a hill) faces the way the slope does
  if (u_lit > 0.5 && dot(v_tilt, v_tilt) > 0.0004) {
    n = normalize(n + vec3(-v_tilt * max(n.z, 0.0), 0.0));
    known = 1.0;
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
  // is something between it and the sun? (the sun's map: every slice of the frame, see sun-shadow.ts)
  float sh = 0.0;
  if (u_shk > 0.0) sh = sunShade(vec3(v_world.xy, v_gz + v_world.z)) * u_shk;
  // the sun: full on what is square to it, none on what faces away, in hard dithered steps
  float ndl = dot(n, u_sdir);
  float q = clamp(lstep(ndl, 5.0, 0.02 + b * 0.96), 0.0, 1.0) * (1.0 - sh);
  // traced light (traced-light.ts), read a little way out from the face: how much of the sky
  // the spot sees (less at the foot of things, none of it lost high up), and what is thrown on
  // it by lit and glowing things round it
  vec4 gi = u_mirror > 0.5 ? vec4(0.0, 0.0, 0.0, 1.0) : traced(v_world.xy + n.xy * 4.0 * known);
  float low = 1.0 - clamp(v_world.z / 22.0, 0.0, 1.0);
  float occ = 1.0 - 0.6 * low * (1.0 - lstep(min(1.0, gi.a * 1.1), 8.0, b));
  vec3 back = lstep(min(vec3(0.9), max(vec3(0.0), gi.rgb * (0.6 + 0.7 * low) - 0.04)), 6.0, b);
  vec3 base = u_amb * occ * (1.0 - 0.1 * sh) + u_sun * q;
  // what is square to the sun catches a bright edge; what faces away takes a little of the
  // sky's blue instead, so shade is cool and never dead
  if (known > 0.5) {
    if (ndl > 0.9) base += u_sun * 0.22 * (1.0 - sh);
    else if (ndl < 0.0) base += vec3(-0.03, 0.0, 0.05) * dot(u_sun, vec3(0.6));
  }
  if (sh > 0.0) base += vec3(-0.02, 0.0, 0.04) * dot(u_sun, vec3(0.6)) * sh;
  // shine: metal and glass throw the sun back where they are turned half way between it and
  // the eye, in steps, so a car glints as it turns; polished things show the sky as well
  vec3 view = vec3(0.0, u_dir.x, u_dir.y);
  vec3 gleam = vec3(0.0);
  if (gloss > 0 && known > 0.5) {
    float tight = gloss == 1 ? 10.0 : gloss == 2 ? 18.0 : 34.0;
    float much = gloss == 1 ? 0.3 : gloss == 2 ? 0.62 : 1.0;
    float nh = max(0.0, dot(n, normalize(u_sdir + view)));
    float sp = pow(nh, tight);
    gleam = u_sun * lstep(sp, 4.0, b) * much * 1.5 * (1.0 - sh);
    // flakes in the paint and scratches in the steel: a texel here and there flashes white
    // as the thing turns through the light
    float fl = hash(vec2(t) * 0.37 + 3.0);
    if (fl > 0.95 && sp * (1.0 - sh) > 0.25 + (fl - 0.95) * 8.0) gleam += u_sun * 0.9 * much;
    if (gloss == 3) {
      // the sky in it: pale towards the horizon, deep overhead, a dark ground below
      vec3 r = reflect(-view, n);
      vec3 skyc = r.z > 0.0 ? mix(vec3(0.95, 0.97, 1.0), vec3(0.42, 0.62, 0.95), r.z) : vec3(0.25, 0.22, 0.2);
      base = mix(base, (u_amb + u_sun * 0.6) * skyc * 1.25, 0.4);
    }
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
    // (and none of it reaches what something stands in front of)
    float open = lightOpen(v_world.xy, v_world.z, p.xy, 3.0, clamp(p.z * 0.35, 4.0, 12.0), b);
    if (open <= 0.0) continue;
    f *= level(u_lgz[i], v_gz, length(to.xy));
    float e = clamp(lround(f * (0.4 + 0.6 * f) * p.w * face, 4.0, b), 0.0, 1.5);
    l += u_lcol[i] * e;
    // (and metal throws a fire's or a blast's light back in a hard glint)
    if (gloss > 1 && known > 0.5)
      gleam += u_lcol[i] * lstep(pow(max(0.0, dot(n, normalize(normalize(to) + view))), 14.0) * f * p.w, 3.0, b);
  }
  for (int i = 0; i < ${MAX_CONES}; i++) {
    if (i >= u_ccount) break;
    vec4 p = u_cone[i];
    float f = beam(v_world.xy, p, u_coneh[i].w);
    if (f <= 0.0) continue;
    // (what is as high as the lamp or higher is level with it: a deck under a car on it)
    float far = distance(v_world.xy, p.xy);
    float up = u_coneh[i].x + u_coneh[i].z * far;
    f *= level(u_coneh[i].y + up, v_gz + min(v_world.z, max(up, 0.0)), far);
    if (f <= 0.0) continue;
    if (lightOpen(v_world.xy, v_world.z, p.xy + vec2(0.0, coneLift(u_coneh[i].w)), 5.0, 4.0 + coneLift(u_coneh[i].w), b) <= 0.0) continue;
    vec3 to = vec3(p.xy - v_world.xy, 5.0 - v_world.z);
    float face = mix(1.0, 0.25 + 1.0 * max(0.0, dot(n, normalize(to))), known);
    l += vec3(1.0, 0.93, 0.74) * clamp(lround(f * face, 4.0, b), 0.0, 1.5);
  }
  vec3 k = min(vec3(1.1), l);
  vec3 rgb = c.rgb * (base * v_shade + k * 1.1 + back) + k * (30.0 / 255.0) + back * 0.05;
  // what is polished shows what stands round it, as a bulging mirror does: a texel looks out
  // from the middle of its slice, further the nearer the edge it is (and the way its own face
  // leans), at the light map's colours (every thing in the frame, from above). The first thing
  // tall enough to be seen there is laid over the metal in the light that falls on it; and the
  // light that comes from that way (a blast, a fire, a lamp) glints in it
  if (gloss > 1 && u_gik > 0.0) {
    vec2 loc = (v_tex / v_uv.zw - 0.5) * 2.0;
    vec2 way = vec2(loc.x * v_cs.x - loc.y * v_cs.y, loc.x * v_cs.y + loc.y * v_cs.x) + n.xy * 0.7 * known;
    float out_ = length(way);
    if (out_ > 0.3) {
      float much = (gloss == 3 ? 0.75 : 0.42) * smoothstep(0.3, 0.7, out_);
      vec3 seen = vec3(0.0);
      float hit = 0.0;
      for (int i = 0; i < 3; i++) {
        vec2 at = v_world.xy + way * (11.0 + float(i) * 8.0);
        vec4 m = textureLod(u_lc, (at - u_lmbox.xy) / u_lmbox.zw, 0.0);
        if (m.a * 255.0 >= 4.0) {
          seen = m.rgb * (u_amb + u_sun * 0.6 + traced(at - way * 3.0).rgb * 2.2 + k * 0.5);
          hit = 1.0 - float(i) * 0.2;
          break;
        }
      }
      seen = lstep(min(vec3(1.0), seen), 6.0, b);
      rgb = mix(rgb, seen, much * hit);
      vec3 far = traced(v_world.xy + way / out_ * 16.0).rgb;
      gleam += lstep(min(vec3(1.0), far * 2.4 * (1.0 - 0.6 * hit)), 5.0, b) * much;
    }
  }
  // the gleam is the light's own colour laid over the paint, most on what is pale already
  rgb = shoulder(rgb + min(vec3(1.0), gleam) * v_shade * (0.45 + 0.55 * max(c.r, max(c.g, c.b))));
  // a lamp shows its own colour however dark it is round it
  rgb = mix(rgb, min(vec3(1.0), c.rgb * 1.25 + 0.1), lamp * u_glow);
  o = vec4(rgb, 1.0);
}`;

/**
 * The sun's shadow map (sun-shadow.ts): the same instances as the frame's, each slice laid on
 * the ground where the sun would throw it from its height, the height kept as depth.
 */
export const CAST_VS = `#version 300 es
layout(location = 0) in vec4 a_pos;
layout(location = 1) in float a_rot;
layout(location = 2) in vec4 a_uv;
layout(location = 3) in float a_alpha;
layout(location = 4) in float a_res;
layout(location = 5) in float a_tint;
layout(location = 6) in vec2 a_tilt;
layout(location = 8) in vec4 a_trim;
uniform vec4 u_shbox;
uniform vec3 u_shear;${RELIEF_GLSL}
out vec2 v_tex;
flat out vec4 v_uv;
void main() {
  int id = gl_VertexID % 6;
  vec2 corner = vec2(id == 1 || id == 2 || id == 4 ? 1.0 : 0.0, id == 2 || id == 4 || id == 5 ? 1.0 : 0.0);
  // (the quad is only the part of the slice that has anything in it)
  vec2 cut = mix(a_trim.xy, a_trim.zw, corner);
  vec2 local = (cut - 0.5 * a_uv.zw) / a_res;
  float c = cos(a_rot), s = sin(a_rot);
  vec2 r = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  float high = max(0.0, groundAt(a_pos.xy) + a_pos.z + dot(r, a_tilt));
  vec2 g = (a_pos.xy + r + high * u_shear.xy - u_shbox.xy) / u_shbox.zw;
  gl_Position = vec4(g * 2.0 - 1.0, 1.0 - 2.0 * min(1.0, high / u_shear.z), 1.0);
  // an outline copy throws nothing, nor does what has all but faded away
  if (a_tint > 0.5 || a_alpha < 0.15) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  v_tex = cut;
  v_uv = a_uv;
}`;

export const CAST_FS = `#version 300 es
precision highp float;
in vec2 v_tex;
flat in vec4 v_uv;
uniform highp sampler2D u_atlas;
void main() {
  if (v_uv.y >= 0.0) {
    ivec2 t = ivec2(v_uv.xy) + ivec2(clamp(floor(v_tex), vec2(0.0), v_uv.zw - 1.0));
    if (texelFetch(u_atlas, t, 0).a < 0.5) discard;
  }
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

/** `relief`: the ground stands at different heights (a define, so flat venues pay nothing). */
/** `paint`: the painter for a ground the shader paints itself (ground-paint-glsl.ts). */
export const groundFs = (relief: boolean, paint = ''): string => `#version 300 es
${relief ? '#define RELIEF' : ''}
${paint ? '#define PAINT' : ''}
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
#ifdef RELIEF
uniform sampler2D u_map;   // the picture-to-ground map (relief-map.ts)
uniform vec4 u_depth;      // depth along the view: y * x + height * y, less z, times w
uniform float u_hk;        // height for one row of the map's shift
#endif
out vec4 o;${SKY_GLSL}${BOUNCE_GLSL}${TRACED_GLSL}${paint}
const float EDGE = 0.07;
vec3 tex(vec2 t) {
  return texelFetch(u_tex, ivec2(clamp(t, vec2(0.0), u_size - 1.0)), 0).rgb;
}
// Two texels are of the same thing when their colours are close: shades of one grass or one
// tarmac are, a white line and the road under it are not.
float like(vec3 a, vec3 b) {
  vec3 e = a - b;
  return dot(e, e) < EDGE * EDGE ? 1.0 : 0.0;
}
void main() {
  // The ground is painted one texel to the art pixel and drawn on the screen's fine grid (u_fine
  // cells to the art pixel, about two device pixels a cell). Nothing is blended: every fine cell
  // takes one texel's colour whole. Where the four texels round a cell are of different things (a
  // painted line on tarmac, a kerb, the road's edge) the cell goes to whichever has the most of
  // them near it, so the edge between two things is one clean line that steps in fine cells, as
  // sharp as a car's own edge, and a stair of art pixels along a bend comes out a straight slope.
  // Texels of the same thing (two shades of grass) are still dithered into each other.
  vec2 cell = floor(v_uv * u_size * u_fine);
  vec2 p = (cell + 0.5) / u_fine - 0.5;
#ifdef RELIEF
  // raised ground: this cell of the picture shows ground that lies some rows further south
  vec4 rl = texelFetch(u_map, ivec2(clamp(floor((cell + 0.5) / u_fine), vec2(0.0), u_size - 1.0)), 0);
  float shift = floor(rl.r * 255.0 + 0.5);
  p.y += shift;
  // (on a slope, the part of a row the whole shift is out by: lines up a ramp come out straight)
  if (rl.b <= 0.75 && rl.a > 0.0) p.y += (rl.a * 255.0 - 128.0) / 127.0;
#endif
  ivec2 ci = ivec2(cell);
#ifdef PAINT
  // The country and the road are painted here, for this cell (ground-paint-glsl.ts); the canvas
  // holds only what has been marked on them since (skids, cracks, scorches, the grid), read
  // between its texels so a mark's edge is as soft as the mark, and laid over.
  vec2 gp = p + 0.5;
  vec3 c = groundPaint(gp, ivec2(floor(gp * u_fine)));
  vec4 mk = texture(u_tex, gp / u_size);
  // (planks stand over whatever lies on the ground: a pool is under them, not on them)
  if ((g_way > 1.5 && g_way < 2.5) || g_way > 4.5) mk = vec4(0.0);
  c = c * (1.0 - mk.a) + mk.rgb;
#else
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 d = vec2(bayer(ci), bayer(ci.yx + ivec2(2, 1)));
  vec3 c00 = tex(i);
  vec3 c10 = tex(i + vec2(1.0, 0.0));
  vec3 c01 = tex(i + vec2(0.0, 1.0));
  vec3 c11 = tex(i + vec2(1.0, 1.0));
  // how much of the cell's surroundings each texel and the texels like it hold
  vec4 wt = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  float e01 = like(c00, c10);
  float e02 = like(c00, c01);
  float e03 = like(c00, c11);
  float e12 = like(c10, c01);
  float e13 = like(c10, c11);
  float e23 = like(c01, c11);
  vec4 sc = wt * 1.001 + vec4(
    wt.y * e01 + wt.z * e02 + wt.w * e03,
    wt.x * e01 + wt.z * e12 + wt.w * e13,
    wt.x * e02 + wt.y * e12 + wt.w * e23,
    wt.x * e03 + wt.y * e13 + wt.z * e23);
  vec3 c = c00;
  float top = sc.x;
  if (sc.y > top) { top = sc.y; c = c10; }
  if (sc.z > top) { top = sc.z; c = c01; }
  if (sc.w > top) { c = c11; }
  // within one thing, the dither as before
  vec2 pk = step(d, f);
  vec3 dth = pk.y < 0.5 ? (pk.x < 0.5 ? c00 : c10) : (pk.x < 0.5 ? c01 : c11);
  if (like(dth, c) > 0.5) c = dth;
#endif
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
#ifdef BRIGHT
  // (the bright look is plain: only a breath of grain)
  c = clamp(c * (1.0 + (k * m - 1.0) * 0.25), 0.0, 1.0);
#else
  c = clamp(c * k * m, 0.0, 1.0);
#endif
  vec2 wp = (cell + 0.5) / u_fine;
#ifdef RELIEF
  wp.y += shift;
  // the face of a drop is bare earth or rock in beds; all of it takes the light as it lies
  if (rl.b > 0.75) {
    float bed = mod(shift, 4.0) < 1.0 ? 0.72 : 1.0;
    float lum = dot(c, vec3(0.3, 0.5, 0.2));
    // a jump piece's face is in its own look (leaps.ts): stone, timber, earth or concrete
    float code = floor(rl.a * 255.0 + 0.5);
    float sk = floor(code / 32.0);
    if (sk > 0.5) {
      // along the wall, whichever of the piece's sides it is, and up it
      float turn = (code - sk * 32.0) * 0.19634954;
      vec2 dir = vec2(cos(turn), sin(turn));
      float ac = dot(wp, dir) + dot(wp, vec2(-dir.y, dir.x)) + 800.0;
      if (sk < 1.5) {
        // coursed stone: blocks in rows, every other row half a block over
        float row = floor(shift / 5.0);
        float sv = ac + mod(row, 2.0) * 5.0;
        float st = hash(vec2(floor(sv / 10.0), row));
        c = mod(shift, 5.0) < 1.0 || mod(sv, 10.0) < 1.0 ? vec3(0.36, 0.35, 0.33) : vec3(0.62, 0.60, 0.56) * (0.86 + 0.22 * st);
      } else if (sk < 2.5) {
        // a timber frame: boards on edge between stout posts
        float post = mod(ac, 18.0);
        float st = hash(vec2(floor(shift / 4.0), floor(ac / 18.0)));
        c = vec3(0.66, 0.51, 0.33) * (0.9 + 0.16 * st);
        if (mod(shift, 4.0) < 1.0) c = vec3(0.34, 0.25, 0.16);
        if (post < 3.4) c = post < 0.7 || post > 2.7 ? vec3(0.30, 0.22, 0.14) : vec3(0.50, 0.38, 0.25);
      } else if (sk < 3.5) {
        // a bank of the same packed earth as the way, darker, in beds
        float st = hash(vec2(floor(ac / 6.0), floor(shift / 3.0)));
#ifdef PAINT
        c = WAYSUN(u_cD) / 255.0 * 0.66 * (0.92 + 0.14 * st);
#else
        c = vec3(0.55, 0.42, 0.28) * (0.9 + 0.14 * st);
#endif
        if (mod(shift + floor(st * 2.0), 6.0) < 1.0) c *= 0.82;
      } else {
        // poured concrete in panels
        c = vec3(0.60, 0.60, 0.62);
        if (mod(ac, 26.0) < 1.0 || mod(shift, 9.0) < 1.0) c = vec3(0.44, 0.44, 0.46);
      }
    } else
    c = mix(c, mix(vec3(0.38, 0.29, 0.21), vec3(0.34, 0.35, 0.38), tar) * (0.75 + 0.5 * lum), 0.85) * bed;
  }
  float shd = rl.g * (255.0 / 128.0);
#ifdef PAINT
  // (the top of a jump is a road: it keeps its colours up the slope)
  if (g_way > 0.5 && rl.b <= 0.75) shd = mix(1.0, shd, 0.3);
#endif
  c = min(vec3(1.0), c * shd);
  gl_FragDepth = clamp(1.0 - (wp.y * u_depth.x + shift * u_hk * u_depth.y - 4.0 - u_depth.z) * u_depth.w, 0.0, 1.0);
#endif
  // Snow settles in patches, and last on the tarmac where the cars keep it off.
  if (u_snow > 0.0) {
    float drift = soft(wp / 16.0 + 40.0);
#ifdef BRIGHT
    // (the bright look is plain: one soft white laid in round drifts with a soft edge, no cells,
    // no specks, and only a thin drift here and there across the road)
    float lie = mix(drift * 0.6 + soft(wp.yx / 9.0 + 7.0) * 0.4, drift * 0.55 + soft(wp.yx / 6.0 + 3.0) * 0.45, tar);
    float full = u_snow * (1.3 - 0.9 * tar) - 0.12;
    float on = (1.0 - smoothstep(full - 0.07, full + 0.02, lie)) * (1.0 - 0.25 * tar);
    vec3 s = mix(vec3(0.88, 0.91, 0.97), vec3(0.94, 0.96, 1.0), soft(wp.yx / 21.0 + 90.0));
    c = mix(c, s, on);
#else
    // on grass and dirt it lies in drifts with dithered edges; on tarmac the cars keep it to a
    // thin dusting, a cell here and there, thicker where a drift has blown across
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
#endif
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
  // (how high this ground stands: a light does not reach over a sheer edge)
  float gh = 0.0;
#ifdef RELIEF
  gh = shift * u_hk;
#endif
  float b = bayer(ci);
  for (int n = 0; n < ${MAX_LIGHTS}; n++) {
    if (n >= u_lcount) break;
    vec4 lp = u_lpos[n];
    float dist = length(wp - lp.xy);
    if (dist >= lp.z) continue;
    float e = 1.0 - dist / lp.z;
    e *= level(u_lgz[n], gh, dist);
    l += u_lcol[n] * clamp(lround(e * (0.4 + 0.6 * e) * lp.w, 4.0, b), 0.0, 1.5)
      * lightOpen(wp, 0.0, lp.xy, 3.0, clamp(lp.z * 0.35, 4.0, 12.0), b);
  }
  for (int n = 0; n < ${MAX_CONES}; n++) {
    if (n >= u_ccount) break;
    float f = beam(wp, u_cone[n], u_coneh[n].w);
    if (f <= 0.0) continue;
    float far = distance(wp, u_cone[n].xy);
    f *= level(u_coneh[n].y + u_coneh[n].x + u_coneh[n].z * far, gh, far);
    l += vec3(1.0, 0.93, 0.74) * clamp(lround(f, 4.0, b), 0.0, 1.5)
      * lightOpen(wp, 0.0, u_cone[n].xy + vec2(0.0, coneLift(u_coneh[n].w)), 5.0, 4.0 + coneLift(u_coneh[n].w), b);
  }
  // (too much light keeps its colour as it tops out: no ring of odd hues round a bright pool)
  vec3 q = l * min(1.0, 1.1 / max(max(l.r, l.g), max(l.b, 0.001)));
  // (and what stands in the sun beside it throws some of its own colour back on it, in steps)
  vec3 back;
  float occ = 1.0;
  if (u_gik > 0.0) {
    // traced: light from all round, stopped by what is in between, and the sky's own light less
    // where things stand close (the foot of a wall, a gap between two buildings)
    vec4 gi = traced(wp);
    // (a little is let go first, so open ground far from anything is clean, not stippled)
    back = lstep(min(vec3(0.9), max(vec3(0.0), gi.rgb * 2.0 - 0.05)), 6.0, b);
    // (none of it on the ground a thing stands on, or hangs over in a jump: that ground is in
    // the thing's own texel of the field, which holds the light the thing itself gives off)
    if (u_lmk > 0.0 && textureLod(u_lc, (wp - u_lmbox.xy) / u_lmbox.zw, 0.0).a * 255.0 > 3.0) back = vec3(0.0);
    occ = 1.0 - 0.6 * (1.0 - lstep(min(1.0, gi.a * 1.1), 8.0, b));
    if (u_gik > 1.5) {
      o = vec4(gi.rgb * 2.0 + vec3(0.25 * gi.a), 1.0);
      return;
    }
  } else back = lstep(min(vec3(0.6), bounced(wp)), 6.0, b);
  c = shoulder(c * (u_amb * occ + q * 1.1 + back) + q * (30.0 / 255.0) + back * 0.06);
  o = vec4(c, 1.0);
}`;

/**
 * Shadows cast from the shape of tall scenery: a one-byte mask over the ground, drawn on the
 * ground's fine grid. Where the mask is part covered (its edge, blended between art px) it is
 * dithered on the Bayer grid, so the edge steps in fine cells instead of blurring.
 */
export const shadowFs = (relief: boolean): string => `#version 300 es
${relief ? '#define RELIEF' : ''}
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_size;
uniform float u_alpha;
uniform float u_fine;
uniform float u_only;
uniform sampler2D u_deep;
#ifdef RELIEF
uniform sampler2D u_map;
#endif
out vec4 o;
float bayer(ivec2 p) {
  int i = (p.y & 3) * 4 + (p.x & 3);
  int t[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(t[i]) + 0.5) / 16.0;
}
void main() {
  vec2 cell = floor(v_uv * u_size * u_fine);
  vec2 at = (cell + 0.5) / u_fine;
#ifdef RELIEF
  // a shadow lies on the ground, so it is found where the ground under this cell is
  at.y += floor(texelFetch(u_map, ivec2(clamp(floor(at), vec2(0.0), u_size - 1.0)), 0).r * 255.0 + 0.5);
#endif
  float a = texture(u_tex, at / u_size).r;
  if (a < 0.05${SMOOTH_LIGHT ? '' : ' || a < bayer(ivec2(cell))'}) discard;
  // the far side of a deck is in deeper shade than a thrown shadow, deepest at its foot
  float deep = texture(u_deep, at / u_size).r;
  if (u_only > 0.5 && deep < 0.02) discard;
  o = vec4(0.0, 0.0, 0.0, u_alpha * (u_only > 0.5 ? 1.2 * deep : 1.0 + 1.2 * deep)${SMOOTH_LIGHT ? ' * min(1.0, a * 1.15)' : ''});
}`;
