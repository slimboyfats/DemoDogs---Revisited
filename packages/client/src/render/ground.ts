import {
  SHOULDER,
  laneWide,
  lanesOf,
  liftsOf,
  moundHeight,
  type StaticProp,
  type World,
} from '@demodogs/sim';
import {
  type Fields,
  makeFields,
  paintBowl,
  paintGully,
  paintRoad,
  paintTerrain,
  paintWilds,
  rgbOf,
  terrainOf,
  type Rgb,
} from './terrain';
import { bakePaint, toneAt, type GroundPaint } from './ground-paint';

const TAU = Math.PI * 2;

/** Digits three pixels by five, for the numbers painted on the starting grid. */
const DIGITS = [
  ['###', '# #', '# #', '# #', '###'],
  [' # ', '## ', ' # ', ' # ', '###'],
  ['###', '  #', '###', '#  ', '###'],
  ['###', '  #', '###', '  #', '###'],
  ['# #', '# #', '###', '  #', '  #'],
  ['###', '#  ', '###', '  #', '###'],
  ['###', '#  ', '###', '# #', '###'],
  ['###', '  #', '  #', '  #', '  #'],
  ['###', '# #', '###', '# #', '###'],
  ['###', '# #', '###', '  #', '###'],
];

/** A small seeded random for the ground's texture, so a venue's grass looks the same each time. */
function mulberry(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Ground {
  cv: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  /** The box painted since a renderer last copied the ground (x0, y0, x1, y1), or null. */
  dirty: [number, number, number, number] | null;
  /**
   * Set when the country and the road are not on the canvas at all: the renderer paints them
   * itself from this, as fine as the screen is, and the canvas holds only the marks laid over
   * them (clear where there are none).
   */
  paint: GroundPaint | null;
  /** About what colour the ground is at (x, y), marks aside. */
  tone(x: number, y: number): Rgb;
}

/**
 * Whether new grounds leave the country and the road to the renderer (`Ground.paint`). The pixel
 * engine turns it on; the canvas renderer reads the whole ground from the canvas, as do tests.
 */
export const groundMode = { shader: false };
/** The most samples a road's line may have for the shader to paint it (one texel a sample). */
const MOST_SAMPLES = 4096;

/** Note that the box around (x, y) with half-size r was painted. */
export function markGround(g: Ground, x: number, y: number, r: number): void {
  const d = g.dirty;
  const x0 = Math.floor(x - r);
  const y0 = Math.floor(y - r);
  const x1 = Math.ceil(x + r);
  const y1 = Math.ceil(y + r);
  if (!d) g.dirty = [x0, y0, x1, y1];
  else {
    d[0] = Math.min(d[0], x0);
    d[1] = Math.min(d[1], y0);
    d[2] = Math.max(d[2], x1);
    d[3] = Math.max(d[3], y1);
  }
}

/**
 * The on-ramps beside raised road, and the shoulder between each and the road, laid in the
 * road's own surface: every px of them is taken from the road beside it (so tarmac, dirt, wear
 * and the line along the edge are the venue's own), with arrows up the lane the way it runs.
 */
function paintLanes(px: Uint8ClampedArray, w: World): void {
  const T = w.track;
  const raised = w.venue.track?.raised;
  if (!T || !raised?.length) return;
  const L = lanesOf(T, liftsOf(T, raised), w.road, w.tuning);
  const half = w.road / 2;
  const from = px.slice();
  const W = w.w;
  const H = w.h;
  for (const side of [-1, 1])
    for (let i = 0; i < T.n; i++) {
      const wide = laneWide(L, i, side);
      if (wide <= 0) continue;
      // (a lane begins as a point against the platform and widens over its first few px)
      let q = 0;
      while (q < 12 && laneWide(L, (i - q - 1 + T.n) % T.n, side) > 0) q++;
      const out = half + SHOULDER + wide * Math.min(1, (q + 1) / 8) + 3;
      const a = T.a[i]!;
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      const mid = half + SHOULDER + wide / 2;
      for (let u = -T.step * 0.75; u <= T.step * 0.75; u += 0.4)
        for (let d = half - 1; d <= out; d += 0.4) {
          const x = Math.floor(T.x[i]! + cs * u - sn * side * d);
          const y = Math.floor(T.y[i]! + sn * u + cs * side * d);
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          // the road's own surface, from its middle out to the line along its edge
          const k = (d - (half - 1)) / (out - (half - 1));
          const sd = half * 0.12 + k * (half * 0.88 - 2.2);
          const sx = Math.floor(T.x[i]! + cs * u - sn * side * sd);
          const sy = Math.floor(T.y[i]! + sn * u + cs * side * sd);
          if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
          const o = (y * W + x) * 4;
          const s = (sy * W + sx) * 4;
          // arrows up the middle of the lane while it climbs: pale chevrons, pointing on
          const off = Math.abs(d - mid);
          const al = i * T.step + u;
          const arrow =
            L.rise[i]! < 1 && off < 9 && (((al + off) % 30) + 30) % 30 < 2.6 && wide >= 30;
          for (let c = 0; c < 3; c++) px[o + c] = arrow ? 232 - c * 6 : from[s + c]!;
        }
    }
}

/**
 * The ground as one canvas at art resolution: grass, the road with kerbs and the start line, or the
 * derby bowl. Skid marks, scorches and splats are painted onto it as the race goes.
 */
export function makeGround(w: World): Ground {
  const V = w.venue;
  const C = V.colors;
  const cv = document.createElement('canvas');
  cv.width = w.w;
  cv.height = w.h;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  const r = mulberry(V.seed + 7);
  const T = w.track;
  const D = w.deckH;
  // where the road is up on a flyover there is no road on the ground under it
  const up = (i: number) => D !== null && !!T && D[i % T.n]! > 3;
  // the country, the road and the bowl, a pixel at a time
  const F = makeFields(w.w, w.h, V.seed);
  const bare = groundMode.shader && (!T || T.n <= MOST_SAMPLES);
  const paint = bare ? bakePaint(w, F) : null;
  if (!bare) {
    const img = g.createImageData(w.w, w.h);
    paintTerrain(img.data, w.w, w.h, C, F);
    if (T) {
      paintWilds(img.data, w.w, w.h, T, w.road / 2 + 120, w.road / 2 + 380, C, V.seed);
      if (D) paintGully(img.data, w.w, w.h, T, w.road, C, V.seed, up);
      paintRoad(img.data, w.w, w.h, { T, road: w.road, colors: C, F, use: (i) => !up(i) });
      paintLanes(img.data, w);
    }
    if (w.oval) paintBowl(img.data, w.w, w.h, w.oval, C, F);
    g.putImageData(img, 0, 0);
  }
  if (T) {
    const road = w.road;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    dressRoad(g, w, r, up);
    // stretches with a surface of their own: the road in that material's colour, roughened
    const S = w.roadSurface;
    if (S)
      for (let i = 0; i < T.n; i++) {
        const m = S[i];
        if (!m || up(i)) continue;
        const rgb = parseInt(m.colour.slice(1), 16);
        const a = T.a[i]!;
        // a stretch comes in and goes out over a car's length or so: thin at its ends, where the
        // road under it still shows, and solid from there on
        const fade = Math.max(2, Math.round(70 / T.step));
        let near = fade;
        for (let d = 1; d < fade; d++)
          if (S[(i + d) % T.n] !== m || S[(i - d + T.n) % T.n] !== m) {
            near = d;
            break;
          }
        const full = (near / fade) ** 1.5;
        for (let k = 0; k < road * 1.6 * full; k++) {
          const o = (r() - 0.5) * (road - 2);
          const f = (r() - 0.5) * T.step * 1.6;
          const sh = 0.86 + r() * 0.28;
          g.globalAlpha = Math.max(0.75, m.alpha);
          g.fillStyle = `rgb(${Math.min(255, ((rgb >> 16) & 255) * sh) | 0},${Math.min(255, ((rgb >> 8) & 255) * sh) | 0},${Math.min(255, (rgb & 255) * sh) | 0})`;
          const s = 1.5 + r() * 2.5;
          g.fillRect(
            T.x[i]! - Math.sin(a) * o + Math.cos(a) * f - s / 2,
            T.y[i]! + Math.cos(a) * o + Math.sin(a) * f - s / 2,
            s,
            s,
          );
        }
        g.globalAlpha = 1;
      }
    // the start line: a chequer across the road at sample 0, and the grid boxes behind it
    const a = T.a[0]!;
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const fx = Math.cos(a);
    const fy = Math.sin(a);
    // (three rows of chequer between two white bars)
    for (const bar of [-9, 7]) {
      g.save();
      g.translate(T.x[0]! + fx * bar, T.y[0]! + fy * bar);
      g.rotate(a);
      g.fillStyle = 'rgba(240,238,226,0.9)';
      g.fillRect(-1, -road / 2 + 2, 2, road - 4);
      g.restore();
    }
    for (let k = -road / 2; k < road / 2; k += 4)
      for (let row = 0; row < 3; row++) {
        g.fillStyle = (k / 4 + row) & 1 ? '#111' : '#f2f2f2';
        g.save();
        g.translate(
          T.x[0]! + nx * (k + 2) + fx * (row * 4 - 5),
          T.y[0]! + ny * (k + 2) + fy * (row * 4 - 5),
        );
        g.rotate(a);
        g.fillRect(-2, -2, 4.4, 4.4);
        g.restore();
      }
    const paint = C.road !== 'dirt';
    for (let slot = 0; slot < w.cars.length; slot++) {
      const i = w.gridSlot(slot);
      const side = slot % 2 ? 1 : -1;
      const sn = -Math.sin(T.a[i]!);
      const cs = Math.cos(T.a[i]!);
      g.save();
      g.translate(T.x[i]! + sn * side * road * 0.22, T.y[i]! + cs * side * road * 0.22);
      g.rotate(T.a[i]!);
      // the rubber every start has left: two black streaks out of the front of the box
      for (const o of [-4.5, 4.5])
        for (let q = 0; q < 46; q++) {
          g.fillStyle = `rgba(10,10,12,${0.5 * (1 - q / 46) * (0.6 + r() * 0.4)})`;
          g.fillRect(8 + q, o - 1 + Math.sin(q * 0.2 + slot) * 0.8, 1, 2);
        }
      // the box: an open bracket at the front, and the slot's number behind it
      g.fillStyle = paint ? 'rgba(240,240,232,0.75)' : 'rgba(240,240,232,0.4)';
      g.fillRect(12, -7, 1.4, 14);
      g.fillRect(4, -7, 9, 1.2);
      g.fillRect(4, 5.8, 9, 1.2);
      if (paint) {
        const num = String(slot + 1);
        for (let c = 0; c < num.length; c++) {
          const glyph = DIGITS[num.charCodeAt(c) - 48]!;
          for (let gy = 0; gy < 5; gy++)
            for (let gx = 0; gx < 3; gx++)
              if (glyph[gy]![gx] === '#')
                // (read from behind the car: the top of the digit points up the road)
                g.fillRect(-4 - gy * 2 + 8 - 10, -3 * num.length + c * 7 + gx * 2 + 0.5, 2, 2);
        }
      }
      g.restore();
    }
  }
  const O = w.oval;
  if (O) {
    g.beginPath();
    g.ellipse(O.cx, O.cy, 70, 54, 0, 0, TAU);
    g.strokeStyle = 'rgba(240,230,200,0.35)';
    g.lineWidth = 3;
    g.stroke();
  }
  dressVerge(g, w, r, F);
  if (paint) {
    const P = paint;
    return { cv, g, dirty: null, paint, tone: (x, y) => toneAt(w, P, F, x, y) };
  }
  // a little grain per art pixel; the fine grain (blades, gravel, pebbles) is the shader's
  const id = g.getImageData(0, 0, w.w, w.h);
  const px = id.data;
  for (let i = 0; i < px.length; i += 4) {
    const n = (r() - 0.5) * 9;
    px[i] = px[i]! + n;
    px[i + 1] = px[i + 1]! + n;
    px[i + 2] = px[i + 2]! + n;
  }
  g.putImageData(id, 0, 0);
  const tone = (x: number, y: number): Rgb => {
    const x0 = Math.max(0, Math.min(cv.width - 4, Math.round(x) - 2));
    const y0 = Math.max(0, Math.min(cv.height - 4, Math.round(y) - 2));
    const d = g.getImageData(x0, y0, 4, 4).data;
    const out: Rgb = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) out[c]! += d[i + c]! / 16;
    return out;
  };
  return { cv, g, dirty: null, paint: null, tone };
}

