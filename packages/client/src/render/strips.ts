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

/** Texels per art pixel that every part is built at: the grain of the whole game. */
export const DETAIL = 3;
/** The widest a strip's image may be; longer strips wrap onto more rows. */
const MAX_W = 2040;

/**
 * How lit a voxel is, 0 (deep shade) to 1 (full light), in a few hard steps. The light comes from
 * straight above, so the shading holds whichever way the thing is turned: `nz` is how far the
 * surface faces up (1 a flat top, 0 a wall), `open` the share of the cells just above and around
 * it that are empty (how much sky it sees), `up` how high it is in the part (0 to 1). A curved
 * roof steps down through the bands as it falls away, and the foot of a wall is darkest.
 */
export function lightOf(nz: number, open: number, up: number): number {
  const face = Math.max(0, nz);
  const k = (0.16 + 0.84 * face * face) * (0.5 + 0.5 * open) + 0.16 * up * (1 - face);
  return Math.round(Math.min(1, Math.max(0, k)) * 7) / 7;
}

function mix3(t: readonly number[][], k: number, out: number[]): void {
  const a = k < 0.5 ? t[0]! : t[1]!;
  const b = k < 0.5 ? t[1]! : t[2]!;
  const f = k < 0.5 ? k * 2 : (k - 0.5) * 2;
  for (let i = 0; i < 3; i++) out[i] = a[i]! + (b[i]! - a[i]!) * f;
}

/**
 * Sample a part into voxels and shade them. A smooth part is sampled at every texel's centre in
 * all three directions; any other part was written for whole layers, so it gets its layer number
 * and only its outline is finer.
 */
export function build(part: Part, mats: Record<string, Tones>, res = DETAIL): Strip {
  const cw = part.w * res;
  const ch = part.h * res;
  const n = part.layers * res;
  const names: string[] = [''];
  const index = new Map<string, number>();
  const grid = new Uint8Array(cw * ch * n);
  for (let z = 0; z < n; z++) {
    const pz = part.smooth ? (z + 0.5) / res : Math.floor(z / res);
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        const m = part.fn((x + 0.5) / res - part.w / 2, (y + 0.5) / res - part.h / 2, pz);
        if (!m) continue;
        let k = index.get(m);
        if (k === undefined) {
          if (!mats[m]) throw new Error(`no material ${m}`);
          index.set(m, (k = names.length));
          names.push(m);
        }
        grid[(z * ch + y) * cw + x] = k;
      }
  }
  const solid = (x: number, y: number, z: number): boolean =>
    x >= 0 && y >= 0 && z >= 0 && x < cw && y < ch && z < n && grid[(z * ch + y) * cw + x] !== 0;
  const cols = Math.max(1, Math.min(n, Math.floor(MAX_W / cw)));
  const W = cw * cols;
  const H = ch * Math.ceil(n / cols);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const id = g.createImageData(W, H);
  const px = id.data;
  const rgb = names.map((m) => (m ? mats[m]!.map(hexRgb) : []));
  const c = [0, 0, 0];
  for (let z = 0; z < n; z++)
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        const m = grid[(z * ch + y) * cw + x]!;
        if (!m) continue;
        let k = 0;
        // only the surface is ever seen (until something is knocked off, and then it is scuffed)
        const buried =
          solid(x, y, z + 1) &&
          solid(x + 1, y, z) &&
          solid(x - 1, y, z) &&
          solid(x, y + 1, z) &&
          solid(x, y - 1, z);
        if (!buried) {
          // which way the surface faces: away from the solid around this voxel
          let nx = 0;
          let ny = 0;
          let nz = 0;
          let open = 0;
          for (let dz = -2; dz <= 2; dz++)
            for (let dy = -2; dy <= 2; dy++)
              for (let dx = -2; dx <= 2; dx++) {
                if (solid(x + dx, y + dy, z + dz)) continue;
                nx += dx;
                ny += dy;
                nz += dz;
                if (dz > 0 && dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1) open++;
              }
          k = lightOf(nz / (Math.hypot(nx, ny, nz) || 1), open / 18, z / n);
        }
        mix3(rgb[m]!, k, c);
        const j = ((Math.floor(z / cols) * ch + y) * W + (z % cols) * cw + x) * 4;
        px[j] = c[0]!;
        px[j + 1] = c[1]!;
        px[j + 2] = c[2]!;
        px[j + 3] = 255;
      }
  g.putImageData(id, 0, 0);
  return { img: cv, cw, ch, n, res, cols };
}

export function clone(s: Strip): Strip {
  const cv = document.createElement('canvas');
  cv.width = s.img.width;
  cv.height = s.img.height;
  cv.getContext('2d')!.drawImage(s.img, 0, 0);
  return { ...s, img: cv };
}

