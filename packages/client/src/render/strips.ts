import { finishOf, type Finish, type Part, type Tones } from '@demodogs/shared';
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

/** Texels per art pixel that scenery, bots and weapons are built at. */
export const DETAIL = 3;
/** Texels per art pixel for cars: twice as fine again, eight times the voxels. */
export const CAR_DETAIL = 6;

/**
 * Screen cells to the art pixel for what is drawn on the screen's own grid (the ground's grain,
 * fire, smoke, sparks). A cell is exactly two device pixels across (one CSS pixel on a phone), as
 * fine as mudders' cells at a whole-map view, whatever the zoom: so this need not be a whole
 * number (4.5 device px to the art pixel is 2.25 cells), and every cell is the same size.
 */
export const fineGrid = (scale: number): number => (scale >= 3 ? scale / 2 : scale);
/** The widest a strip's image may be; longer strips wrap onto more rows. */
export const MAX_W = 2040;

/**
 * How lit a voxel is, 0 (deep shade) to 1 (full light), in a few hard steps. The light comes from
 * straight above, so the shading holds whichever way the thing is turned: `nz` is how far the
 * surface faces up (1 a flat top, 0 a wall), `open` the share of the cells just above and around
 * it that are empty (how much sky it sees), `up` how high it is in the part (0 to 1). A curved
 * roof steps down through the bands as it falls away, and the foot of a wall is darkest.
 */
export function lightOf(nz: number, open: number, up: number, steps = 7): number {
  const face = Math.max(0, nz);
  const k = (0.16 + 0.84 * face * face) * (0.5 + 0.5 * open) + 0.16 * up * (1 - face);
  return Math.round(Math.min(1, Math.max(0, k)) * steps) / steps;
}

function mix3(t: readonly number[][], k: number, out: number[]): void {
  const a = k < 0.5 ? t[0]! : t[1]!;
  const b = k < 0.5 ? t[1]! : t[2]!;
  const f = k < 0.5 ? k * 2 : (k - 0.5) * 2;
  for (let i = 0; i < 3; i++) out[i] = a[i]! + (b[i]! - a[i]!) * f;
}

/** A part sampled into voxels: which material each is (0 for none) and how lit, 0 to 255. */
interface Sampled {
  cw: number;
  ch: number;
  n: number;
  names: string[];
  grid: Uint8Array;
  lit: Uint8Array;
}

const sampled = new WeakMap<Part, Map<number, Sampled>>();

/**
 * Sample a part into voxels and work out how lit each one is. A smooth part is sampled at every
 * texel's centre in all three directions; any other part was written for whole layers, so it gets
 * its layer number and only its outline is finer. Kept per part: a car in another colour only
 * needs colouring again.
 */
function sample(part: Part, res: number): Sampled {
  let byRes = sampled.get(part);
  if (!byRes) sampled.set(part, (byRes = new Map()));
  const had = byRes.get(res);
  if (had) return had;
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
          index.set(m, (k = names.length));
          names.push(m);
        }
        grid[(z * ch + y) * cw + x] = k;
      }
  }
  const solid = (x: number, y: number, z: number): boolean =>
    x >= 0 && y >= 0 && z >= 0 && x < cw && y < ch && z < n && grid[(z * ch + y) * cw + x] !== 0;
  // the shading looks at the same distance around a voxel however fine the part is
  const st = Math.max(1, Math.round(res / DETAIL));
  const steps = res > DETAIL ? 10 : 7;
  const lit = new Uint8Array(cw * ch * n);
  for (let z = 0; z < n; z++)
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        const i = (z * ch + y) * cw + x;
        if (!grid[i]) continue;
        // only the surface is ever seen (until something is knocked off, and then it is scuffed)
        if (
          solid(x, y, z + 1) &&
          solid(x + 1, y, z) &&
          solid(x - 1, y, z) &&
          solid(x, y + 1, z) &&
          solid(x, y - 1, z)
        )
          continue;
        // which way the surface faces: away from the solid around this voxel
        let nx = 0;
        let ny = 0;
        let nz = 0;
        let open = 0;
        for (let dz = -2; dz <= 2; dz++)
          for (let dy = -2; dy <= 2; dy++)
            for (let dx = -2; dx <= 2; dx++) {
              if (solid(x + dx * st, y + dy * st, z + dz * st)) continue;
              nx += dx;
              ny += dy;
              nz += dz;
              if (dz > 0 && dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1) open++;
            }
        lit[i] = Math.round(
          lightOf(nz / (Math.hypot(nx, ny, nz) || 1), open / 18, z / n, steps) * 255,
        );
      }
  const out = { cw, ch, n, names, grid, lit };
  byRes.set(res, out);
  return out;
}

