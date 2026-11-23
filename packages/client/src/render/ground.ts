import type { World } from '@demodogs/sim';

const TAU = Math.PI * 2;

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
}

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
  g.fillStyle = C.ground;
  g.fillRect(0, 0, w.w, w.h);
  g.globalAlpha = 0.35;
  for (let i = 0; i < (w.w * w.h) / 260; i++) {
    g.fillStyle = r() < 0.5 ? C.ground2 : C.dirt;
    const s = 2 + r() * 5;
    g.fillRect(r() * w.w, r() * w.h, s, s * 0.7);
  }
  g.globalAlpha = 1;
  const T = w.track;
  if (T) {
    const road = w.road;
    const D = w.deckH;
    // where the road is up on a flyover there is no road on the ground under it
    const up = (i: number) => D !== null && D[i % T.n]! > 3;
    const path = () => {
      g.beginPath();
      if (!D) {
        g.moveTo(T.x[0]!, T.y[0]!);
        for (let i = 1; i < T.n; i++) g.lineTo(T.x[i]!, T.y[i]!);
        g.closePath();
        return;
      }
      let pen = false;
      for (let i = 0; i <= T.n; i++) {
        const k = i % T.n;
        if (up(k)) {
          pen = false;
          continue;
        }
        if (pen) g.lineTo(T.x[k]!, T.y[k]!);
        else g.moveTo(T.x[k]!, T.y[k]!);
        pen = true;
      }
    };
    if (D) {
      // under a flyover: a trampled gully of dirt and gravel in the deck's shade
      g.lineJoin = 'round';
      g.lineCap = 'round';
      for (const [col, wd] of [
        [C.dirt, road + 34],
        ['rgba(30,26,20,0.45)', road + 12],
      ] as const) {
        g.beginPath();
        let pen = false;
        for (let i = 0; i < T.n; i++) {
          if (!up(i)) {
            pen = false;
            continue;
          }
          if (pen) g.lineTo(T.x[i]!, T.y[i]!);
          else g.moveTo(T.x[i]!, T.y[i]!);
          pen = true;
        }
        g.strokeStyle = col;
        g.lineWidth = wd;
        g.stroke();
      }
      g.globalAlpha = 0.5;
      for (let i = 0; i < T.n; i++)
        if (up(i))
          for (let k = 0; k < 6; k++) {
            g.fillStyle = r() < 0.5 ? '#3d3427' : '#7b6a4c';
            const o = (r() - 0.5) * (road + 20);
            g.fillRect(
              T.x[i]! - Math.sin(T.a[i]!) * o + (r() - 0.5) * 4,
              T.y[i]! + Math.cos(T.a[i]!) * o + (r() - 0.5) * 4,
              1 + r() * 2,
              1 + r() * 2,
            );
          }
      g.globalAlpha = 1;
    }
    const stroke = (col: string, width: number, dash: number[] = []) => {
      path();
      g.strokeStyle = col;
      g.lineWidth = width;
      g.setLineDash(dash);
      g.stroke();
      g.setLineDash([]);
    };
    g.lineJoin = 'round';
    g.lineCap = 'round';
    stroke(C.dirt, road + 30);
    stroke('#efeae0', road + 9);
    stroke('#c8322e', road + 9, [9, 9]);
    stroke('#47474d', road);
    stroke('#4f4f56', road * 0.55);
    stroke('rgba(230,224,200,0.7)', 2, [12, 16]);
    dressRoad(g, w, r, up);
    // the start line: a chequer across the road at sample 0, and the grid boxes behind it
    const a = T.a[0]!;
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const fx = Math.cos(a);
    const fy = Math.sin(a);
    for (let k = -road / 2; k < road / 2; k += 4)
      for (let row = 0; row < 2; row++) {
        g.fillStyle = (k / 4 + row) & 1 ? '#111' : '#f2f2f2';
        g.save();
        g.translate(
          T.x[0]! + nx * (k + 2) + fx * (row * 4 - 4),
          T.y[0]! + ny * (k + 2) + fy * (row * 4 - 4),
        );
        g.rotate(a);
        g.fillRect(-2, -2, 4.4, 4.4);
        g.restore();
      }
    for (let slot = 0; slot < w.cars.length; slot++) {
      const i = w.gridSlot(slot);
      const side = slot % 2 ? 1 : -1;
      const sn = -Math.sin(T.a[i]!);
      const cs = Math.cos(T.a[i]!);
      g.save();
      g.translate(T.x[i]! + sn * side * road * 0.22, T.y[i]! + cs * side * road * 0.22);
      g.rotate(T.a[i]!);
      g.strokeStyle = 'rgba(240,240,240,0.55)';
      g.lineWidth = 1.2;
      g.strokeRect(-11, -7, 24, 14);
      g.restore();
    }
  }
  const O = w.oval;
  if (O) {
    g.fillStyle = C.outside;
    g.fillRect(0, 0, w.w, w.h);
    g.beginPath();
    g.ellipse(O.cx, O.cy, O.rx + 6, O.ry + 6, 0, 0, TAU);
    g.fillStyle = C.dirt;
    g.fill();
    g.beginPath();
    g.ellipse(O.cx, O.cy, O.rx - 2, O.ry - 2, 0, 0, TAU);
    g.fillStyle = C.ground;
    g.fill();
    g.globalAlpha = 0.4;
    for (let i = 0; i < 1600; i++) {
      const t = r() * TAU;
      const q = Math.sqrt(r()) * 0.97;
      g.fillStyle = r() < 0.5 ? C.ground2 : C.dirt;
      g.fillRect(
        O.cx + Math.cos(t) * O.rx * q,
        O.cy + Math.sin(t) * O.ry * q,
        3 + r() * 6,
        2 + r() * 3,
      );
    }
    g.globalAlpha = 1;
    g.beginPath();
    g.ellipse(O.cx, O.cy, 70, 54, 0, 0, TAU);
    g.strokeStyle = 'rgba(240,230,200,0.35)';
    g.lineWidth = 3;
    g.stroke();
  }
  dressVerge(g, w, r);
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
  return { cv, g, dirty: null };
}