/**
 * A block broken off a strip: its middle in the part (art px: x forward and y across from the
 * centre, z up from the bottom), how big it is (art px a side) and its colour.
 */
export interface Chip {
  x: number;
  y: number;
  z: number;
  s: number;
  rgb: number;
}

/** A strip's pixels: RGBA rows `W` wide; see `Strip` for the layout. */
export interface Voxels {
  px: Uint8ClampedArray;
  W: number;
  cw: number;
  ch: number;
  n: number;
  res: number;
  cols: number;
}

/** Where voxel (x, y, z) is in the pixels. */
export const at = (v: Voxels, x: number, y: number, z: number): number =>
  ((Math.floor(z / v.cols) * v.ch + y) * v.W + (z % v.cols) * v.cw + x) * 4;

/**
 * Gathers the voxels a blow removes into blocks: the strip is cut into cubes `size` texels a
 * side, and every cube that loses voxels gives one block, as big as what it lost. One big square
 * where that will do, small ones where the break is ragged.
 */
class Blocks {
  private readonly cells = new Map<number, [number, number, number, number, number]>();
  constructor(
    private readonly v: Voxels,
    private readonly size: number,
  ) {}

  add(x: number, y: number, z: number, j: number): void {
    const B = this.size;
    const key = (Math.floor(z / B) * 4096 + Math.floor(y / B)) * 4096 + Math.floor(x / B);
    const c = this.cells.get(key);
    if (c) {
      c[0] += x;
      c[1] += y;
      c[2] += z;
      c[3]++;
    } else {
      const px = this.v.px;
      this.cells.set(key, [x, y, z, 1, (px[j]! << 16) | (px[j + 1]! << 8) | px[j + 2]!]);
    }
  }

  chips(): Chip[] {
    const v = this.v;
    const out: Chip[] = [];
    for (const [sx, sy, sz, k, rgb] of this.cells.values())
      out.push({
        x: (sx / k + 0.5 - v.cw / 2) / v.res,
        y: (sy / k + 0.5 - v.ch / 2) / v.res,
        z: sz / k / v.res,
        s: Math.cbrt(k) / v.res,
        rgb,
      });
    return out;
  }
}

/**
 * Punch a crater at (lx, ly) (art px from the middle, x forward), `r` art px across: deepest in
 * the middle, shallower towards the rim, with the paint around it chipped and scuffed darker. The
 * bottom `keep` art px of the part always stay. Returns what was knocked off, as blocks of up to
 * `block` texels a side.
 */
export function dentVoxels(
  v: Voxels,
  lx: number,
  ly: number,
  r: number,
  power: number,
  rand: () => number,
  keep = 1,
  block = v.res,
): Chip[] {
  const px = v.px;
  const cx = v.cw / 2 + lx * v.res;
  const cy = v.ch / 2 + ly * v.res;
  const R = r * v.res;
  const floor = Math.round(keep * v.res);
  const crush = Math.min(v.n - floor, Math.round(power * v.n));
  const out = new Blocks(v, block);
  const x0 = Math.max(0, Math.floor(cx - R));
  const x1 = Math.min(v.cw - 1, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R));
  const y1 = Math.min(v.ch - 1, Math.ceil(cy + R));
  for (let z = 0; z < v.n; z++)
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const j = at(v, x, y, z);
        if (!px[j + 3]) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R;
        if (d > 1) continue;
        const fromTop = v.n - 1 - z;
        const q = d / 0.6;
        if (
          z >= floor &&
          ((q < 1 && fromTop < crush * (1 - q * q * 0.7)) || (d < 0.9 && rand() < 0.3 * power))
        ) {
          out.add(x, y, z, j);
          px[j + 3] = 0;
          continue;
        }
        const k = 0.62 + 0.3 * d;
        px[j] = px[j]! * k;
        px[j + 1] = px[j + 1]! * k;
        px[j + 2] = px[j + 2]! * k;
      }
  return out.chips();
}

/**
 * Blow a strip apart: it is cut into cubes `block` texels a side, and each cube above the bottom
 * `keep` art px goes with chance `share` (more likely the higher it sits). Returns what came off.
 */
