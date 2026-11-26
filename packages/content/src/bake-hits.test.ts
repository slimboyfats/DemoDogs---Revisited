import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { PropLook, PropManifest } from '@demodogs/shared';
import { newTouch, propPoint } from '@demodogs/sim';
import { loadContent, loadLooks } from './index';

/**
 * Hit shapes baked from looks: `pnpm hitboxes:bake [prop ...]`.
 *
 * The rules never read a look (and every screen in an online race has to work out the very same
 * numbers), so what a thing looks like slice by slice is turned into hit shapes here, ahead of
 * time, and written into its manifest. Each slice of a standing prop's look gets a hitbox of its
 * own and they are stacked as the slices are; slices one over another with the same outline share
 * one, as tall as all of them (roots, a trunk, limbs). A hitbox is as few pieces as follow the
 * outline: the one shape the manifest already had if that fits, else a box or a circle about it,
 * else capsules laid along it thickest first. A prop whose one shape fits all the
 * way up only gains its height (`top`).
 *
 * Run it after a look is changed; `hitboxes.test.ts` fails when a shape no longer fits its look.
 */
const on = !!process.env.BAKE_HITS;
const ONLY = (process.env.BAKE_ONLY ?? '').split(',').filter(Boolean);

/** The grid a look is sampled on, art px. */
const STEP = 0.5;
/** Wheel height and roof height (art px): see where they are used. */
const LOW = 3;
const ROOF = 7;
/** Slices as alike as this (the share of their outlines they have in common) share a hitbox. */
const SAME = 0.85;
/** Slices that share a hitbox have edges no further apart than this, art px. */
const EDGE_OFF = 1.5;
/** A gap narrower than this (art px) is no gap: nothing gets into it. */
const GAP = 2;
/** The most pieces a prop is made of. */
const PIECES = 32;
/** How much of a band a shape may miss or overshoot (as a share of its area) and still be it. */
const NEAR = 0.22;
/** How far any of it may stand out of its pieces, art px. */
const OUT = 1.6;

type Piece =
  | { x: number; y: number; radius: number; z?: [number, number] }
  | {
      x: number;
      y: number;
      rot?: number;
      halfLength: number;
      halfWidth: number;
      round?: number;
      z?: [number, number];
    };

interface Grid {
  nx: number;
  ny: number;
  x0: number;
  y0: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Is (x, y) inside the piece? */
function inside(P: Piece, x: number, y: number): boolean {
  const dx = x - P.x;
  const dy = y - P.y;
  if ('radius' in P) return Math.hypot(dx, dy) <= P.radius;
  const rot = P.rot ?? 0;
  const u = Math.abs(dx * Math.cos(rot) + dy * Math.sin(rot));
  const v = Math.abs(-dx * Math.sin(rot) + dy * Math.cos(rot));
  const r = Math.min(P.round ?? 1, P.halfLength, P.halfWidth);
  const qx = Math.max(0, u - (P.halfLength - r));
  const qy = Math.max(0, v - (P.halfWidth - r));
  return Math.hypot(qx, qy) <= r;
}

/** How far off the pieces are from the mask: cells missed and cells overshot, as a share of it. */
function miss(G: Grid, mask: Uint8Array, pieces: Piece[]): number {
  let area = 0;
  let off = 0;
  for (let j = 0; j < G.ny; j++)
    for (let i = 0; i < G.nx; i++) {
      const m = mask[j * G.nx + i]!;
      const x = G.x0 + i * STEP;
      const y = G.y0 + j * STEP;
      const p = pieces.some((P) => inside(P, x, y));
      if (m) area++;
      if (!!m !== p) off++;
    }
  return area ? off / area : 1;
}

/** How far the furthest cell of the mask stands out of the pieces, art px. */
function stick(G: Grid, mask: Uint8Array, parts: Piece[]): number {
  const def = { hit: { parts }, radius: 1 } as unknown as PropManifest;
  const T = newTouch();
  let far = 0;
  for (let j = 0; j < G.ny; j++)
    for (let i = 0; i < G.nx; i++)
      if (mask[j * G.nx + i])
        far = Math.max(
          far,
          propPoint(def, 0, 0, 0, G.x0 + i * STEP, G.y0 + j * STEP, T, 0, Infinity),
        );
  return far;
}

/** How far each cell of the mask is from the nearest cell outside it, in cells (chamfer 3-4). */
function depth(G: Grid, mask: Uint8Array): Float32Array {
  const { nx, ny } = G;
  const D = new Float32Array(nx * ny);
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= ny ? 0 : D[j * nx + i]!);
  for (let k = 0; k < D.length; k++) D[k] = mask[k] ? 1e6 : 0;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      if (!mask[j * nx + i]) continue;
      D[j * nx + i] = Math.min(
        D[j * nx + i]!,
        at(i - 1, j) + 3,
        at(i, j - 1) + 3,
        at(i - 1, j - 1) + 4,
        at(i + 1, j - 1) + 4,
      );
    }
  for (let j = ny - 1; j >= 0; j--)
    for (let i = nx - 1; i >= 0; i--) {
      if (!mask[j * nx + i]) continue;
      D[j * nx + i] = Math.min(
        D[j * nx + i]!,
        at(i + 1, j) + 3,
        at(i, j + 1) + 3,
        at(i + 1, j + 1) + 4,
        at(i - 1, j + 1) + 4,
      );
    }
  // (a cell at the edge is half a cell in)
  for (let k = 0; k < D.length; k++) D[k] = Math.max(0, D[k]! / 3 - 0.5);
  return D;
}

