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
    const path = () => {
      g.beginPath();
      g.moveTo(T.x[0]!, T.y[0]!);
      for (let i = 1; i < T.n; i++) g.lineTo(T.x[i]!, T.y[i]!);
      g.closePath();
    };
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
  // grain over everything, so the pixels read as texture when scaled up
  const id = g.getImageData(0, 0, w.w, w.h);
  const px = id.data;
  for (let i = 0; i < px.length; i += 4) {
    const n = (r() - 0.5) * 16;
    px[i] = px[i]! + n;
    px[i + 1] = px[i + 1]! + n;
    px[i + 2] = px[i + 2]! + n;
  }
  g.putImageData(id, 0, 0);
  return { cv, g };
}
