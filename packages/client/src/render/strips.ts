import type { Part, Tones } from '@demodogs/shared';
import type { Strip } from './stack';

/**
 * Parts to slice strips. Shading is baked in the way the reference kit's build-art.js does it: a
 * pixel with nothing above it gets its material's top tone, the rest a side tone (the darker one
 * low on the part). Strips are canvases, so a car can own a copy and be dented while it races.
 */

export function hexRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function css(c: number[]): string {
  return `#${c
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Three tones from one colour: [side in shade, side, top]. */
export function tones(h: string): Tones {
  const c = hexRgb(h);
  return [
    css(c.map((v) => v * 0.52)),
    css(c.map((v) => v * 0.78)),
    css(c.map((v) => v + (255 - v) * 0.14)),
  ];
}

/** Which tone a voxel gets: 2 (top) with nothing above, else 0 low on the part and 1 above that. */
export function toneOf(above: boolean, z: number, layers: number): 0 | 1 | 2 {
  return !above ? 2 : z < layers / 3 ? 0 : 1;
}

export function build(part: Part, mats: Record<string, Tones>): Strip {
  const at = (x: number, y: number, z: number) =>
    x < 0 || y < 0 || x >= part.w || y >= part.h || z < 0 || z >= part.layers
      ? null
      : part.fn(x + 0.5 - part.w / 2, y + 0.5 - part.h / 2, z);
  const W = part.w * part.layers;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = part.h;
  const g = cv.getContext('2d')!;
  const id = g.createImageData(W, part.h);
  const px = id.data;
  const cache = new Map<string, [number, number, number]>();
  for (let z = 0; z < part.layers; z++)
    for (let y = 0; y < part.h; y++)
      for (let x = 0; x < part.w; x++) {
        const m = at(x, y, z);
        if (!m) continue;
        const tm = mats[m];
        if (!tm) throw new Error(`no material ${m}`);
        const tone = toneOf(at(x, y, z + 1) !== null, z, part.layers);
        const key = m + tone;
        let c = cache.get(key);
        if (!c) cache.set(key, (c = hexRgb(tm[tone])));
        const j = (y * W + z * part.w + x) * 4;
        px[j] = c[0];
        px[j + 1] = c[1];
        px[j + 2] = c[2];
        px[j + 3] = 255;
      }
  g.putImageData(id, 0, 0);
  return { img: cv, cw: part.w, ch: part.h, n: part.layers };
}

export function clone(s: Strip): Strip {
  const cv = document.createElement('canvas');
  cv.width = s.img.width;
  cv.height = s.img.height;
  cv.getContext('2d')!.drawImage(s.img, 0, 0);
  return { img: cv, cw: s.cw, ch: s.ch, n: s.n };
}

/**
 * Punch a dent at (lx, ly) (art px from the cell's middle, x forward): near the centre the top
 * layers are crushed away, around it the paint is scuffed darker. The bottom `keep` layers stay.
 */
export function dent(
  s: Strip,
  lx: number,
  ly: number,
  r: number,
  power: number,
  rand: () => number,
  keep = 1,
): void {
  const g = s.img.getContext('2d')!;
  const W = s.img.width;
  const id = g.getImageData(0, 0, W, s.img.height);
  const px = id.data;
  const cx = s.cw / 2 + lx;
  const cy = s.ch / 2 + ly;
  const crush = Math.min(s.n - keep, Math.round(power * s.n));
  for (let z = 0; z < s.n; z++)
    for (let y = 0; y < s.ch; y++)
      for (let x = 0; x < s.cw; x++) {
        const j = (y * W + z * s.cw + x) * 4;
        if (!px[j + 3]) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
        if (d > 1) continue;
        const fromTop = s.n - 1 - z;
        if (z >= keep && ((d < 0.55 && fromTop < crush) || (d < 0.85 && rand() < 0.35 * power))) {
          px[j + 3] = 0;
          continue;
        }
        const k = 0.62 + 0.3 * d;
        px[j] = px[j]! * k;
        px[j + 1] = px[j + 1]! * k;
        px[j + 2] = px[j + 2]! * k;
      }
  g.putImageData(id, 0, 0);
}

/** A burnt-out shell: everything charred dark. */
export function char(s: Strip): void {
  const g = s.img.getContext('2d')!;
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(20,14,10,0.78)';
  g.fillRect(0, 0, s.img.width, s.img.height);
  g.globalCompositeOperation = 'source-over';
}