/** How each finish shines: the stack shader's 0 dull, 1 painted, 2 metal, 3 polished. */
export const FINISH_GLOSS: Readonly<Record<Exclude<Finish, 'glow'>, number>> = {
  matte: 0,
  paint: 1,
  metal: 2,
  chrome: 3,
  glass: 3,
};

/**
 * How a named material glows (0 to 7) and shines (0 to 3): by its own finish if its name carries
 * one (`paintr@metal`), or else the way the palette's lists say its colour does.
 */
export function shineOf(
  name: string,
  glows?: Readonly<Record<string, number>>,
  glosses?: Readonly<Record<string, number>>,
): [glow: number, gloss: number] {
  if (!name) return [0, 0];
  const { material: m, finish } = finishOf(name);
  if (finish === 'glow') return [7, glosses?.[m] ?? 0];
  if (finish) return [0, FINISH_GLOSS[finish]];
  return [glows?.[m] ?? 0, glosses?.[m] ?? 0];
}

/** A part as a strip in the given materials, `res` texels to the art pixel. */
export function build(
  part: Part,
  mats: Record<string, Tones>,
  res = DETAIL,
  glows?: Readonly<Record<string, number>>,
  glosses?: Readonly<Record<string, number>>,
): Strip {
  const { cw, ch, n, names, grid, lit } = sample(part, res);
  const cols = Math.max(1, Math.min(n, Math.floor(MAX_W / cw)));
  const W = cw * cols;
  const H = ch * Math.ceil(n / cols);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const px = new Uint8ClampedArray(W * H * 4);
  // (a name may carry a finish of its own, `paintr@metal`: the colour is the material's)
  const told = names.map((m) => finishOf(m));
  const rgb = told.map(({ material: m }) => {
    if (m && !mats[m]) throw new Error(`no material ${m}`);
    return m ? mats[m]!.map(hexRgb) : [];
  });
  // which of its materials glow (lamps, lenses), and so which texels: kept beside the pixels
  const shine = names.map((m) => shineOf(m, glows, glosses)[0]);
  const glow = shine.some((g) => g > 0) ? new Uint8Array(W * H) : undefined;
  // and which shine in the light (paint, metal, chrome and glass)
  const sheen = names.map((m) => shineOf(m, glows, glosses)[1]);
  const gloss = sheen.some((g) => g > 0) ? new Uint8Array(W * H) : undefined;
  const c = [0, 0, 0];
  for (let z = 0; z < n; z++)
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        const i = (z * ch + y) * cw + x;
        const m = grid[i]!;
        if (!m) continue;
        mix3(rgb[m]!, lit[i]! / 255, c);
        const t = (Math.floor(z / cols) * ch + y) * W + (z % cols) * cw + x;
        const j = t * 4;
        px[j] = c[0]!;
        px[j + 1] = c[1]!;
        px[j + 2] = c[2]!;
        px[j + 3] = 255;
        if (glow) glow[t] = shine[m]!;
        if (gloss) gloss[t] = sheen[m]!;
      }
  return { img: cv, cw, ch, n, res, cols, px, stale: true, glow, gloss };
}

/**
 * A strip's pixels (RGBA rows, the image's width). They are what the pixel engine uploads and
 * what gets dented; the strip's canvas is only brought up to date when something wants to draw
 * from it (`settle`).
 */
export function pixels(s: Strip): Uint8ClampedArray {
  s.px ??= s.img.getContext('2d')!.getImageData(0, 0, s.img.width, s.img.height).data;
  return s.px;
}

/** Bring a strip's canvas up to date with its pixels, and return it. */
export function settle(s: Strip): HTMLCanvasElement {
  if (s.stale && s.px) {
    const id = new ImageData(s.img.width, s.img.height);
    id.data.set(s.px);
    s.img.getContext('2d')!.putImageData(id, 0, 0);
  }
  s.stale = false;
  return s.img;
}

export function clone(s: Strip): Strip {
  const cv = document.createElement('canvas');
  cv.width = s.img.width;
  cv.height = s.img.height;
  return { ...s, img: cv, px: pixels(s).slice(), stale: true };
}