/** Capsules laid along the mask, the thickest part of what is not yet covered first. */
function capsules(G: Grid, mask: Uint8Array, most: number): Piece[] {
  const { nx, ny } = G;
  const D = depth(G, mask);
  const left = Uint8Array.from(mask);
  let area = 0;
  for (const m of mask) area += m;
  const out: Piece[] = [];
  const deep = (x: number, y: number): number => {
    const i = Math.round((x - G.x0) / STEP);
    const j = Math.round((y - G.y0) / STEP);
    return i < 0 || j < 0 || i >= nx || j >= ny ? 0 : D[j * nx + i]! * STEP;
  };
  while (out.length < most) {
    let best = -1;
    let bd = 0;
    let open = 0;
    for (let k = 0; k < left.length; k++) {
      if (!left[k]) continue;
      open++;
      if (D[k]! > bd) {
        bd = D[k]!;
        best = k;
      }
    }
    const r = bd * STEP + STEP / 2;
    if (best < 0 || open < Math.max(area * 0.03, 3)) break;
    const px = G.x0 + (best % nx) * STEP;
    const py = G.y0 + Math.floor(best / nx) * STEP;
    // a bar from here, as thick as it is here or thinner (a root narrows to its tip), laid the
    // way that takes in most of what is left for the least that is not it at all
    let P: Piece = { x: r1(px), y: r1(py), radius: r1(r) };
    let gain = -1e9;
    for (const thin of [1, 0.7, 0.45]) {
      const rr = Math.max(0.6, r * thin);
      for (let a = 0; a < 24; a++) {
        const th = (a * Math.PI) / 24;
        const go = (sg: number) => {
          let t = 0;
          while (
            t < 80 &&
            deep(px + Math.cos(th) * (t + STEP) * sg, py + Math.sin(th) * (t + STEP) * sg) >=
              Math.max(STEP / 4, rr * 0.6 - STEP / 2)
          )
            t += STEP;
          return t;
        };
        const f = go(1);
        const b = go(-1);
        const half = (f + b) / 2;
        const mx = px + (Math.cos(th) * (f - b)) / 2;
        const my = py + (Math.sin(th) * (f - b)) / 2;
        const Q: Piece =
          half < 0.75
            ? { x: r1(mx), y: r1(my), radius: r1(rr) }
            : {
                x: r1(mx),
                y: r1(my),
                rot: Math.round(th * 100) / 100,
                halfLength: r1(half + rr),
                halfWidth: r1(rr),
                round: r1(rr),
              };
        const far = half + rr + STEP;
        let g = 0;
        for (let j = 0; j < ny; j++) {
          const y = G.y0 + j * STEP;
          if (y < my - far || y > my + far) continue;
          for (let i = 0; i < nx; i++) {
            const x = G.x0 + i * STEP;
            if (x < mx - far || x > mx + far || !inside(Q, x, y)) continue;
            if (left[j * nx + i]) g++;
            else if (!mask[j * nx + i]) g -= 1.5;
          }
        }
        if (g > gain) [gain, P] = [g, Q];
        if (half < 0.75) break;
      }
    }
    out.push(P);
    // what it covers (and a little over: no slivers left along its edge)
    const wide: Piece =
      'radius' in P
        ? { ...P, radius: P.radius + 0.6 }
        : {
            ...P,
            halfLength: P.halfLength + 0.6,
            halfWidth: P.halfWidth + 0.6,
            round: P.round! + 0.6,
          };
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++)
        if (left[j * nx + i] && inside(wide, G.x0 + i * STEP, G.y0 + j * STEP))
          left[j * nx + i] = 0;
  }
  return out;
}