/**
 * The road's own detail, painted once over the laid road. On tarmac: the rubber of the racing
 * line, skid marks into the bends, mended patches, cracks, oil spots, drain covers, and white
 * arrows before each sharp bend pointing the way it turns. On a dirt road: long ruts, stones and
 * damp hollows.
 */
function dressRoad(
  g: CanvasRenderingContext2D,
  w: World,
  r: () => number,
  up: (i: number) => boolean,
): void {
  const T = w.track!;
  const road = w.road;
  const half = road / 2;
  const dirtRoad = w.venue.colors.road === 'dirt';
  const at = (i: number, across: number, along = 0): [number, number] => {
    const k = ((i % T.n) + T.n) % T.n;
    const a = T.a[k]!;
    return [
      T.x[k]! - Math.sin(a) * across + Math.cos(a) * along,
      T.y[k]! + Math.cos(a) * across + Math.sin(a) * along,
    ];
  };
  const hashy = (i: number, n: number): number => {
    const v = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const turn = (i: number): number => {
    let d = T.a[(i + 7) % T.n]! - T.a[(i - 7 + T.n) % T.n]!;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
  };
  // Grit, on any road. Long tyre marks: pairs of dark lines that run on down the road, drifting
  // from side to side, broken where the tyres let go.
  for (let n = 0; n < T.n / 34; n++) {
    let i = Math.floor(r() * T.n);
    let ac = (r() - 0.5) * (road - 26);
    const gap = 8 + r() * 3;
    const len = Math.round((80 + r() * 220) / T.step);
    const dark = 0.16 + r() * 0.26;
    let drift = (r() - 0.5) * 0.3;
    for (let q = 0; q < len; q++, i++) {
      if (up(i)) break;
      if (r() < 0.04) drift = (r() - 0.5) * 0.4;
      ac = Math.max(-half + 9, Math.min(half - 9, ac + drift));
      if (hashy(i, n) < 0.12) continue;
      g.fillStyle = `rgba(10,10,12,${dark * Math.min(1, q / 6, (len - q) / 6)})`;
      for (const o of [-gap / 2, gap / 2])
        for (const f of [0, T.step / 2]) {
          const [x, y] = at(i, ac + o, f);
          g.fillRect(Math.round(x), Math.round(y), 2, 2);
        }
    }
  }
  // oil: a dark pool with a glint on the side towards the light, and the drips that led to it
  for (let n = 0; n < T.n / 60; n++) {
    const i = Math.floor(r() * T.n);
    if (up(i)) continue;
    const ac = (r() - 0.5) * (road - 20);
    const [x, y] = at(i, ac);
    g.fillStyle = 'rgba(8,8,12,0.42)';
    const s = 3 + r() * 5;
    for (let q = 0; q < 6; q++) {
      g.beginPath();
      g.ellipse(
        x + (r() - 0.5) * s * 1.6,
        y + (r() - 0.5) * s,
        s * (0.4 + r() * 0.6),
        s * (0.3 + r() * 0.4),
        r() * TAU,
        0,
        TAU,
      );
      g.fill();
    }
    g.fillStyle = 'rgba(150,160,184,0.4)';
    for (let q = 0; q < 4; q++)
      g.fillRect(Math.round(x - s * 0.6 + q * 1.5), Math.round(y - s * 0.5 - (q & 1)), 1, 1);
    g.fillStyle = 'rgba(8,8,12,0.5)';
    for (let q = 2; q < 6 + r() * 16; q++) {
      const [dx, dy] = at(i - q * 2, ac + Math.sin(q) * 1.5);
      if (r() < 0.7) g.fillRect(Math.round(dx), Math.round(dy), r() < 0.3 ? 2 : 1, 1);
    }
  }
  // scorch marks: where something burned, a black heart and soot thinning outwards
  for (let n = 0; n < T.n / 130; n++) {
    const i = Math.floor(r() * T.n);
    if (up(i)) continue;
    const [x, y] = at(i, (r() - 0.5) * (road - 24));
    const s = 7 + r() * 8;
    for (let q = 0; q < s * s * 2.2; q++) {
      const a = r() * TAU;
      const d = r() ** 1.6 * s;
      g.fillStyle = `rgba(8,6,5,${0.55 * (1 - d / s) + 0.1})`;
      g.fillRect(Math.round(x + Math.cos(a) * d * 1.2), Math.round(y + Math.sin(a) * d), 1, 1);
    }
  }
  if (dirtRoad) {
    // ruts: long dark lines that wander along the road
    for (let n = 0; n < T.n / 30; n++) {
      let i = Math.floor(r() * T.n);
      let ac = (r() - 0.5) * (road - 12);
      g.fillStyle = `rgba(20,14,8,${0.22 + r() * 0.2})`;
      for (let k = 0; k < 20 + r() * 60; k++, i++) {
        if (up(i)) break;
        ac = Math.max(-half + 4, Math.min(half - 4, ac + (r() - 0.5) * 1.2));
        const [x, y] = at(i, ac);
        g.fillRect(Math.round(x), Math.round(y), 1, 1);
        const [x2, y2] = at(i, ac, T.step / 2);
        g.fillRect(Math.round(x2), Math.round(y2), 1, 1);
      }
    }
    // stones, lit on top, and damp hollows
    for (let n = 0; n < T.n / 4; n++) {
      const i = Math.floor(r() * T.n);
      if (up(i)) continue;
      const [x, y] = at(i, (r() - 0.5) * (road - 6));
      if (r() < 0.12) {
        g.fillStyle = 'rgba(18,12,8,0.26)';
        g.beginPath();
        g.ellipse(x, y, 3 + r() * 6, 2 + r() * 3, T.a[i]!, 0, TAU);
        g.fill();
      } else {
        g.fillStyle = 'rgba(214,200,176,0.6)';
        g.fillRect(Math.round(x), Math.round(y), 2, 1);
        g.fillStyle = 'rgba(20,14,8,0.5)';
        g.fillRect(Math.round(x), Math.round(y) + 1, 2, 1);
      }
    }
    return;
  }
  // the racing line: rubber laid down where the cars run, wandering from side to side
  for (let i = 0; i < T.n; i++) {
    if (up(i)) continue;
    const sway = Math.sin(i * 0.021) * half * 0.42;
    for (const off of [-5.5, 5.5]) {
      if (r() < 0.25) continue;
      const [x, y] = at(i, sway + off + (r() - 0.5) * 2);
      g.fillStyle = `rgba(20,20,24,${0.1 + r() * 0.12})`;
      g.fillRect(Math.round(x), Math.round(y), 3, 3);
    }
  }
  // skid marks: pairs of black lines where cars have braked into a bend and slid out wide
  for (let i = 0; i < T.n; i += 3) {
    const k = turn(i);
    if (Math.abs(k) < 0.3 || r() > 0.2) continue;
    const out = k > 0 ? -1 : 1;
    let ac = (r() - 0.5) * half;
    const len = Math.round((30 + r() * 70) / T.step);
    const gap = 9 + r() * 3;
    const start = i - Math.round(len * 0.6);
    for (let q = 0; q < len; q++) {
      const j = start + q;
      if (up(j)) break;
      ac += out * (0.25 + r() * 0.3);
      if (Math.abs(ac) + gap / 2 > half - 5) break;
      // dark in the middle of the slide, faint at both ends
      g.fillStyle = `rgba(12,12,14,${0.38 * Math.sin((q / len) * Math.PI)})`;
      for (const o of [-gap / 2, gap / 2])
        for (const f of [0, T.step / 2]) {
          const [x, y] = at(j, ac + o, f);
          g.fillRect(Math.round(x), Math.round(y), 2, 2);
        }
    }
  }
  // mended patches: squares of newer, darker or paler tarmac, with a tar seam round some
  for (let n = 0; n < T.n / 18; n++) {
    const i = Math.floor(r() * T.n);
    if (up(i)) continue;
    const [x, y] = at(i, (r() - 0.5) * (road - 22));
    g.save();
    g.translate(Math.round(x), Math.round(y));
    g.rotate(T.a[i]! + (r() - 0.5) * 0.2);
    const pw = 8 + r() * 14;
    const ph = 6 + r() * 9;
    g.fillStyle = r() < 0.5 ? 'rgba(30,30,34,0.35)' : 'rgba(120,120,126,0.22)';
    g.fillRect(-pw / 2, -ph / 2, pw, ph);
    if (r() < 0.6) {
      g.strokeStyle = 'rgba(14,14,16,0.5)';
      g.lineWidth = 1;
      g.strokeRect(-pw / 2, -ph / 2, pw, ph);
    }
    g.restore();
  }
  // cracks: thin dark lines that wander across the tarmac, some forking
  for (let n = 0; n < T.n / 9; n++) {
    const i = Math.floor(r() * T.n);
    if (up(i)) continue;
    let [x, y] = at(i, (r() - 0.5) * (road - 8));
    let a = r() * TAU;
    g.fillStyle = 'rgba(16,16,18,0.55)';
    const len = 6 + r() * 22;
    for (let k = 0; k < len; k++) {
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
      a += (r() - 0.5) * 1.1;
      x += Math.cos(a);
      y += Math.sin(a);
      if (r() < 0.06) {
        let fx = x;
        let fy = y;
        let fa = a + (r() < 0.5 ? 1 : -1);
        for (let q = 0; q < 3 + r() * 8; q++) {
          g.fillRect(Math.round(fx), Math.round(fy), 1, 1);
          fa += (r() - 0.5) * 0.9;
          fx += Math.cos(fa);
          fy += Math.sin(fa);
        }
      }
    }
  }
  // tar snakes: cracks sealed with a bead of black tar, wriggling along the road
  for (let n = 0; n < T.n / 32; n++) {
    let i = Math.floor(r() * T.n);
    let ac = (r() - 0.5) * (road - 14);
    g.fillStyle = 'rgba(10,10,12,0.72)';
    for (let q = 0; q < (30 + r() * 70) / T.step; q++, i++) {
      if (up(i)) break;
      ac = Math.max(-half + 6, Math.min(half - 6, ac + (r() - 0.5) * 2.6));
      for (const f of [0, 1, 2, 3]) {
        const [x, y] = at(i, ac + (r() - 0.5), (f * T.step) / 4);
        g.fillRect(Math.round(x), Math.round(y), 1, 2);
      }
    }
  }
  // oil spots and a scatter of grit
  for (let n = 0; n < T.n / 5; n++) {
    const i = Math.floor(r() * T.n);
    if (up(i)) continue;
    const [x, y] = at(i, (r() - 0.5) * (road - 6));
    if (r() < 0.2) {
      g.fillStyle = 'rgba(12,12,16,0.3)';
      g.beginPath();
      g.ellipse(x, y, 1.5 + r() * 2.5, 1 + r() * 2, r() * TAU, 0, TAU);
      g.fill();
    } else {
      g.fillStyle = r() < 0.5 ? 'rgba(150,150,156,0.45)' : 'rgba(26,26,30,0.5)';
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
  // drain covers by the edge: a dark grate in a pale frame
  for (let n = 0; n < T.n / 110; n++) {
    const i = Math.floor(r() * T.n);
    if (up(i) || Math.abs(turn(i)) > 0.2) continue;
    const [x, y] = at(i, (r() < 0.5 ? -1 : 1) * (half - 9));
    g.save();
    g.translate(Math.round(x), Math.round(y));
    g.rotate(T.a[i]!);
    g.fillStyle = 'rgba(150,150,154,0.7)';
    g.fillRect(-4, -3, 8, 6);
    g.fillStyle = 'rgba(16,16,20,0.85)';
    for (let q = -3; q < 3; q += 2) g.fillRect(q, -2, 1, 4);
    g.restore();
  }
  // arrows before the sharp bends: three white chevrons across the road, pointing into the turn
  let last = -999;
  for (let i = 30; i < T.n - 30; i++) {
    const k = turn(i);
    if (Math.abs(k) < 0.42 || i - last < 60) continue;
    // only the way into the bend, not the middle of it
    if (Math.abs(turn(i - 12)) > 0.3) continue;
    last = i;
    const j = i - 10;
    if (up(j) || up(j - 12)) continue;
    const side = k > 0 ? 1 : -1;
    g.fillStyle = 'rgba(240,236,220,0.8)';
    for (let c = 0; c < 3; c++)
      for (let q = -7; q <= 7; q++) {
        // each chevron leans along the road and points across it, towards the inside of the bend
        const [x, y] = at(j, ((c - 1) * 10 + 4 - Math.abs(q) * 0.55) * side, q);
        g.fillRect(Math.round(x), Math.round(y), 2, 2);
      }
  }
}

/**
 * The small things on the open ground and in the arena, painted once, a pixel at a time, each in
 * its own kind of country: tufts and drifts of flowers on grass; stones, ruts and cracks on dirt;
 * rocks and cracked crust on sand; tracks and capped rocks in snow; boulders in gravel; drains,
 * manholes and cracked slabs on paving. They gather where the country's noise says, not evenly.
 */
function dressVerge(g: CanvasRenderingContext2D, w: World, r: () => number, F: Fields): void {
  const C = w.venue.colors;
  const [R, G, B] = rgbOf(C.ground);
  const terrain = terrainOf(C);
  const pale = R + G + B > 520;
  const half = w.road / 2 + 6;
  const off = (x: number, y: number, clear = 0): boolean => {
    if (w.grid) return w.grid.at(x, y) > half + clear;
    const O = w.oval;
    return !O || Math.hypot((x - O.cx) / (O.rx - 6 - clear), (y - O.cy) / (O.ry - 6 - clear)) < 1;
  };
  const shade = (k: number, a: number) =>
    `rgba(${Math.min(255, Math.round(R * k))},${Math.min(255, Math.round(G * k))},${Math.min(255, Math.round(B * k))},${a})`;
  /** A rock: a lumpy blob lit from the top left, with a shadow under its far side. */
  const rock = (x: number, y: number, s: number, cap?: string): void => {
    const tone = 0.8 + r() * 0.3;
    const base =
      terrain === 'grass' || terrain === 'snow' ? [124, 126, 132] : [R * 0.78, G * 0.76, B * 0.74];
    const col = (k: number) =>
      `rgb(${Math.min(255, Math.round(base[0]! * tone * k))},${Math.min(255, Math.round(base[1]! * tone * k))},${Math.min(255, Math.round(base[2]! * tone * k))})`;
    g.fillStyle = 'rgba(0,0,0,0.32)';
    g.fillRect(x + 1, y + 1, s, s - 1);
    g.fillStyle = col(1);
    g.fillRect(x, y, s, s - 1);
    g.fillRect(x + 1, y - 1, s - 2, s + 1);
    g.fillStyle = col(0.7);
    g.fillRect(x + 1, y + s - 2, s - 1, 1);
    g.fillRect(x + s - 1, y + 1, 1, s - 2);
    g.fillStyle = cap ?? col(1.35);
    g.fillRect(x + 1, y - 1, Math.max(1, s - 3), 1);
    g.fillRect(x, y, Math.max(1, s - 3), 1);
  };
  /** A line that wanders: a crack, a rut, a ripple. */
  const wander = (
    x: number,
    y: number,
    len: number,
    bendy: number,
    style: string,
    flat = 1,
  ): void => {
    let a = r() * TAU;
    g.fillStyle = style;
    for (let q = 0; q < len; q++) {
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
      a += (r() - 0.5) * bendy;
      x += Math.cos(a);
      y += Math.sin(a) * flat;
    }
  };
  // the big things, a few to a screen
  const big = (w.w * w.h) / 5200;
  for (let i = 0; i < big; i++) {
    const x = Math.floor(r() * w.w);
    const y = Math.floor(r() * w.h);
    if (!off(x, y, 8)) continue;
    const k = r();
    const m = F.mid.at(x, y);
    switch (terrain) {
      case 'grass':
        if (k < 0.3) rock(x, y, 3 + Math.floor(r() * 3));
        else if (k < 0.5 && m > 0.5) {
          // a molehill, or a bald spot
          g.fillStyle = C.dirt;
          g.beginPath();
          g.ellipse(x, y, 2 + r() * 3, 1.5 + r() * 2, 0, 0, TAU);
          g.fill();
        }
        break;
      case 'dirt':
        if (k < 0.3) rock(x, y, 3 + Math.floor(r() * 4));
        else if (k < 0.75) {
          // an old pair of wheel ruts across the dirt
          const a = r() * TAU;
          const len = 30 + r() * 90;
          const curl = (r() - 0.5) * 0.03;
          for (const o of [-4, 4]) {
            let px = x - Math.sin(a) * o;
            let py = y + Math.cos(a) * o;
            let aa = a;
            g.fillStyle = shade(0.6, 0.45);
            for (let q = 0; q < len; q++) {
              if (!off(px, py)) break;
              if (r() > 0.15) g.fillRect(Math.round(px), Math.round(py), 2, 1);
              aa += curl;
              px += Math.cos(aa);
              py += Math.sin(aa);
            }
          }
        } else wander(x, y, 10 + r() * 30, 0.9, shade(0.55, 0.6));
        break;
      case 'sand':
        if (k < 0.35) rock(x, y, 3 + Math.floor(r() * 5));
        else if (F.bare.at(x, y) > 0.7) {
          // baked crust cracks into plates
          for (let q = 0; q < 4; q++)
            wander(x + (r() - 0.5) * 16, y + (r() - 0.5) * 12, 8 + r() * 16, 0.7, shade(0.5, 0.6));
        } else wander(x, y, 14 + r() * 30, 0.35, shade(0.82, 0.6), 0.3);
        break;
      case 'snow':
        if (k < 0.3) rock(x, y, 3 + Math.floor(r() * 4), '#f4f7fb');
        else if (k < 0.6) {
          // old tracks through the snow, blue in their shadow
          const a = r() * TAU;
          const len = 30 + r() * 80;
          for (const o of [-4, 4])
            for (let q = 0; q < len; q++) {
              const px = x - Math.sin(a) * o + Math.cos(a) * q;
              const py = y + Math.cos(a) * o + Math.sin(a) * q;
              if (!off(px, py)) break;
              g.fillStyle = 'rgba(120,150,190,0.4)';
              g.fillRect(Math.round(px), Math.round(py), 2, 1);
            }
        } else wander(x, y, 12 + r() * 24, 0.4, 'rgba(255,255,255,0.7)', 0.3);
        break;
      case 'gravel':
        if (k < 0.7) rock(x, y, 3 + Math.floor(r() * 5));
        else wander(x, y, 10 + r() * 20, 0.8, shade(0.6, 0.5));
        break;
      case 'paved':
        if (k < 0.16) {
          // a manhole: a dark iron lid in a pale ring
          g.fillStyle = shade(1.35, 0.9);
          g.beginPath();
          g.arc(x, y, 5, 0, TAU);
          g.fill();
          g.fillStyle = 'rgba(34,34,38,0.95)';
          g.beginPath();
          g.arc(x, y, 4, 0, TAU);
          g.fill();
          g.fillStyle = 'rgba(90,90,96,0.9)';
          g.fillRect(x - 2, y - 1, 4, 1);
          g.fillRect(x - 2, y + 1, 4, 1);
        } else if (k < 0.3) {
          // a drain grate
          g.fillStyle = shade(1.3, 0.9);
          g.fillRect(x - 4, y - 3, 9, 7);
          g.fillStyle = 'rgba(16,16,20,0.9)';
          for (let q = -3; q <= 3; q += 2) g.fillRect(x + q, y - 2, 1, 5);
        } else if (k < 0.75) {
          wander(x, y, 12 + r() * 36, 0.8, shade(0.45, 0.7));
        } else {
          // an oil stain
          g.fillStyle = 'rgba(14,14,18,0.22)';
          g.beginPath();
          g.ellipse(x, y, 3 + r() * 7, 2 + r() * 4, r() * TAU, 0, TAU);
          g.fill();
        }
        break;
    }
  }
  // the small things, everywhere
  const n = (w.w * w.h) / 34;
  const FLOWERS = ['#f4f0e4', '#f2c81e', '#e8597a', '#b684f4', '#f4f0e4', '#f2c81e'];
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * w.w);
    const y = Math.floor(r() * w.h);
    if (!off(x, y)) continue;
    const k = r();
    if (terrain === 'grass') {
      if (k < 0.5) {
        // a tuft: two or three blades, darker at the foot, lighter at the tip
        g.fillStyle = shade(0.72, 0.8);
        g.fillRect(x, y, 1, 2);
        g.fillStyle = shade(1.28, 0.8);
        g.fillRect(x + (r() < 0.5 ? 1 : -1), y - 1, 1, 1);
      } else if (k < 0.66) {
        // flowers grow in drifts: a patch of one colour here, none over there
        const m = F.mid.at(x, y);
        if (m < 0.58 || F.bare.at(x, y) > 0.72) continue;
        const kind = Math.floor(F.big.at(x, y) * 2.99 + Math.floor(m * 40)) % FLOWERS.length;
        g.fillStyle = FLOWERS[r() < 0.8 ? kind : Math.floor(r() * FLOWERS.length)]!;
        for (let q = 0; q < 2 + r() * 5; q++)
          g.fillRect(x + Math.round((r() - 0.5) * 11), y + Math.round((r() - 0.5) * 8), 1, 1);
      } else if (k < 0.69) {
        g.fillStyle = r() < 0.5 ? '#8d8f94' : '#6a6c72';
        g.fillRect(x, y, 2, 1);
        g.fillStyle = '#b4b6ba';
        g.fillRect(x, y - 1, 1, 1);
      } else {
        g.fillStyle = shade(r() < 0.5 ? 0.82 : 1.16, 0.6);
        g.fillRect(x, y, 1, 1);
      }
    } else if (terrain === 'paved') {
      // litter and grit, sparse: the slabs carry the detail
      if (k > 0.25) continue;
      g.fillStyle = shade(r() < 0.6 ? 0.6 : 1.4, 0.6);
      g.fillRect(x, y, 1, 1);
    } else if (k < (terrain === 'snow' ? 0.03 : 0.12)) {
      // a pebble with its lit side and its shadow
      g.fillStyle = shade(pale ? 0.62 : 1.3, 0.85);
      g.fillRect(x, y, 2, 1);
      g.fillStyle = shade(pale ? 0.45 : 0.6, 0.7);
      g.fillRect(x, y + 1, 2, 1);
    } else if (k < 0.16) {
      // a crack, or a ripple in a drift
      wander(x, y, 4 + r() * 10, 0.9, shade(pale ? 0.8 : 0.6, 0.6), 0.6);
    } else {
      g.fillStyle = shade(r() < 0.5 ? 0.84 : 1.14, 0.55);
      g.fillRect(x, y, 1, 1);
    }
  }
}

/** Where the light on a hollow comes from: the north-west, as the sun stands by day. */
const LIGHT = [-0.6, -0.8] as const;

/**
 * Paint a hollow in the road (a dip: a prop whose `mound` goes down) onto the ground as light and
 * shade over whatever is there: the slope turned from the light darkens, the one turned to it
 * brightens, and the floor is a little dimmer than the road round it. So it reads as a hollow in
 * dirt, tarmac or snow alike.
 */
export function paintHollow(G: Ground, s: StaticProp): void {
  const M = s.def.mound!;
  const reach = Math.ceil((M.long + M.wide) / 2);
  const g = G.g;
  g.save();
  for (let y = Math.floor(s.y - reach); y <= s.y + reach; y++)
    for (let x = Math.floor(s.x - reach); x <= s.x + reach; x++) {
      const h = moundHeight(s, x + 0.5, y + 0.5);
      if (h === 0) continue;
      const dx = (moundHeight(s, x + 1.5, y + 0.5) - moundHeight(s, x - 0.5, y + 0.5)) / 2;
      const dy = (moundHeight(s, x + 0.5, y + 1.5) - moundHeight(s, x + 0.5, y - 0.5)) / 2;
      // lit as the slope faces the light, in a few hard steps like everything else here
      const lit = -(dx * LIGHT[0] + dy * LIGHT[1]) * 2.6 - (h / M.high) * 0.16;
      const a = Math.min(0.62, Math.round(Math.abs(lit) * 6) / 6);
      if (a <= 0) continue;
      g.globalAlpha = lit > 0 ? a * 0.6 : a;
      g.fillStyle = lit > 0 ? '#fff2d0' : '#0c0a10';
      g.fillRect(x, y, 1, 1);
    }
  g.restore();
  markGround(G, s.x, s.y, reach + 1);
}