const rgbOf = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/**
 * The road's own detail, painted once: a solid line down each edge, the dark band the tyres have
 * worn, patches where it has been mended, cracks, oil spots, and white arrows on the tarmac
 * before each sharp bend pointing the way it turns.
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
  const at = (i: number, across: number, along = 0): [number, number] => {
    const k = ((i % T.n) + T.n) % T.n;
    const a = T.a[k]!;
    return [
      T.x[k]! - Math.sin(a) * across + Math.cos(a) * along,
      T.y[k]! + Math.cos(a) * across + Math.sin(a) * along,
    ];
  };
  // edge lines, a pixel wide, just inside each kerb
  g.fillStyle = 'rgba(236,232,214,0.55)';
  for (let i = 0; i < T.n; i++) {
    if (up(i)) continue;
    for (const sd of [-1, 1]) {
      const [x, y] = at(i, sd * (half - 2.5));
      g.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
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
  // mended patches: squares of newer, darker or paler tarmac
  for (let n = 0; n < T.n / 22; n++) {
    const i = Math.floor(r() * T.n);
    if (up(i)) continue;
    const [x, y] = at(i, (r() - 0.5) * (road - 16));
    g.save();
    g.translate(x, y);
    g.rotate(T.a[i]! + (r() - 0.5) * 0.2);
    g.fillStyle = r() < 0.5 ? 'rgba(30,30,34,0.35)' : 'rgba(120,120,126,0.22)';
    g.fillRect(-4 - r() * 6, -3 - r() * 4, 8 + r() * 12, 6 + r() * 8);
    g.restore();
  }
  // cracks: thin dark lines that wander across the tarmac
  for (let n = 0; n < T.n / 9; n++) {
    const i = Math.floor(r() * T.n);
    if (up(i)) continue;
    let [x, y] = at(i, (r() - 0.5) * (road - 8));
    let a = r() * TAU;
    g.fillStyle = 'rgba(16,16,18,0.5)';
    for (let k = 0; k < 6 + r() * 14; k++) {
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
      a += (r() - 0.5) * 1.1;
      x += Math.cos(a);
      y += Math.sin(a);
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
  // arrows before the sharp bends: three white chevrons across the road, pointing into the turn
  const turn = (i: number): number => {
    let d = T.a[(i + 7) % T.n]! - T.a[(i - 7 + T.n) % T.n]!;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
  };
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
 * The ground beside the road and in the arena, painted once, a pixel at a time: on grass, darker
 * tufts and specks of flowers; on sand, snow and dirt, pebbles, cracks and drifts. What it is
 * comes from the venue's own ground colour.
 */
