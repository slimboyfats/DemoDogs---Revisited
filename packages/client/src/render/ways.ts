import type { StaticProp, World } from '@demodogs/sim';

/**
 * Ways: the roads laid off the main road out of path pieces (pads of kind `road`: dirt, planks,
 * cobbles, and the two pieces of a jump). To the sim each piece is a patch of road; here the
 * pieces that follow one another are joined into one line, smoothed, and handed to the ground's
 * painter (pixel/ground-paint-glsl.ts), which lays a road along it as it lays the main road:
 * one unbroken surface as fine as the screen, forking out of the main road and running up a
 * takeoff and down a landing. A piece that is painted this way is not drawn as a stack.
 */
export type Skin = 'rock' | 'wood' | 'dirt' | 'tarmac' | 'boards';
export const SKINS: readonly Skin[] = ['rock', 'wood', 'dirt', 'tarmac', 'boards'];

/** How far apart a way's samples are (art px). */
export const WAY_STEP = 3;
/** How far from the main road's edge a way's end still joins it (art px). */
const JOIN = 46;
/** Over how much of its length a way widens into the main road, and by how much. */
const FLARE = 70;
const FLARE_BY = 0.45;

export interface Ways {
  n: number;
  /**
   * Two rows of four a sample. x, y, angle, half its width; then its surface (index in `SKINS`),
   * what it is (0 road, 1 takeoff, 2 landing; +4 the first sample of a way, +8 the last),
   * how far from a jump's edge (to a takeoff's lip, from a landing's back), and how far along.
   */
  samples: Float32Array;
  /** Nearest sample to each block of `q` px, or 0xffff. */
  near: { gw: number; gh: number; q: number; data: Uint16Array };
  /** The surface each jump piece wears. */
  skins: Map<StaticProp, Skin>;
  /** The pieces these ways were made from. */
  pieces: StaticProp[];
}

/** The pieces whose ways the ground's painter lays: the stacks leave them alone. */
const painted = new WeakSet<StaticProp>();
export const wayPainted = (s: StaticProp): boolean => painted.has(s);

interface Pt {
  x: number;
  y: number;
  s: StaticProp;
}

const made = new WeakMap<World, Ways | null>();

/**
 * The ways of world `w` as it was built, or null if it has none (worked out once a world).
 * `claim` marks their pieces as painted by the ground, so the stacks leave them alone.
 */
export function waysOf(w: World, claim = false): Ways | null {
  let W = made.get(w);
  if (W === undefined) made.set(w, (W = build(w)));
  if (W && claim) for (const s of W.pieces) painted.add(s);
  return W;
}