/** Close the gaps in a mask that are narrower than `GAP`: grown by half of it, then shrunk back. */
function close(G: Grid, mask: Uint8Array): void {
  const { nx, ny } = G;
  const n = Math.round(GAP / 2 / STEP);
  const pass = (src: Uint8Array, grow: boolean): Uint8Array => {
    const out = new Uint8Array(src.length);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        let hit = !grow;
        for (let dj = -n; dj <= n && hit !== grow; dj++)
          for (let di = -n; di <= n && hit !== grow; di++) {
            if (di * di + dj * dj > n * n) continue;
            const x = i + di;
            const y = j + dj;
            const on = x >= 0 && y >= 0 && x < nx && y < ny && src[y * nx + x] === 1;
            if (on === grow) hit = grow;
          }
        out[j * nx + i] = hit ? 1 : 0;
      }
    return out;
  };
  const closed = pass(pass(mask, true), false);
  for (let k = 0; k < mask.length; k++) if (closed[k]) mask[k] = 1;
}

/** Fill the holes in a mask: every cell that cannot be reached from outside it. */
function fill(G: Grid, mask: Uint8Array): void {
  const { nx, ny } = G;
  const seen = new Uint8Array(nx * ny);
  const todo: number[] = [];
  const visit = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= nx || j >= ny) return;
    const k = j * nx + i;
    if (seen[k] || mask[k]) return;
    seen[k] = 1;
    todo.push(k);
  };
  for (let i = 0; i < nx; i++) {
    visit(i, 0);
    visit(i, ny - 1);
  }
  for (let j = 0; j < ny; j++) {
    visit(0, j);
    visit(nx - 1, j);
  }
  while (todo.length) {
    const k = todo.pop()!;
    const i = k % nx;
    const j = Math.floor(k / nx);
    visit(i + 1, j);
    visit(i - 1, j);
    visit(i, j + 1);
    visit(i, j - 1);
  }
  for (let k = 0; k < mask.length; k++) if (!seen[k]) mask[k] = 1;
}