function dressVerge(g: CanvasRenderingContext2D, w: World, r: () => number): void {
  const C = w.venue.colors;
  const [R, G, B] = rgbOf(C.ground);
  const grassy = G > R * 1.12 && G > B * 1.12;
  const pale = R + G + B > 520;
  const half = w.road / 2 + 6;
  const off = (x: number, y: number): boolean => {
    if (w.grid) return w.grid.at(x, y) > half;
    const O = w.oval;
    return !O || Math.hypot((x - O.cx) / (O.rx - 6), (y - O.cy) / (O.ry - 6)) < 1;
  };
  const shade = (k: number, a: number) =>
    `rgba(${Math.round(R * k)},${Math.round(G * k)},${Math.round(B * k)},${a})`;
  const n = (w.w * w.h) / 34;
  const FLOWERS = ['#f4f0e4', '#f2c81e', '#e8597a', '#b684f4', '#f4f0e4', '#f2c81e'];
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * w.w);
    const y = Math.floor(r() * w.h);
    if (!off(x, y)) continue;
    const k = r();
    if (grassy) {
      if (k < 0.55) {
        // a tuft: two or three blades, darker at the foot, lighter at the tip
        g.fillStyle = shade(0.72, 0.8);
        g.fillRect(x, y, 1, 2);
        g.fillStyle = shade(1.28, 0.8);
        g.fillRect(x + (r() < 0.5 ? 1 : -1), y - 1, 1, 1);
      } else if (k < 0.66) {
        // flowers come in drifts: a few of one colour close together
        g.fillStyle = FLOWERS[Math.floor(r() * FLOWERS.length)]!;
        for (let q = 0; q < 1 + r() * 4; q++)
          g.fillRect(x + Math.round((r() - 0.5) * 9), y + Math.round((r() - 0.5) * 7), 1, 1);
      } else if (k < 0.72) {
        g.fillStyle = r() < 0.5 ? '#8d8f94' : '#6a6c72';
        g.fillRect(x, y, 2, 1);
        g.fillStyle = '#b4b6ba';
        g.fillRect(x, y - 1, 1, 1);
      } else {
        g.fillStyle = shade(r() < 0.5 ? 0.82 : 1.16, 0.6);
        g.fillRect(x, y, 1, 1);
      }
    } else if (k < 0.3) {
      // a pebble with its lit side and its shadow
      g.fillStyle = shade(pale ? 0.62 : 1.5, 0.85);
      g.fillRect(x, y, 2, 1);
      g.fillStyle = shade(pale ? 0.45 : 0.6, 0.7);
      g.fillRect(x, y + 1, 2, 1);
    } else if (k < 0.36) {
      // a crack, or a ripple in a drift
      let cx = x;
      let cy = y;
      let a = r() * TAU;
      g.fillStyle = shade(pale ? 0.8 : 0.6, 0.6);
      for (let q = 0; q < 4 + r() * 10; q++) {
        g.fillRect(Math.round(cx), Math.round(cy), 1, 1);
        a += (r() - 0.5) * 0.9;
        cx += Math.cos(a);
        cy += Math.sin(a) * 0.6;
      }
    } else {
      g.fillStyle = shade(r() < 0.5 ? 0.84 : 1.14, 0.55);
      g.fillRect(x, y, 1, 1);
    }
  }
}
