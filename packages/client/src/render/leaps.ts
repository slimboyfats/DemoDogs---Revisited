import type { StaticProp, World } from '@demodogs/sim';
import { onPad, pathAt } from '@demodogs/sim';
import { SKINS, wayPainted, waysOf, type Skin } from './ways';

/**
 * How a jump's two pieces look (props with a `leap`; the sim makes them raised ground). Each
 * takes the look of the way it joins: a takeoff that of the ground it is driven onto from, a
 * landing that of the ground it leads on to. A path laid off the road says what it is laid in
 * (its pad's `skin`), the road is tarmac or dirt as the venue's is, and the open ground is rock.
 * Looks only: the ground's shader paints the top as part of the way (ways.ts) and the faces;
 * a piece that is on no way has its top painted on the ground canvas here.
 */

/** How far past a piece's end the way it joins is looked for (art px). */
const JOIN = 60;
/** How far out from a piece its sheer sides reach (the relief's side, and a little). */
const SIDE = 12;

/** The look of jump piece `s`. */
export function leapSkin(w: World, s: StaticProp): Skin {
  const own = waysOf(w)?.skins.get(s);
  if (own) return own;
  const L = s.def.leap!;
  const back = L.way === 'up' ? -1 : 1;
  // the first thing found going out from its low end: a path, the road, or open ground
  for (let d = L.long / 2 + 4; d <= L.long / 2 + JOIN; d += 5) {
    const x = s.x + Math.cos(s.rot) * d * back;
    const y = s.y + Math.sin(s.rot) * d * back;
    const p = pathAt(w, x, y);
    if (p && p !== s && p.def.pad?.kind === 'road' && !p.def.leap) return p.def.pad.skin ?? 'dirt';
    if (w.grid && w.grid.at(x, y) < w.road / 2)
      return w.venue.colors.road === 'dirt' ? 'dirt' : 'tarmac';
  }
  return 'rock';
}

/**
 * Which jump piece's face, if any, the ground at (x, y) is, for the relief's map: its look (1
 * and on, in the order of `SKINS`) times 32, plus the way it points in 32nds of a turn. 0 where
 * there is none. Null for a venue with no jump pieces.
 */
export function leapFaces(w: World): ((x: number, y: number) => number) | null {
  const all = w.statics.filter((s) => s.def.leap);
  if (!all.length) return null;
  const code = all.map((s) => {
    const turn = Math.round((((s.rot / (Math.PI * 2)) % 1) + 1) * 32) % 32;
    return (SKINS.indexOf(leapSkin(w, s)) + 1) * 32 + turn;
  });
  return (x, y) => {
    for (let i = 0; i < all.length; i++) {
      const s = all[i]!;
      const L = s.def.leap!;
      if (Math.abs(s.x - x) > L.long + SIDE || Math.abs(s.y - y) > L.long + SIDE) continue;
      const [u, v] = onPad(s, x, y);
      if (Math.abs(u) <= L.long / 2 + SIDE && Math.abs(v) <= L.wide / 2 + SIDE) return code[i]!;
    }
    return 0;
  };
}

/** How wide a jump piece's sides are drawn (art px): all but sheer, so its edges are straight. */
const WALL = 3;

/**
 * How high the jump pieces stand at (x, y), worked out from their own shapes: a ramp from nothing
 * at the low end to its height at the tall one, level across, its sides and its tall end all but
 * sheer. -1 away from every piece. The sim's height map holds the same blocks on a grid too coarse
 * to draw a straight edge from, so the picture of the ground takes these instead (relief-map.ts).
 * Null for a venue with no jump pieces.
 */