/** Make `s` a fresh copy of `from` again (the same part), keeping the strip itself. */
export function restore(s: Strip, from: Strip): void {
  pixels(s).set(pixels(from));
  s.stale = true;
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
  /** Where each layer starts in the pixels (filled in by `layers`). */
  zo?: Int32Array;
}

/** Where each layer's first voxel is in the pixels: voxel (x, y, z) is at zo[z] + (y * W + x) * 4. */
function layers(v: Voxels): Int32Array {
  if (!v.zo) {
    v.zo = new Int32Array(v.n);
    for (let z = 0; z < v.n; z++) v.zo[z] = at(v, 0, 0, z);
  }
  return v.zo;
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
 * the middle (`power` of the part's height, down from its surface there), shallower towards the rim, with the paint around it chipped and scuffed darker. The
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
  const zo = layers(v);
  const x0 = Math.max(0, Math.floor(cx - R));
  const x1 = Math.min(v.cw - 1, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R));
  const y1 = Math.min(v.ch - 1, Math.ceil(cy + R));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R;
      if (d > 1) continue;
      const q = d / 0.6;
      const deep = q < 1 ? crush * (1 - q * q * 0.7) : 0;
      const k = 0.8 + 0.2 * d;
      const col = (y * v.W + x) * 4;
      // the crater is measured down from the surface here, not from the top of the part's box:
      // a low bonnet loses as much as a tall roof
      let top = v.n - 1;
      while (top >= 0 && !px[zo[top]! + col + 3]) top--;
      for (let z = top; z >= 0; z--) {
        const j = zo[z]! + col;
        if (!px[j + 3]) continue;
        const under = top - z;
        if (
          z >= floor &&
          (under < deep || (d < 0.9 && under < deep + v.res && rand() < 0.3 * power))
        ) {
          out.add(x, y, z, j);
          px[j + 3] = 0;
          continue;
        }
        // near the surface only: the rim is scuffed darker, and the floor of the hole, which was
        // buried and so drawn in its darkest tone, comes up to what bare material looks like
        if (under > deep + v.res * 2) break;
        const m = deep > 0 ? 1.45 : k;
        px[j] = px[j]! * m;
        px[j + 1] = px[j + 1]! * m;
        px[j + 2] = px[j + 2]! * m;
      }
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

/** Scratch for the flood fills below, kept between calls so a dent allocates nothing big. */
let markBuf = new Uint8Array(0);
let todoBuf = new Int32Array(0);
function scratch(size: number): void {
  if (markBuf.length < size) {
    markBuf = new Uint8Array(size);
    todoBuf = new Int32Array(size);
  } else markBuf.fill(0, 0, size);
}

/**
 * Whatever no longer hangs on to the bottom `keep` art px of the part (through voxels that touch
 * face to face) comes away: it is removed and returned as blocks, so it can fall off in one piece.
 * This looks at the whole part; after a dent, `detachNear` is much cheaper.
 */
export function detachVoxels(v: Voxels, keep = 1, block = v.res * 2): Chip[] {
  const { px, cw, ch, n } = v;
  const floor = Math.max(1, Math.round(keep * v.res));
  const layer = cw * ch;
  scratch(layer * n);
  const held = markBuf;
  const todo = todoBuf;
  const zo = layers(v);
  const W4 = v.W * 4;
  let top = 0;
  const visit = (x: number, y: number, z: number): void => {
    if (x < 0 || y < 0 || z < 0 || x >= cw || y >= ch || z >= n) return;
    const i = z * layer + y * cw + x;
    if (held[i] || !px[zo[z]! + y * W4 + x * 4 + 3]) return;
    held[i] = 1;
    todo[top++] = i;
  };
  for (let z = 0; z < Math.min(floor, n); z++)
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) visit(x, y, z);
  while (top) {
    const i = todo[--top]!;
    const x = i % cw;
    const y = Math.floor(i / cw) % ch;
    const z = Math.floor(i / layer);
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
        if (held[z * layer + y * cw + x]) continue;
        const j = zo[z]! + y * W4 + x * 4;
        if (!px[j + 3]) continue;
        out.add(x, y, z, j);
        px[j + 3] = 0;
      }
  return out.chips();
}