/** The pieces that follow one band's outline. */
function fit(G: Grid, mask: Uint8Array, def: PropManifest, most: number, rough: boolean): Piece[] {
  // the shape it has already, if that is it
  const H = def.hit;
  const had: Piece | null =
    H && 'parts' in H
      ? null
      : !H || 'radius' in H
        ? { x: 0, y: 0, radius: H ? H.radius : def.radius }
        : {
            x: 0,
            y: 0,
            halfLength: H.halfLength,
            halfWidth: H.halfWidth,
            ...(H.round === undefined ? {} : { round: H.round }),
          };
  if (had && miss(G, mask, [had]) < NEAR && stick(G, mask, [had]) < OUT) return [had];
  // a box about it, or a circle
  let x0 = 1e9;
  let x1 = -1e9;
  let y0 = 1e9;
  let y1 = -1e9;
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let j = 0; j < G.ny; j++)
    for (let i = 0; i < G.nx; i++) {
      if (!mask[j * G.nx + i]) continue;
      const x = G.x0 + i * STEP;
      const y = G.y0 + j * STEP;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      n++;
      sx += x;
      sy += y;
    }
  const tries: Piece[][] = [
    [{ x: r1(sx / n), y: r1(sy / n), radius: r1(Math.sqrt((n * STEP * STEP) / Math.PI)) }],
    ...[0.5, 1, 2].map((round) => [
      {
        x: r1((x0 + x1) / 2),
        y: r1((y0 + y1) / 2),
        halfLength: r1((x1 - x0 + STEP) / 2),
        halfWidth: r1((y1 - y0 + STEP) / 2),
        round,
      },
    ]),
  ];
  // the nearest of them that leaves nothing standing out of it; one piece, when one is near enough
  const score = (P: Piece[]) =>
    miss(G, mask, P) + (stick(G, mask, P) < (rough ? OUT * 1.5 : OUT) ? 0 : 10);
  let best = tries[0]!;
  let bm = 1e9;
  for (const P of tries) {
    const m = score(P);
    if (m < bm) [bm, best] = [m, P];
  }
  if (bm < NEAR * 0.8) return best;
  const C = capsules(G, mask, most);
  // (a speck too small to be worth a capsule still gets a dot: the tip of a twig)
  const spot = { hit: { parts: C }, radius: 1 } as unknown as PropManifest;
  const T = newTouch();
  for (let n = 0; C.length && n < 4; n++) {
    let far = OUT;
    let at: Piece | null = null;
    for (let j = 0; j < G.ny; j++)
      for (let i = 0; i < G.nx; i++) {
        if (!mask[j * G.nx + i]) continue;
        const x = G.x0 + i * STEP;
        const y = G.y0 + j * STEP;
        const d = propPoint(spot, 0, 0, 0, x, y, T, 0, Infinity);
        if (d > far) [far, at] = [d, { x: r1(x), y: r1(y), radius: 0.5 }];
      }
    if (!at) break;
    C.push(at);
  }
  return C.length && score(C) < bm ? C : best;
}