export function shatterVoxels(
  v: Voxels,
  share: number,
  rand: () => number,
  keep = 1,
  block = v.res * 2,
): Chip[] {
  const px = v.px;
  const floor = Math.round(keep * v.res);
  const out = new Blocks(v, block);
  for (let bz = 0; bz * block < v.n; bz++)
    for (let by = 0; by * block < v.ch; by++)
      for (let bx = 0; bx * block < v.cw; bx++) {
        if (rand() >= share * (0.6 + (0.8 * bz * block) / v.n)) continue;
        for (let z = Math.max(floor, bz * block); z < Math.min(v.n, (bz + 1) * block); z++)
          for (let y = by * block; y < Math.min(v.ch, (by + 1) * block); y++)
            for (let x = bx * block; x < Math.min(v.cw, (bx + 1) * block); x++) {
              const j = at(v, x, y, z);
              if (!px[j + 3]) continue;
              out.add(x, y, z, j);
              px[j + 3] = 0;
            }
      }
  return out.chips();
}

/**
 * Whatever no longer hangs on to the bottom `keep` art px of the part (through voxels that touch
 * face to face) comes away: it is removed and returned as blocks, so it can fall off in one piece.
 */
export function detachVoxels(v: Voxels, keep = 1, block = v.res * 2): Chip[] {
  const { px, cw, ch, n } = v;
  const floor = Math.max(1, Math.round(keep * v.res));
  const held = new Uint8Array(cw * ch * n);
  const todo: number[] = [];
  const visit = (x: number, y: number, z: number): void => {
    if (x < 0 || y < 0 || z < 0 || x >= cw || y >= ch || z >= n) return;
    const i = (z * ch + y) * cw + x;
    if (held[i] || !px[at(v, x, y, z) + 3]) return;
    held[i] = 1;
    todo.push(i);
  };
  for (let z = 0; z < Math.min(floor, n); z++)
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) visit(x, y, z);
  while (todo.length) {
    const i = todo.pop()!;
    const x = i % cw;
    const y = Math.floor(i / cw) % ch;
    const z = Math.floor(i / (cw * ch));
    visit(x + 1, y, z);
    visit(x - 1, y, z);
    visit(x, y + 1, z);
    visit(x, y - 1, z);
    visit(x, y, z + 1);
    visit(x, y, z - 1);
  }
  const out = new Blocks(v, block);
  for (let z = floor; z < n; z++)
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        if (held[(z * ch + y) * cw + x]) continue;
        const j = at(v, x, y, z);
        if (!px[j + 3]) continue;
        out.add(x, y, z, j);
        px[j + 3] = 0;
      }
  return out.chips();
}

/** Everything there is, as blocks of up to `block` texels a side, without changing anything. */
export function allVoxels(v: Voxels, block = 1): Chip[] {
  const out = new Blocks(v, block);
  for (let z = 0; z < v.n; z++)
    for (let y = 0; y < v.ch; y++)
      for (let x = 0; x < v.cw; x++) {
        const j = at(v, x, y, z);
        if (v.px[j + 3]) out.add(x, y, z, j);
      }
  return out.chips();
}

const voxels = (s: Strip, px: Uint8ClampedArray): Voxels => ({
  px,
  W: s.img.width,
  cw: s.cw,
  ch: s.ch,
  n: s.n,
  res: s.res,
  cols: s.cols,
});

/** Run `fn` over a strip's pixels and write them back. */
function edit<T>(s: Strip, fn: (v: Voxels) => T): T {
  const g = s.img.getContext('2d')!;
  const id = g.getImageData(0, 0, s.img.width, s.img.height);
  const out = fn(voxels(s, id.data));
  g.putImageData(id, 0, 0);
  return out;
}

/** What a blow knocked off, and what that left hanging loose. */
export interface Broken {
  chips: Chip[];
  loose: Chip[];
}

/** Dent a strip; see `dentVoxels`. Anything the crater cuts free comes back as `loose`. */
export function dent(
  s: Strip,
  lx: number,
  ly: number,
  r: number,
  power: number,
  rand: () => number,
  keep = 1,
): Broken {
  return edit(s, (v) => ({
    chips: dentVoxels(v, lx, ly, r, power, rand, keep),
    loose: detachVoxels(v, keep),
  }));
}

export function shatter(s: Strip, share: number, rand: () => number, keep = 1): Broken {
  return edit(s, (v) => ({
    chips: shatterVoxels(v, share, rand, keep),
    loose: detachVoxels(v, keep),
  }));
}

/** A whole strip as blocks about two art px a side (for things that vanish as they burst). */
export function voxelsOf(s: Strip): Chip[] {
  const px = s.img.getContext('2d')!.getImageData(0, 0, s.img.width, s.img.height).data;
  return allVoxels(voxels(s, px), s.res * 2);
}

/** A burnt-out shell: everything charred dark. */
export function char(s: Strip): void {
  const g = s.img.getContext('2d')!;
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(20,14,10,0.78)';
  g.fillRect(0, 0, s.img.width, s.img.height);
  g.globalCompositeOperation = 'source-over';
}