export function leapHeights(w: World): ((x: number, y: number) => number) | null {
  const all = w.statics.filter((s) => s.def.leap);
  if (!all.length) return null;
  // (as far out as the height map's own block reaches between its points)
  const FAR = 22;
  return (x, y) => {
    let h = -1;
    for (const s of all) {
      const L = s.def.leap!;
      if (Math.abs(s.x - x) > L.long + FAR || Math.abs(s.y - y) > L.long + FAR) continue;
      const [a, v] = onPad(s, x, y);
      const u = L.way === 'up' ? a : -a;
      const e = Math.min(L.wide / 2 - Math.abs(v), L.long / 2 - u);
      if (e < -FAR || u < -L.long / 2 - FAR) continue;
      const top = L.high * Math.max(0, Math.min(1, (u + L.long / 2) / L.long));
      h = Math.max(h, top * Math.max(0, Math.min(1, (e + WALL) / WALL)));
    }
    return h;
  };
}

const hex = (c: string): [number, number, number] => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const WOOD = ['#b08a58', '#a07c4e', '#c09864'].map(hex);
const WOOD_DARK = hex('#8e6c46');
const WOOD_GAP = hex('#4c3824');
const DIRT = hex('#b08c5e');
const DIRT_DARK = hex('#99774e');
const STONE = ['#a8a49a', '#9a968c', '#b6b2a6', '#8e8a80'].map(hex);
const MORTAR = hex('#6a665e');
const TARMAC = hex('#9a9ca0');
const LINE = hex('#f0efe6');

/** A whole-number hash, 0 to 1. */
function hash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The colour of a piece's top at (u along it from its back, v across from its middle). */
function topAt(
  skin: Skin,
  u: number,
  v: number,
  W: number,
  long: number,
): [number, number, number] {
  const av = Math.abs(v);
  // a pale band along the tall end, where it drops away
  if (u > long - 2.5) return skin === 'tarmac' ? LINE : skin === 'wood' ? WOOD[2]! : STONE[2]!;
  switch (skin) {
    case 'boards':
    case 'wood': {
      if (av > W - 3) return WOOD_DARK;
      const k = u % 5;
      if (k < 0.7) return WOOD_GAP;
      if (av > W - 5.5 && av < W - 4.5 && k > 2.2 && k < 3.2) return WOOD_GAP;
      return WOOD[Math.floor(u / 5) % 3]!;
    }
    case 'dirt':
      if (av > W - 2 || (Math.abs(av - 11) < 1.3 && hash(Math.floor(u / 6), 7) > 0.3))
        return DIRT_DARK;
      return DIRT;
    case 'tarmac':
      if (av > W - 5 && av < W - 3) return LINE;
      return TARMAC;
    case 'rock': {
      const row = Math.floor(u / 6);
      const sv = v + W + (row & 1) * 3.5;
      if (u % 6 < 1 || sv % 7 < 1) return MORTAR;
      return STONE[Math.floor(hash(row, Math.floor(sv / 7)) * 4)]!;
    }
  }
}

/** Paint the top of every jump piece on the ground canvas, in the look of the way it joins. */
export function paintLeaps(g: CanvasRenderingContext2D, w: World): void {
  for (const s of w.statics) {
    const L = s.def.leap;
    if (!L || wayPainted(s)) continue;
    const skin = leapSkin(w, s);
    const r = Math.hypot(L.long, L.wide) / 2 + 2;
    const x0 = Math.max(0, Math.floor(s.x - r));
    const y0 = Math.max(0, Math.floor(s.y - r));
    const x1 = Math.min(w.w, Math.ceil(s.x + r));
    const y1 = Math.min(w.h, Math.ceil(s.y + r));
    if (x1 <= x0 || y1 <= y0) continue;
    const img = g.getImageData(x0, y0, x1 - x0, y1 - y0);
    const px = img.data;
    const W = L.wide / 2;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const [a, v] = onPad(s, x + 0.5, y + 0.5);
        if (Math.abs(a) > L.long / 2 || Math.abs(v) > W) continue;
        // along it from its low end to its tall one
        const u = (L.way === 'up' ? a : -a) + L.long / 2;
        const c = topAt(skin, u, v, W, L.long);
        const o = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
        px[o] = c[0];
        px[o + 1] = c[1];
        px[o + 2] = c[2];
        px[o + 3] = 255;
      }
    g.putImageData(img, x0, y0);
  }
}