/** The hit shape for one prop, baked from its look: null when it is to be left as it is. */
function bake(def: PropManifest, look: PropLook): PropManifest['hit'] | null {
  const p = look.part;
  const G: Grid = {
    nx: Math.ceil(p.w / STEP),
    ny: Math.ceil(p.h / STEP),
    x0: -p.w / 2 + STEP / 2,
    y0: -p.h / 2 + STEP / 2,
  };
  // a crown of leaves is no part of it: only the trunk under it stops anything
  const trunk = def.crown ? def.crown.trunk + 0.75 : Infinity;
  const layers: Uint8Array[] = [];
  for (let z = 0; z < p.layers; z++) {
    const M = new Uint8Array(G.nx * G.ny);
    for (let j = 0; j < G.ny; j++)
      for (let i = 0; i < G.nx; i++) {
        const x = G.x0 + i * STEP;
        const y = G.y0 + j * STEP;
        if (Math.hypot(x, y) > trunk) continue;
        if (p.fn(x, y, p.smooth ? z + 0.5 : z)) M[j * G.nx + i] = 1;
      }
    layers.push(M);
  }
  const count = (M: Uint8Array) => M.reduce((a, b) => a + b, 0);
  const alike = (A: Uint8Array, B: Uint8Array) => {
    let both = 0;
    let any = 0;
    for (let k = 0; k < A.length; k++) {
      if (A[k] && B[k]) both++;
      if (A[k] || B[k]) any++;
    }
    return any ? both / any : 0;
  };
  // a hitbox a slice, stacked as the slices are. Gaps too narrow for anything to get into are no
  // gaps (a row of heads, the slats of a fence), and a ring is hit as a disc
  for (const M of layers) {
    if (count(M) < 2) continue;
    close(G, M);
    fill(G, M);
  }
  // (a thing with nothing at its foot is held up by what is built under it, a roof on its walls:
  // it stays the block it was, down to the ground)
  if (count(layers[0]!) < 2) return null;
  // slices one over another whose outline is the same share one hitbox, as tall as all of them
  /** No part of A further than `EDGE_OFF` from B: a hitbox for both stands out of neither. */
  const within = (A: Uint8Array, B: Uint8Array) => {
    const r = Math.round(EDGE_OFF / STEP);
    for (let j = 0; j < G.ny; j++)
      for (let i = 0; i < G.nx; i++) {
        if (!A[j * G.nx + i] || B[j * G.nx + i]) continue;
        let by = false;
        for (let v = Math.max(0, j - r); !by && v <= Math.min(G.ny - 1, j + r); v++)
          for (let u = Math.max(0, i - r); u <= Math.min(G.nx - 1, i + r); u++)
            if (B[v * G.nx + u] && Math.hypot(u - i, v - j) <= r) {
              by = true;
              break;
            }
        if (!by) return false;
      }
    return true;
  };
  type Band = { from: number; to: number; first: Uint8Array; mask: Uint8Array; fit?: Piece[] };
  const bands: Band[] = [];
  let cur: Band | null = null;
  for (let z = 0; z < layers.length; z++) {
    const M = layers[z]!;
    if (count(M) < 2) {
      cur = null;
      continue;
    }
    if (
      cur &&
      alike(M, cur.mask) >= SAME &&
      alike(M, cur.first) >= SAME - 0.15 &&
      within(cur.mask, M)
    ) {
      cur.to = z + 1;
      for (let k = 0; k < M.length; k++) if (M[k]) cur.mask[k] = 1;
    } else bands.push((cur = { from: z, to: z + 1, first: M, mask: Uint8Array.from(M) }));
  }
  const join = (k: number) => {
    const A = bands[k]!;
    const B = bands[k + 1]!;
    for (let i = 0; i < A.mask.length; i++) if (B.mask[i]) A.mask[i] = 1;
    A.to = B.to;
    delete A.fit;
    bands.splice(k + 1, 1);
  };
  for (let k = bands.length - 2; k >= 0; k--) {
    const A = bands[k]!;
    const B = bands[k + 1]!;
    if (A.to !== B.from || A.to > LOW || B.from >= ROOF) continue;
    // (what stands no higher than a wheel under something wider is taken as that: the posts
    // under a rail, the wheels under a wreck. A car meets the wider thing whatever is under it)
    let under = 0;
    let both = 0;
    for (let i = 0; i < A.mask.length; i++)
      if (A.mask[i]) {
        under++;
        if (B.mask[i]) both++;
      }
    if (both >= under * 0.85) join(k);
  }
  // a thing may be only so many pieces. One with more has the two hitboxes most alike made one,
  // and again, those up over the roofs first: little meets it there
  let parts: Piece[];
  for (;;) {
    parts = [];
    for (const B of bands) {
      // (up over the roofs only what is in the air meets it: a few pieces do)
      const high = B.from >= ROOF;
      B.fit ??= fit(G, B.mask, def, high ? 4 : 8, high);
      for (const P of B.fit) parts.push({ ...P, z: [B.from, B.to] });
    }
    if (parts.length <= PIECES) break;
    let at = -1;
    let most = -1;
    for (let k = 0; k + 1 < bands.length; k++) {
      const A = bands[k]!;
      const B = bands[k + 1]!;
      if (A.to !== B.from) continue;
      const like = alike(A.mask, B.mask) + (A.from >= ROOF ? 1 : 0);
      if (like > most) {
        most = like;
        at = k;
      }
    }
    if (at < 0) break;
    join(at);
  }
  expect(parts.length, def.id).toBeLessThanOrEqual(PIECES);
  // the same piece in the band above too: one piece, as tall as both
  const same = (P: Piece, Q: Piece) =>
    JSON.stringify({ ...P, z: 0 }) === JSON.stringify({ ...Q, z: 0 });
  for (let i = 0; i < parts.length; i++)
    for (let j = parts.length - 1; j > i; j--)
      if (same(parts[i]!, parts[j]!) && parts[j]!.z![0] === parts[i]!.z![1]) {
        parts[i]!.z![1] = parts[j]!.z![1];
        parts.splice(j, 1);
        j = parts.length;
      }
  // one shape all the way up from the ground: the plain kind, with its height
  const first = parts[0]!;
  const one =
    parts.every((P) => JSON.stringify({ ...P, z: 0 }) === JSON.stringify({ ...first, z: 0 })) &&
    first.x === 0 &&
    first.y === 0 &&
    !('rot' in first && first.rot) &&
    parts.length === 1 &&
    first.z![0] === 0;
  if (one) {
    const top = first.z![1];
    return 'radius' in first
      ? { radius: first.radius, top }
      : {
          halfLength: first.halfLength,
          halfWidth: first.halfWidth,
          ...(first.round === undefined ? {} : { round: first.round }),
          top,
        };
  }
  return { parts };
}

