import { NEAR_Q, OFF, WILD_Q, type GroundPaint } from '../ground-paint';
import { Field, LEDGES } from '../terrain';
import { SHOULDER } from '@demodogs/sim';

const TERRAINS = ['grass', 'dirt', 'sand', 'snow', 'gravel', 'paved'];

/** The uniforms the painter reads (ground-layer.ts sets them from a `GroundPaint`). */
export const PAINT_UNIFORMS = [
  'u_pf',
  'u_pfSize',
  'u_pn',
  'u_ps',
  'u_pw',
  'u_pwSize',
  'u_seed',
  'u_cG',
  'u_cG2',
  'u_cD',
  'u_cOut',
  'u_road',
  'u_line',
  'u_wild',
  'u_oval',
] as const;

/**
 * The ground painted in the shader: `groundPaint(wp, gc)` gives the colour of the country and the
 * road at a point of the map (art px), for the screen cell `gc` that shows it. It is terrain.ts
 * over again (the same noise, the same hash, the same road measured across and along its line),
 * but worked out for every cell of the screen's fine grid instead of once per art pixel, so a
 * road's edge, a kerb block, a painted line and a blade of grass are as fine as the screen is.
 * Speckle is a cell across. Colours are 0 to 255 as in terrain.ts until the last line.
 *
 * It is also where the paint was cleaned up: lines are whole, tarmac is a lighter grey, and the
 * far country sinks away evenly instead of in dithered steps.
 */