function build(w: World): Ways | null {
  const all = w.paths.filter((s) => !s.down && s.def.pad?.kind === 'road');
  if (!all.length) return null;
  // which piece follows which: the nearest one ahead, along the way a piece is turned
  const next = new Map<StaticProp, StaticProp>();
  const prev = new Map<StaticProp, StaticProp>();
  const links: [number, StaticProp, StaticProp][] = [];
  for (const a of all) {
    const A = a.def.pad!;
    const cs = Math.cos(a.rot);
    const sn = Math.sin(a.rot);
    for (const b of all) {
      if (a === b) continue;
      const B = b.def.pad!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const u = dx * cs + dy * sn;
      const v = -dx * sn + dy * cs;
      if (u < 4 || u > (A.long + B.long) / 2 + 24 || Math.abs(v) > A.wide * 0.6) continue;
      if (Math.cos(b.rot - a.rot) < 0.3) continue;
      links.push([u + Math.abs(v), a, b]);
    }
  }
  links.sort((p, q) => p[0] - q[0] || p[1].index - q[1].index || p[2].index - q[2].index);
  for (const [, a, b] of links) {
    if (next.has(a) || prev.has(b)) continue;
    next.set(a, b);
    prev.set(b, a);
  }
  const half = w.road / 2;
  const G = w.grid;
  const off = (x: number, y: number): number => (G ? G.at(x, y) - half : 1e4);
  const rows: number[][] = [];
  const skins = new Map<StaticProp, Skin>();
  const pieces: StaticProp[] = [];
  for (const head of all) {
    if (prev.has(head)) continue;
    const chain: StaticProp[] = [];
    for (let s: StaticProp | undefined = head; s && !chain.includes(s); s = next.get(s))
      chain.push(s);
    // a jump piece wears the surface of the way it joins: a takeoff that of the way onto it,
    // a landing that of the way on from it
    const plain = (s: StaticProp | undefined): Skin | null =>
      s && !s.def.leap && s.def.pad?.kind === 'road' ? (s.def.pad.skin ?? 'dirt') : null;
    const skinOf = (k: number): Skin => {
      const s = chain[k]!;
      const own = plain(s);
      if (own) return own;
      const up = s.def.leap!.way === 'up';
      for (let j = k + (up ? -1 : 1); j >= 0 && j < chain.length; j += up ? -1 : 1) {
        const o = plain(chain[j]);
        // (a ramp off old boards is sound timber)
        if (o) return o === 'boards' ? 'wood' : o;
      }
      const end = endOf(s, up ? -1 : 1);
      if (off(end[0], end[1]) < 8) return w.venue.colors.road === 'dirt' ? 'dirt' : 'tarmac';
      return 'rock';
    };
    // the line through them: the middle of each piece, both ends of a jump piece (it is
    // straight), and the two ends of the whole
    const pts: Pt[] = [];
    const first = chain[0]!;
    const last = chain[chain.length - 1]!;
    const b0 = endOf(first, -1);
    pts.push({ x: b0[0], y: b0[1], s: first });
    for (const s of chain) {
      if (s.def.leap) {
        const b = endOf(s, -1);
        const f = endOf(s, 1);
        if (s !== first) pts.push({ x: b[0], y: b[1], s });
        if (s !== last) pts.push({ x: f[0], y: f[1], s });
      } else pts.push({ x: s.x, y: s.y, s });
    }
    const f1 = endOf(last, 1);
    pts.push({ x: f1[0], y: f1[1], s: last });
    // an end beside the main road runs on into it, so the way forks out of the road itself
    let joinA = 0;
    let joinB = 0;
    // (on along its own line until it is well under the road, however shallow it comes in)
    const under = (x: number, y: number, rot: number, dir: number): Pt | null => {
      for (let e = 8; e <= 260; e += 8) {
        const px = x + Math.cos(rot) * e * dir;
        const py = y + Math.sin(rot) * e * dir;
        if (off(px, py) > -half * 0.35) continue;
        // (and there it turns in to the middle of the road, so no corner of its end shows)
        const T = w.track;
        const i = G ? G.nearest(px, py) : -1;
        const s = dir < 0 ? first : last;
        return T && i >= 0 ? { x: T.x[i]!, y: T.y[i]!, s } : { x: px, y: py, s };
      }
      return null;
    };
    if (!first.def.leap && off(b0[0], b0[1]) < JOIN) {
      const p = under(b0[0], b0[1], first.rot, -1);
      if (p) {
        joinA = 1;
        pts.unshift(p);
      }
    }
    if (!last.def.leap && off(f1[0], f1[1]) < JOIN) {
      const p = under(f1[0], f1[1], last.rot, 1);
      if (p) {
        joinB = 1;
        pts.push(p);
      }
    }
    // smoothed (a Catmull-Rom curve through the points) and cut into even steps
    const fine: Pt[] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const p0 = pts[Math.max(0, i - 1)]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
      // (a jump piece is straight from end to end)
      const straight = p1.s === p2.s && !!p1.s.def.leap;
      const n = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y)));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const s = t < 0.5 ? p1.s : p2.s;
        if (straight) {
          fine.push({ x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t, s });
          continue;
        }
        const t2 = t * t;
        const t3 = t2 * t;
        const cr = (a: number, b: number, c: number, d: number): number =>
          0.5 *
          (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
        fine.push({ x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y), s });
      }
    }
    fine.push(pts[pts.length - 1]!);
    const even: Pt[] = [fine[0]!];
    let acc = 0;
    for (let i = 1; i < fine.length; i++) {
      const a = fine[i - 1]!;
      const b = fine[i]!;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      while (acc + d >= WAY_STEP) {
        const t = (WAY_STEP - acc) / d;
        even.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: t < 0.5 ? a.s : b.s });
        acc -= WAY_STEP;
      }
      acc += d;
    }
    if (even.length < 3) continue;
    const N = even.length;
    const total = (N - 1) * WAY_STEP;
    const at = new Map(chain.map((s, k) => [s, k] as const));
    for (let i = 0; i < N; i++) {
      const p = even[i]!;
      const a = even[Math.max(0, i - 1)]!;
      const b = even[Math.min(N - 1, i + 1)]!;
      const s = p.s;
      const L = s.def.leap;
      const along = i * WAY_STEP;
      let wide = (L ? L.wide : s.def.pad!.wide) / 2;
      // wider where it meets the main road
      const near = Math.min(joinA ? along : 1e9, joinB ? total - along : 1e9);
      if (near < FLARE) wide *= 1 + FLARE_BY * (1 - near / FLARE) ** 2;
      let edge = -1;
      if (L) {
        const u = (p.x - s.x) * Math.cos(s.rot) + (p.y - s.y) * Math.sin(s.rot);
        edge = L.way === 'up' ? L.long / 2 - u : u + L.long / 2;
      }
      const skin = skinOf(at.get(s)!);
      if (L) skins.set(s, skin);
      rows.push([
        p.x,
        p.y,
        Math.atan2(b.y - a.y, b.x - a.x),
        wide,
        SKINS.indexOf(skin),
        (L ? (L.way === 'up' ? 1 : 2) : 0) + (i === 0 ? 4 : 0) + (i === N - 1 ? 8 : 0),
        edge,
        along,
      ]);
    }
    pieces.push(...chain);
  }
  const n = rows.length;
  if (!n || n >= 0xffff) return null;
  const samples = new Float32Array(n * 8);
  for (let i = 0; i < n; i++) {
    samples.set(rows[i]!.slice(0, 4), i * 4);
    samples.set(rows[i]!.slice(4), n * 4 + i * 4);
  }
  // which sample every block of the map is nearest to, as far out as a way's shade reaches
  const q = 2;
  const gw = Math.ceil(w.w / q);
  const gh = Math.ceil(w.h / q);
  const data = new Uint16Array(gw * gh).fill(0xffff);
  const dist = new Float32Array(gw * gh).fill(1e9);
  for (let i = 0; i < n; i++) {
    const sx = samples[i * 4]!;
    const sy = samples[i * 4 + 1]!;
    const R = samples[i * 4 + 3]! + 8;
    const x0 = Math.max(0, Math.floor((sx - R) / q));
    const x1 = Math.min(gw - 1, Math.ceil((sx + R) / q));
    const y0 = Math.max(0, Math.floor((sy - R) / q));
    const y1 = Math.min(gh - 1, Math.ceil((sy + R) / q));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5) * q - sx;
        const dy = (y + 0.5) * q - sy;
        const d = dx * dx + dy * dy;
        const k = y * gw + x;
        if (d < dist[k]! && d <= (R + q) * (R + q)) {
          dist[k] = d;
          data[k] = i;
        }
      }
  }
  return { n, samples, near: { gw, gh, q, data }, skins, pieces };
}

/** The middle of piece `s`'s back end (-1) or front end (1). */
function endOf(s: StaticProp, dir: number): [number, number] {
  const long = (s.def.leap?.long ?? s.def.pad!.long) / 2;
  return [s.x + Math.cos(s.rot) * long * dir, s.y + Math.sin(s.rot) * long * dir];
}