/**
 * The same, but only for pieces that touch the box a blow was struck in (texels, x0..x1 by
 * y0..y1, every height): a piece cut loose by a dent always has a voxel next to the crater. Each
 * piece is followed downwards first, so one that still stands on the floor is settled in a few
 * steps, and a piece of more than `most` voxels is taken to be the body itself and stays.
 */
export function detachNear(
  v: Voxels,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  keep = 1,
  block = v.res * 2,
  most = 30000,
): Chip[] {
  const { px, cw, ch, n } = v;
  const floor = Math.max(1, Math.round(keep * v.res));
  const layer = cw * ch;
  scratch(layer * n);
  const mark = markBuf;
  const todo = todoBuf;
  const out = new Blocks(v, block);
  const zo = layers(v);
  const W4 = v.W * 4;
  const full = (x: number, y: number, z: number): boolean =>
    x >= 0 &&
    y >= 0 &&
    z >= 0 &&
    x < cw &&
    y < ch &&
    z < n &&
    px[zo[z]! + y * W4 + x * 4 + 3] !== 0;
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(cw - 1, x1);
  y1 = Math.min(ch - 1, y1);
  for (let z0 = floor; z0 < n; z0++)
    for (let ys = y0; ys <= y1; ys++)
      for (let xs = x0; xs <= x1; xs++) {
        const seed = z0 * layer + ys * cw + xs;
        if (mark[seed] || !px[zo[z0]! + ys * W4 + xs * 4 + 3]) continue;
        // standing on a voxel that is held (or on the floor) settles it at once
        if (z0 === floor ? px[zo[z0 - 1]! + ys * W4 + xs * 4 + 3] : mark[seed - layer] === 1) {
          mark[seed] = 1;
          continue;
        }
        // follow this piece: 1 marks voxels known to be held, 2 the piece being followed
        let top = 0;
        let count = 0;
        let held = false;
        mark[seed] = 2;
        todo[top++] = seed;
        // the piece's voxels are kept at the far end of the scratch, to mark or remove after
        let end = todo.length;
        while (top) {
          const i = todo[--top]!;
          todo[--end] = i;
          if (++count > most || end <= top + 6) {
            held = true;
            break;
          }
          const x = i % cw;
          const y = Math.floor(i / cw) % ch;
          const z = Math.floor(i / layer);
          if (z < floor) {
            held = true;
            break;
          }
          let stop = false;
          const visit = (xx: number, yy: number, zz: number): void => {
            if (!full(xx, yy, zz)) return;
            const k = zz * layer + yy * cw + xx;
            if (mark[k] === 1) stop = true;
            else if (!mark[k]) {
              mark[k] = 2;
              todo[top++] = k;
            }
          };
          visit(x, y, z + 1);
          visit(x + 1, y, z);
          visit(x - 1, y, z);
          visit(x, y + 1, z);
          visit(x, y - 1, z);
          visit(x, y, z - 1);
          if (stop) {
            held = true;
            break;
          }
        }
        if (held) {
          for (let k = end; k < todo.length; k++) mark[todo[k]!] = 1;
          for (let k = 0; k < top; k++) mark[todo[k]!] = 1;
          continue;
        }
        for (let k = end; k < todo.length; k++) {
          const i = todo[k]!;
          const x = i % cw;
          const y = Math.floor(i / cw) % ch;
          const z = Math.floor(i / layer);
          const j = at(v, x, y, z);
          out.add(x, y, z, j);
          px[j + 3] = 0;
        }
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

export const voxels = (s: Strip, px: Uint8ClampedArray): Voxels => ({
  px,
  W: s.img.width,
  cw: s.cw,
  ch: s.ch,
  n: s.n,
  res: s.res,
  cols: s.cols,
});

/** Run `fn` over a strip's pixels; its canvas is brought up to date later, if anyone needs it. */
function edit<T>(s: Strip, fn: (v: Voxels) => T): T {
  const out = fn(voxels(s, pixels(s)));
  s.stale = true;
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
  return edit(s, (v) => {
    const chips = dentVoxels(v, lx, ly, r, power, rand, keep);
    const cx = v.cw / 2 + lx * v.res;
    const cy = v.ch / 2 + ly * v.res;
    const R = r * v.res + 2;
    const loose = detachNear(
      v,
      Math.floor(cx - R),
      Math.floor(cy - R),
      Math.ceil(cx + R),
      Math.ceil(cy + R),
      keep,
    );
    return { chips, loose };
  });
}

export function shatter(s: Strip, share: number, rand: () => number, keep = 1): Broken {
  return edit(s, (v) => ({
    chips: shatterVoxels(v, share, rand, keep),
    loose: detachVoxels(v, keep),
  }));
}

/** A whole strip as blocks about two art px a side (for things that vanish as they burst). */
export function voxelsOf(s: Strip, block = s.res * 2): Chip[] {
  return allVoxels(voxels(s, pixels(s)), block);
}

/** Voxels of its own (a piece cracked off something) as a strip that can be drawn. */
export function stripOf(v: Voxels): Strip {
  const cv = document.createElement('canvas');
  cv.width = v.W;
  cv.height = v.px.length / 4 / v.W;
  return { img: cv, cw: v.cw, ch: v.ch, n: v.n, res: v.res, cols: v.cols, px: v.px, stale: true };
}

/** A burnt-out shell: everything charred dark. */
export function char(s: Strip): void {
  const px = pixels(s);
  for (let j = 0; j < px.length; j += 4) {
    if (!px[j + 3]) continue;
    px[j] = px[j]! * 0.22 + 15.6;
    px[j + 1] = px[j + 1]! * 0.22 + 10.9;
    px[j + 2] = px[j + 2]! * 0.22 + 7.8;
  }
  s.stale = true;
}

/**
 * Tear leaves off a tree: everything outside its bare trunk (radius `trunk`, up to `top`, art px)
 * is leaf, taken an art pixel at a time. `share` of what is left goes, peeled off from the outside
 * in and from the side facing (dx, dy) first (a unit vector in the strip's own frame; 0, 0 for all
 * round), raggedly. Returns the leaves that came off.
 */
export function stripCrown(
  s: Strip,
  trunk: number,
  top: number,
  dx: number,
  dy: number,
  share: number,
  rand: () => number,
): Chip[] {
  return edit(s, (v) => {
    const { px, cw, ch, n, res: B } = v;
    // every art pixel of leaf there still is, and how exposed it is
    const found: [number, number, number, number][] = [];
    let mx = 0;
    let my = 0;
    let mz = 0;
    for (let bz = 0; bz < n; bz += B)
      for (let by = 0; by < ch; by += B)
        for (let bx = 0; bx < cw; bx += B) {
          const x = (bx + B / 2 - cw / 2) / B;
          const y = (by + B / 2 - ch / 2) / B;
          if (Math.hypot(x, y) <= trunk && bz / B <= top) continue;
          let any = false;
          for (let k = 0; k < B && bz + k < n && !any; k++)
            for (let j = 0; j < B && by + j < ch && !any; j++)
              for (let i = 0; i < B && bx + i < cw; i++)
                if (px[at(v, bx + i, by + j, bz + k) + 3]) {
                  any = true;
                  break;
                }
          if (!any) continue;
          found.push([bx, by, bz, 0]);
          mx += x;
          my += y;
          mz += bz / B;
        }
    const N = found.length;
    if (!N) return [];
    mx /= N;
    my /= N;
    mz /= N;
    for (const f of found) {
      const x = (f[0] + B / 2 - cw / 2) / B - mx;
      const y = (f[1] + B / 2 - ch / 2) / B - my;
      const z = f[2] / B - mz;
      f[3] = (x * dx + y * dy) * 1.6 + Math.hypot(x, y, z) + rand() * 3.5;
    }
    found.sort((a, b) => b[3] - a[3]);
    const out: Chip[] = [];
    const take = Math.min(N, Math.ceil(N * share));
    for (let q = 0; q < take; q++) {
      const [bx, by, bz] = found[q]!;
      let rgb = -1;
      for (let k = 0; k < B && bz + k < n; k++)
        for (let j = 0; j < B && by + j < ch; j++)
          for (let i = 0; i < B && bx + i < cw; i++) {
            const o = at(v, bx + i, by + j, bz + k);
            if (!px[o + 3]) continue;
            if (rgb < 0) rgb = (px[o]! << 16) | (px[o + 1]! << 8) | px[o + 2]!;
            px[o + 3] = 0;
          }
      out.push({
        x: (bx + B / 2 - cw / 2) / B,
        y: (by + B / 2 - ch / 2) / B,
        z: bz / B,
        s: 1,
        rgb,
      });
    }
    return out;
  });
}