describe.runIf(on)('bake hit shapes', () => {
  it('writes them into the manifests', () => {
    const C = loadContent();
    const L = loadLooks();
    const rows: string[] = [];
    for (const [id, def] of C.prop) {
      const lm = L.get(id);
      if (ONLY.length && !ONLY.includes(id.slice(5))) continue;
      if (!lm || lm.look.kind !== 'prop' || def.body !== 'static' || !def.solid) continue;
      if (def.critter || def.mound || def.pad || def.low !== undefined) continue;
      const hit = bake(def, lm.look);
      if (!hit) continue;
      const file = fileURLToPath(
        new URL(`../core/prop/${id.slice(5)}/manifest.json`, import.meta.url),
      );
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      // (a prop that takes its shape from another's manifest is given its own)
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (k === 'hit') continue;
        next[k] = v;
        if (k === 'radius') next.hit = hit;
      }
      if (!('hit' in next)) next.hit = hit;
      writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
      rows.push(
        `${id.padEnd(26)} ${'parts' in hit ? `${hit.parts.length} pieces: ${hit.parts.map((P) => `${P.z![0]}-${P.z![1]}`).join(' ')}` : `one, top ${hit.top}`}`,
      );
    }
    console.log(`\n${rows.join('\n')}\n`);
    expect(rows.length + ONLY.length).toBeGreaterThan(0);
  });

  // a car's body the same way, for what is shot at it (it bumps with its one hull)
  it("writes the cars' into theirs", () => {
    const C = loadContent();
    const L = loadLooks();
    const rows: string[] = [];
    for (const [id, def] of C.car) {
      const lm = L.get(id);
      if (ONLY.length && !ONLY.includes(id.slice(4))) continue;
      if (!lm || lm.look.kind !== 'car') continue;
      const as = {
        id,
        radius: def.body.halfLength,
        hit: { halfLength: def.body.halfLength, halfWidth: def.body.halfWidth },
      } as unknown as PropManifest;
      const hit = bake(as, { kind: 'prop', part: lm.look.body });
      if (!hit) continue;
      const parts = (
        'parts' in hit
          ? hit.parts
          : [{ ...hit, x: 0, y: 0, z: [0, hit.top ?? lm.look.body.layers] }]
      ) as Piece[];
      for (const P of parts) delete (P as { top?: number }).top;
      expect(parts.length, id).toBeLessThanOrEqual(32);
      const file = fileURLToPath(
        new URL(`../core/car/${id.slice(4)}/manifest.json`, import.meta.url),
      );
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      delete raw.hit;
      raw.hit = { parts };
      writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
      rows.push(
        `${id.padEnd(26)} ${parts.length} pieces: ${parts.map((P) => `${P.z![0]}-${P.z![1]}`).join(' ')}`,
      );
    }
    console.log(`\n${rows.join('\n')}\n`);
    expect(rows.length + ONLY.length).toBeGreaterThan(0);
  });
});