export function paintGlsl(P: GroundPaint): string {
  const L = P.line;
  const f = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));
  return `
#define TERRAIN ${TERRAINS.indexOf(P.terrain)}
${P.style === 'dirt' ? '#define DIRT_ROAD' : ''}
${L ? '#define ROAD' : ''}
${L?.lanes ? '#define LANES' : ''}
${L?.gully ? '#define GULLY' : ''}
${P.oval ? '#define BOWL' : ''}
${P.terrain === 'paved' || P.terrain === 'gravel' || P.terrain === 'dirt' ? '#define HAZARD' : ''}
uniform sampler2D u_pf;      // the noise: big, mid, bare, small
uniform vec2 u_pfSize;
uniform highp usampler2D u_pn;  // nearest sample of the road's line: on the ground, on a deck
uniform sampler2D u_ps;      // the line's samples
uniform sampler2D u_pw;      // how far from the road
uniform vec2 u_pwSize;
uniform int u_seed;
uniform vec3 u_cG;
uniform vec3 u_cG2;
uniform vec3 u_cD;
uniform vec3 u_cOut;
uniform float u_road;
uniform vec4 u_line;         // samples, step, where the pit apron begins and ends
uniform vec2 u_wild;
uniform vec4 u_oval;
float hash2(int x, int y, int seed) {
  uint h = uint(x) * 374761393u + uint(y) * 668265263u + uint(seed) * 974711u;
  h = (h ^ (h >> 13)) * 1274126177u;
  h = (h ^ (h >> 15)) * 2246822519u;
  return float(h ^ (h >> 16)) / 4294967296.0;
}
vec4 fieldsAt(vec2 p) {
  return texture(u_pf, (p / ${f(Field.Q)} + 0.5) / u_pfSize);
}
// One cell of open country (terrain.ts terrainPixel). p is the art pixel's corner, as there.
vec3 country(vec2 p, ivec2 gc, vec4 F) {
  float h = hash2(gc.x, gc.y, u_seed);
  float a = F.r + (h - 0.5) * 0.06;
  float b = F.g;
  float e = F.b + (hash2(gc.x, gc.y, u_seed + 9) - 0.5) * 0.07;
  float c = F.a;
  vec3 col = u_cG;
  float k = 1.0;
#if TERRAIN == 0
  if (a < 0.3) k = 0.82;
  else if (a < 0.48) k = 0.92;
  else if (a < 0.68) k = 1.0;
  else if (a < 0.84) col = u_cG2;
  else col = u_cG2 * vec3(1.2, 1.07, 0.92);
  if (e > 0.88) col = u_cD * (0.9 + c * 0.2);
  else if (e > 0.83) col = (col + u_cD) * 0.5;
  else if (c > 0.7 && b > 0.45) {
    // clumps of long grass: dark blades a few cells tall, a light tip here and there
    float blade = hash2(gc.x, gc.y / 3, u_seed + 5);
    if (blade < 0.5) k *= 0.8;
    else if (blade > 0.93) k *= 1.2;
  }
#elif TERRAIN == 1
  if (a < 0.28) k = 0.8;
  else if (a < 0.48) k = 0.91;
  else if (a < 0.7) k = 1.0;
  else if (a < 0.86) col = u_cG2;
  else col = u_cG2 * 1.1;
  if (b > 0.68) {
    if (h < 0.2) k *= 1.24;
    else if (h > 0.84) k *= 0.74;
  }
  if (e > 0.82) col = u_cD * (0.82 + c * 0.15);
#elif TERRAIN == 2
  if (a < 0.3) k = 0.88;
  else if (a < 0.5) k = 0.95;
  else if (a < 0.72) k = 1.0;
  else col = u_cG2 * (a < 0.88 ? 1.0 : 1.06);
  if (a > 0.42 && e < 0.78) {
    // wind ripples across the open sand: a dark line with a light one behind it
    float wave = mod(p.y + (b - 0.5) * 70.0 + p.x * 0.12, 6.0);
    if (wave < 0.6) k *= 0.9;
    else if (wave < 1.2) k *= 1.05;
  }
  if (e > 0.87) col = u_cD * (0.95 + c * 0.2);
  else if (e > 0.82) col = (col + u_cD) * 0.5;
  if (c > 0.82 && h < 0.1) k *= 0.76;
#elif TERRAIN == 3
  if (a < 0.3) col *= vec3(0.89, 0.93, 0.99);
  else if (a < 0.52) k = 0.96;
  else if (a < 0.78) col = u_cG2;
  else col = vec3(246.0, 249.0, 253.0);
  if (c > 0.55 && mod(p.y + floor(b * 40.0 + 0.5), 5.0) < 0.5) k *= 1.05;
  if (e > 0.87) {
    col = vec3(150.0, 182.0, 208.0) * (0.94 + c * 0.12);
    k = hash2(gc.x >> 2, gc.y, u_seed + 6) < 0.07 ? 1.25 : 1.0;
  } else if (e > 0.83 && h < 0.5) col = vec3(172.0, 198.0, 220.0);
  else if (c > 0.9 && h < 0.1) col = u_cD;
#elif TERRAIN == 4
  if (a < 0.3) k = 0.86;
  else if (a < 0.5) k = 0.94;
  else if (a < 0.72) k = 1.0;
  else col = u_cG2 * (a < 0.88 ? 1.0 : 1.07);
  // every cell a stone of its own shade
  if (h < 0.1) k *= 0.76;
  else if (h < 0.28) k *= 0.9;
  else if (h > 0.92) k *= 1.22;
  else if (h > 0.76) k *= 1.09;
  if (e > 0.8) k *= 0.76;
#else
  // slabs laid like bricks, each a shade of its own, with a dark joint and a lit edge
  float S = 20.0 + float(u_seed % 3) * 4.0;
  float sy = floor(p.y / S);
  float ox = p.x + (mod(sy, 2.0) > 0.5 ? floor(S / 2.0) : 0.0);
  float sx = floor(ox / S);
  float lx = ox - sx * S;
  float ly = p.y - sy * S;
  float hs = hash2(int(sx), int(sy), u_seed + 7);
  k = hs > 0.93 ? 0.8 : hs < 0.05 ? 1.14 : 0.94 + hs * 0.12;
  if (e > 0.9) {
    col = u_cD * (0.95 + h * 0.1);
    k = 1.0;
  } else if (lx < 0.6 || ly < 0.6) k *= 0.66;
  else if (lx < 1.2 || ly < 1.2) k *= 1.1;
  if (a < 0.2) k *= 0.93;
  else if (a > 0.86) k *= 1.05;
#endif
#if TERRAIN != 5
  // Depth. The light comes from the top left: ground that rises away from it is lit, ground
  // that falls away is in shade; and where the country steps up a level there is a ledge.
  float a0 = F.r;
  float hi = fieldsAt(p - 3.0).r;
  float lo = fieldsAt(p + 3.0).r;
  float sh = clamp((lo - hi) * 4.5 + (fieldsAt(p + 1.0).g - fieldsAt(p - 1.0).g) * 1.8, -0.2, 0.2);
  k *= 1.0 + sh;
  for (int n = 0; n < ${LEDGES.length}; n++) {
    float t = n == 0 ? ${f(LEDGES[0]!)} : ${f(LEDGES[1]!)};
    if (a0 < t && hi >= t) {
#if TERRAIN == 3
      col *= vec3(0.74, 0.82, 0.96);
#else
      k *= 0.6;
#endif
    } else if (a0 >= t && hi < t && fieldsAt(p - 1.0).r < t) k *= 1.16;
  }
#endif
  return col * k;
}
#ifdef ROAD
vec4 sampleOf(int i, int row) {
  return texelFetch(u_ps, ivec2(i, row), 0);
}
vec3 kerbOf(float al, float q) {
#ifdef HAZARD
  return mod(floor((al + q) / 5.0), 2.0) < 0.5 ? vec3(28.0, 28.0, 32.0) : vec3(232.0, 182.0, 30.0);
#else
  return mod(floor(al / 7.0), 2.0) < 0.5 ? vec3(200.0, 50.0, 46.0) : vec3(239.0, 234.0, 224.0);
#endif
}
// The road laid over the country in c (terrain.ts paintRoad, and ground.ts paintLanes).
void roadOver(inout vec3 c, vec2 wp, ivec2 gc, vec4 F) {
  uint near = texelFetch(u_pn, ivec2(wp / ${f(NEAR_Q)}), 0).r;
  if (near == 65535u) return;
  int n = int(u_line.x);
  // the nearest sample of the three round the one the map gives (the map is in blocks)
  int i = int(near);
  vec4 S = sampleOf(i, 0);
  float best = dot(wp - S.xy, wp - S.xy);
  for (int o = -1; o <= 1; o += 2) {
    int j = (i + o + n) % n;
    vec4 Sj = sampleOf(j, 0);
    float dj = dot(wp - Sj.xy, wp - Sj.xy);
    if (Sj.w < ${f(OFF - 1)} && dj < best) {
      best = dj;
      S = Sj;
      i = j;
    }
  }
  float half_ = u_road * 0.5;
  float sn = sin(S.z), cs = cos(S.z);
  vec2 dd = wp - S.xy;
  float ac = -sn * dd.x + cs * dd.y;
  float side = ac >= 0.0 ? 1.0 : -1.0;
  float d = abs(ac);
  float al = float(i) * u_line.y + cs * dd.x + sn * dd.y;
  float ali = floor(al);
  float hsh = hash2(gc.x, gc.y, u_seed + 11);
  float bend = S.w;
  bool kerbed = bend != 0.0;
  bool outer = kerbed && (bend > 0.0 ? side < 0.0 : side > 0.0);
  float mid = F.g;
  float lit = side * 0.7071 * (sn - cs);
  bool lane = false;
  float off = 0.0;
  float climb = 1.0;
  float wide = 0.0;
#ifdef LANES
  vec4 Ln = sampleOf(i, 1);
  vec2 ln = side < 0.0 ? Ln.xy : Ln.zw;
  if (ln.x > 0.0 && d >= half_ - 1.0 && d <= ln.y) {
    // an on-ramp beside raised road, and the shoulder between: the road's own surface from its
    // middle out to the line along its edge, with arrows up the lane the way it runs
    lane = true;
    wide = ln.x;
    off = abs(d - (half_ + ${f(SHOULDER)} + wide * 0.5));
    climb = sampleOf(i, 2).r;
    float kk = (d - (half_ - 1.0)) / (ln.y - (half_ - 1.0));
    d = half_ * 0.12 + kk * (half_ * 0.88 - 2.2);
  }
#endif
  vec3 col;
  float m = 1.0;
#ifdef DIRT_ROAD
  if (true) {
    float ext = half_ + (mid - 0.5) * 9.0;
    if (d > ext + 4.0) return;
    if (d > ext) {
      // the bank beside a sunken road
      if (hsh > 0.85) return;
      c *= lit < -0.15 ? 0.62 : lit > 0.15 ? 1.16 : 0.85;
      return;
    }
    col = (u_cD * 0.75 + u_cG * 0.25) * 0.84;
    m = 0.95 + hash2(int(floor(al / 150.0)), 0, u_seed + 12) * 0.1;
    float lw = abs(d - half_ * 0.44);
    if (lw < 5.5) {
      // the two wheel ruts: polished pale, streaked along the road
      m *= 1.17;
      if (hash2(int(floor(d * 2.0 + 0.5)), int(floor(al / 11.0)), u_seed + 13) < 0.3) m *= 0.9;
    } else if (d < 4.0) {
      if (hsh < 0.12) m *= 1.25;
#if TERRAIN == 0
      else if (hsh > 0.82) col = u_cG;
#endif
    } else if (hsh < 0.07) m *= 0.78;
    else if (hsh > 0.95) m *= 1.2;
    if (kerbed && mod(al, 5.0) < 0.6) m *= 0.9;
    if (d > ext - 6.0) m *= lit > 0.15 ? 0.64 : lit < -0.15 ? 1.2 : hsh < 0.22 ? 0.8 : 1.08;
  }
#else
  if (d <= half_) {
    // tarmac takes a little of the country's colour, so every venue's road is its own grey
    col = vec3(74.0, 74.0, 82.0) * 0.88 + u_cG * 0.072;
    float sec = floor(al / 150.0);
    m = 0.95 + hash2(int(sec), 1, u_seed + 12) * 0.1;
    if (hash2(int(sec), 2, u_seed + 12) < 0.3 && side > 0.0) m *= 0.94;
    if (mod(al, 150.0) < 0.5) m *= 0.84;
    // the middle, where nothing drives, is paler; the two lanes are dark with rubber
    if (d < half_ * 0.2) m *= 1.05;
    float lw = abs(d - half_ * 0.46);
    if (lw < 6.0 && hash2(int(floor(d * side * 2.0 + 0.5)), int(floor(al / 9.0)), u_seed + 13) < 0.72)
      m *= kerbed ? 0.88 : 0.94;
    if (lw < 1.3 && hash2(int(floor(al / 46.0)), int(side), u_seed + 17) < 0.55) m *= 0.88;
    if (d > half_ - 9.0) m *= 0.94;
#if TERRAIN == 5
    // a pavement stands above the road and shades its edge on the side towards the light
    if (lit > 0.15 && d > half_ - 3.0) m *= 0.68;
#endif
    // the country creeps onto the edge of the road: dust, sand, snow
    float creep = d - (half_ - 10.0 - mid * 6.0);
    if (creep > 0.0 && !kerbed && !lane) {
      float cm = ${P.terrain === 'snow' ? '0.2' : P.terrain === 'paved' ? '0.03' : '0.07'};
      float pr = pow(creep / (10.0 + mid * 6.0), 2.0) * cm;
      if (hsh < pr) {
#if TERRAIN == 3
        col = vec3(236.0, 241.0, 248.0);
        m = 1.0;
#elif TERRAIN == 5
        col = u_cG * 1.3;
        m = 0.9 + hsh * 0.4;
#else
        col = u_cD;
        m = 0.9 + hsh * 0.4;
#endif
      }
    }
    // the painted lines: one down each edge, dashes down the middle, whole but for a rare scuff
    bool worn = hash2(int(floor(al / 4.0)), d < 3.0 ? 0 : int(side), u_seed + 14) < 0.015;
    if (d > half_ - 4.4 && d < half_ - 2.4 && !worn) {
#if TERRAIN == 5
      col = col * 0.2 + vec3(214.0, 178.0, 40.0) * 0.8;
#else
      col = col * 0.2 + vec3(236.0, 232.0, 214.0) * 0.8;
#endif
      m = 1.0;
    } else if (d < 1.1 && mod(al, 30.0) < 14.0 && !worn && !lane) {
      col = col * 0.2 + vec3(230.0, 224.0, 200.0) * 0.8;
      m = 1.0;
    }
  }
#endif
#ifndef DIRT_ROAD
  else if (side > 0.0 && (float(i) >= u_line.z || float(i) < u_line.w) && d <= half_ + 26.0) {
    // the pit apron: poured concrete in bays, a white line against the road, hazard stripes
    // along its far edge, and its own shadow where it faces away from the light
    float q = d - half_;
    if (q > 22.0) {
      col = mod(floor((al + q) / 4.0), 2.0) < 0.5 ? vec3(28.0, 28.0, 32.0) : vec3(232.0, 182.0, 30.0);
      if (q > 25.0 && lit < 0.0) m = 0.6;
    } else if (q < 1.6) col = vec3(228.0, 226.0, 214.0);
    else {
      col = vec3(138.0, 136.0, 132.0);
      m = 0.94 + hash2(int(floor(al / 22.0)), 3, u_seed + 18) * 0.12;
      if (mod(al, 22.0) < 0.6) m *= 0.7;
      else if (hsh < 0.03) m *= 0.88;
    }
  }
#if TERRAIN == 5
  else {
    // a kerbstone, then a pavement of small slabs, all the way round
    float q = d - half_;
    if (q > 15.0) return;
    if (kerbed && q <= 5.0) {
      col = kerbOf(al, q);
      if (q > 4.0) m = 0.7;
    } else if (q <= 3.0) {
      col = vec3(178.0, 176.0, 170.0);
      m = mod(al, 8.0) < 0.6 ? 0.72 : q < 1.0 ? 1.08 : 1.0;
    } else {
      col = u_cG * 1.3;
      m = 0.95 + hash2(int(floor(al / 12.0)), int(floor((q - 3.0) / 6.0) * side), u_seed + 15) * 0.1;
      if (mod(al, 12.0) < 0.6 || mod(q - 3.0, 6.0) < 0.6) m *= 0.78;
      if (q > 14.0) m *= 0.7;
    }
  }
#else
  else if (kerbed && d <= half_ + 5.5) {
    // kerb blocks, a lit lip against the road and a shadow on the far side
    col = kerbOf(al, d - half_);
    m = 0.96 + hash2(int(floor(al / 7.0)), int(side), u_seed + 16) * 0.08;
    if (d > half_ + 4.2) m *= lit < 0.0 ? 0.55 : 0.85;
    else if (d < half_ + 1.2) m *= lit < 0.0 ? 1.12 : 0.8;
  } else {
    // the verge: bare ground beside the road, widening into a run-off outside a bend
    float from = kerbed ? half_ + 5.5 : half_;
    float vw = 5.0 + mid * 13.0 + (outer ? min(1.0, abs(bend)) * 16.0 : 0.0);
    float q = (d - from) / vw;
    if (q >= 1.0) return;
    // solid by the road, thinning out into the country
    if (q > 0.5 && hsh < (q - 0.5) * 2.0) return;
#if TERRAIN == 3
    col = vec3(236.0, 241.0, 248.0);
    if (q > 0.6) col = vec3(190.0, 206.0, 228.0);
#else
    col = u_cD;
    m = 0.9 + F.a * 0.2;
    if (outer) {
      // the run-off is raked gravel: lighter, stony
      m *= 1.12;
      if (hsh < 0.18) m *= 0.8;
      else if (hsh > 0.85) m *= 1.18;
    } else if (hsh < 0.06) m *= 0.8;
    else if (hsh > 0.95) m *= 1.18;
#endif
    // the road stands a little above the ground: it throws a shadow on the verge on the side
    // away from the light, and shows a lit lip on the side towards it
    float e = d - from;
    if (lit < -0.15 && e < 4.5) m *= 0.56;
    else if (lit > 0.15 && e < 1.6) m *= 1.2;
    else if (e < 1.2) m *= 0.74;
  }
#endif
#endif
  if (lane && climb < 1.0 && off < 9.0 && mod(al + off, 30.0) < 2.6 && wide >= 30.0) {
    c = vec3(232.0, 226.0, 220.0);
    return;
  }
  c = col * m;
}
#endif
vec3 groundPaint(vec2 wp, ivec2 gc) {
  vec2 p = wp - 0.5;
  vec4 F = fieldsAt(p);
  vec3 c = country(p, gc, F);
#ifdef ROAD
  // the wilds: the further the country is from the road, the more it sinks into the venue's
  // outside colour, so the track stands out lit and the edges of the map fall away dark
  float far = texture(u_pw, (p / ${f(WILD_Q)} + 0.5) / u_pwSize).r;
  c = mix(c, u_cOut, clamp((far - u_wild.x) / (u_wild.y - u_wild.x), 0.0, 1.0) * 0.42);
#ifdef GULLY
  uint under = texelFetch(u_pn, ivec2(wp / ${f(NEAR_Q)}), 0).g;
  if (under != 65535u) {
    // under a flyover there is no road on the ground: a trampled gully of dirt
    float gd = distance(wp, sampleOf(int(under), 0).xy) - u_road * 0.5;
    float gh = hash2(gc.x, gc.y, u_seed + 21);
    if (gd <= 17.0 && !(gd > 11.0 && gh < (gd - 11.0) / 6.0))
      c = u_cD * (gd < 6.0 ? 0.62 : 1.0) * (gh < 0.06 ? 0.7 : gh > 0.94 ? 1.2 : 1.0);
  }
#endif
  roadOver(c, wp, gc, F);
#endif
#ifdef BOWL
  // a derby bowl: dark outside the wall, a trodden rim, the floor churned in rings
  vec2 ev = (wp - u_oval.xy) / u_oval.zw;
  float q = length(ev);
  float lean = min(u_oval.z, u_oval.w);
  float boff = (q - 1.0) * lean;
  float bh = hash2(gc.x, gc.y, u_seed + 31);
  if (boff > 6.0) c = u_cOut * (0.86 + F.g * 0.28 + (bh < 0.08 ? 0.12 : 0.0));
  else if (boff > -3.0) c = u_cD * (boff > 3.0 ? 0.7 : 1.0) * (bh < 0.1 ? 0.8 : bh > 0.9 ? 1.15 : 1.0);
  else {
    float ang = atan(ev.y, ev.x);
    float ring = floor(q * lean * 0.5);
    float streak = hash2(int(ring), int(floor(ang * (6.0 + ring * 0.35))), u_seed + 32);
    float band = max(0.0, 1.0 - abs(q - 0.66) / 0.3);
    float bm = 1.0;
    if (streak < 0.3) bm -= 0.13 * band;
    else if (streak > 0.86) bm += 0.08 * band;
    float blit = (-ev.x - ev.y) / (q * 1.4142 + 0.0001);
    if (boff > -(5.0 + 16.0 * max(0.0, blit))) bm *= 0.64;
    c *= bm;
  }
#endif
  return clamp(c / 255.0, 0.0, 1.0);
}
`;
}
