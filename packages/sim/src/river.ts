import { DT, type MaterialManifest, type SceneryRule } from '@demodogs/shared';
import type { StaticProp } from './entities';
import { batter, damage, spill } from './damage';
import { TAU } from './math';
import type { Rng } from './prng';
import type { World } from './world';

type RiverRule = Extract<SceneryRule, { rule: 'river' }>;
type Add = (id: string, x: number, y: number, rot: number) => StaticProp | null;

/** Art px between samples of a river's centre line. */
const STEP = 6;

/**
 * A river, its bridges and its dam, as laid out by the `river` scenery rule, and the flood that
 * runs down it once the dam is breached. Kept beside the world rather than in it: only venues
 * with a river have one.
 */
export interface River {
  readonly rule: RiverRule;
  readonly water: MaterialManifest;
  readonly bank: MaterialManifest;
  /** The centre line, upstream first: points, the way the water flows, and half its width. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly a: Float64Array;
  readonly half: Float64Array;
  readonly n: number;
  /** Which bridge (0, 1, ...) a sample lies under, or -1 in open water. */
  readonly bridge: Int16Array;
  /** Every bridge's deck pieces; a deck piece that has come down lets the water through. */
  readonly decks: StaticProp[];
  readonly bridges: StaticProp[][];
  readonly dam: StaticProp[];
  /** The sample the dam stands at, or -1. */
  readonly damAt: number;
  /** How far the flood has run, in samples; -1 before the dam goes. */
  front: number;
  /** Samples the flood has reached and laid out. */
  laid: number;
  /** Seconds until the breach next eats into the wall beside it. */
  gnaw: number;
  /** Deck pieces already flooded. */
  readonly sunk: Set<StaticProp>;
  /** What the flood has already struck (it strikes each thing once). */
  readonly hit: Set<StaticProp>;
}

const rivers = new WeakMap<World, River[]>();

/** The rivers of a world (none for most venues). */
export function riversOf(w: World): readonly River[] {
  return rivers.get(w) ?? [];
}

/** An open Catmull-Rom curve through the points, sampled every STEP px. */
function sample(points: readonly (readonly [number, number])[]): [number[], number[]] {
  const P = [points[0]!, ...points, points[points.length - 1]!];
  const dense: [number, number][] = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1]!, P[i]!, P[i + 1]!, P[i + 2]!];
    for (let k = 0; k < 40; k++) {
      const t = k / 40;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push([...points[points.length - 1]!]);
  const xs = [dense[0]![0]];
  const ys = [dense[0]![1]];
  let carry = 0;
  for (let i = 1; i < dense.length; i++) {
    const [ax, ay] = dense[i - 1]!;
    const [bx, by] = dense[i]!;
    const seg = Math.hypot(bx - ax, by - ay);
    let pos = 0;
    while (carry + seg - pos >= STEP) {
      pos += STEP - carry;
      carry = 0;
      xs.push(ax + ((bx - ax) * pos) / seg);
      ys.push(ay + ((by - ay) * pos) / seg);
    }
    carry += seg - pos;
  }
  return [xs, ys];
}

/** Pour a pool of water (or mud) that stays: part of the map from now on. */
function pool(w: World, def: MaterialManifest, x: number, y: number, r: number, now: boolean) {
  if (!now) {
    spill(w, def, x, y, r, -1, true);
    return;
  }
  spill(w, def, x, y, r, -1);
  const s = w.spills[w.spills.length - 1];
  if (s && s.def === def && s.x === x && s.y === y) s.fixed = true;
}

/**
 * Lay out a river: clear the ground for it, fill it with water, bridge it where it crosses the
 * road and dam it. Meant to run after every other rule, so it can clear what they put in its way.
 */
export function layRiver(w: World, rng: Rng, rule: RiverRule, add: Add): void {
  const water = w.content.material.get(rule.material)!;
  const bank = w.content.material.get(rule.bank)!;
  const [xs, ys] = sample(rule.points);
  const n = xs.length;
  const X = Float64Array.from(xs);
  const Y = Float64Array.from(ys);
  const A = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const j = Math.min(n - 1, i + 1);
    const h = Math.max(0, i - 1);
    A[i] = Math.atan2(Y[j]! - Y[h]!, X[j]! - X[h]!);
  }
  const damAt = rule.dam ? Math.min(n - 1, Math.round(rule.dam.at / STEP)) : -1;
  const H = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const up = damAt >= 0 && i < damAt ? Math.min(1, ((damAt - i) * STEP) / 120) : 0;
    H[i] = (rule.width / 2) * (1 + ((rule.dam?.lake ?? 1) - 1) * up);
  }
  const roadHalf = w.road / 2;
  const toRoad = (x: number, y: number) => (w.grid ? w.grid.at(x, y) - roadHalf : 1e4);
  // where it runs under the road: one bridge for each run of samples
  const B = new Int16Array(n).fill(-1);
  let bridges = 0;
  for (let i = 0; i < n; i++) {
    if (toRoad(X[i]!, Y[i]!) >= H[i]! + 2) continue;
    B[i] = i > 0 && B[i - 1]! >= 0 ? B[i - 1]! : bridges++;
  }
  const inRiver = (x: number, y: number, pad: number): boolean => {
    for (let i = 0; i < n; i++) {
      const r = H[i]! + pad;
      if (
        Math.abs(X[i]! - x) < r &&
        Math.abs(Y[i]! - y) < r &&
        Math.hypot(X[i]! - x, Y[i]! - y) < r
      )
        return true;
    }
    return false;
  };
  const D = rule.dam;
  const onDam = (x: number, y: number, pad: number): boolean => {
    if (!D || damAt < 0) return false;
    const a = A[damAt]!;
    const dx = x - X[damAt]!;
    const dy = y - Y[damAt]!;
    const along = dx * Math.cos(a) + dy * Math.sin(a);
    const across = -dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(along) < 6 + pad && Math.abs(across) < D.span / 2 + pad;
  };

  // nothing the other rules put up may stand in the water or on the dam: whole buildings go
  const gone = new Set<number>();
  const doomed = (s: StaticProp) =>
    (s.group !== undefined && gone.has(s.group)) ||
    inRiver(s.x, s.y, s.def.radius + 3) ||
    onDam(s.x, s.y, s.def.radius + 4);
  for (const s of w.statics) if (s.group !== undefined && doomed(s)) gone.add(s.group);
  const keep = w.statics.filter((s) => !doomed(s));
  w.statics.length = 0;
  for (const s of keep) {
    s.index = w.statics.length;
    w.statics.push(s);
  }
  const loose = w.props.filter((p) => !inRiver(p.x, p.y, p.def.radius + 3));
  w.props.length = 0;
  for (const p of loose) {
    p.index = w.props.length;
    w.props.push(p);
  }
  // the world's lookup of statics notices it has fewer and starts again
  w.near(0, 0, 0);

  // the water: broad pools in open water; near the road, small ones that stop short of it
  for (let i = 0; i < n; i += 2) {
    if (B[i]! >= 0) continue;
    const h = H[i]!;
    const x = X[i]!;
    const y = Y[i]!;
    if (toRoad(x, y) > h + 6) {
      const k = Math.max(1, Math.floor(h / 16));
      if (h > 30 && (i / 2) % k !== 0) continue;
      pool(w, water, x, y, h * rng.range(0.96, 1.06), false);
      continue;
    }
    const nx = -Math.sin(A[i]!);
    const ny = Math.cos(A[i]!);
    for (let u = -h + 6; u <= h - 6 + 0.01; u += 8) {
      const px = x + nx * u;
      const py = y + ny * u;
      const r = Math.min(9, toRoad(px, py) - 1);
      if (r >= 3) pool(w, water, px, py, r, false);
    }
  }

  // the bridges: deck pieces over the road where it is over water, a rail along each edge
  const decks: StaticProp[] = [];
  const spans: StaticProp[][] = [];
  for (let b = 0; b < bridges; b++) {
    const kind = rule.bridges[b % rule.bridges.length]!;
    const span: StaticProp[] = [];
    const zone: number[] = [];
    for (let i = 0; i < n; i++) if (B[i] === b) zone.push(i);
    for (const i of zone) {
      const nx = -Math.sin(A[i]!);
      const ny = Math.cos(A[i]!);
      const h = H[i]!;
      for (let u = -h + 2; u <= h - 2 + 0.01; u += 7) {
        const px = X[i]! + nx * u;
        const py = Y[i]! + ny * u;
        if (toRoad(px, py) > 1) continue;
        const s = add(kind.deck, px, py, A[i]!);
        if (s) {
          decks.push(s);
          span.push(s);
        }
      }
    }
    const T = w.track;
    if (T) {
      for (let j = 0; j < T.n; j += 2) {
        let over = false;
        for (const i of zone)
          if (Math.hypot(T.x[j]! - X[i]!, T.y[j]! - Y[i]!) < H[i]! + 3) {
            over = true;
            break;
          }
        if (!over) continue;
        for (const side of [-1, 1]) {
          const ox = -Math.sin(T.a[j]!) * side * (roadHalf + 2);
          const oy = Math.cos(T.a[j]!) * side * (roadHalf + 2);
          const s = add(kind.rail, T.x[j]! + ox, T.y[j]! + oy, T.a[j]!);
          if (s) span.push(s);
        }
      }
    }
    spans.push(span);
  }

  // the dam: a wall right across the valley, the lake held back behind it
  const dam: StaticProp[] = [];
  if (D && damAt >= 0) {
    const a = A[damAt]!;
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const count = Math.max(2, Math.round(D.span / 8));
    for (let k = 0; k < count; k++) {
      const u = (k - (count - 1) / 2) * 8;
      const s = add(D.wall, X[damAt]! + nx * u, Y[damAt]! + ny * u, a + Math.PI / 2);
      if (s) dam.push(s);
    }
  }

  // rocks and reeds along the banks
  const E = rule.edge;
  if (E) {
    const every = Math.max(1, Math.round(E.every / STEP));
    for (let i = 0; i < n; i += every)
      for (const side of [-1, 1]) {
        if (B[i]! >= 0 || (damAt >= 0 && Math.abs(i - damAt) < 3)) continue;
        const off = H[i]! + rng.range(4, 12);
        const x = X[i]! - Math.sin(A[i]!) * side * off;
        const y = Y[i]! + Math.cos(A[i]!) * side * off;
        const id = weighted(rng, E.items);
        const r = w.content.prop.get(id)!.radius;
        if (toRoad(x, y) < r + 6 || !w.free(x, y, r + 2) || onDam(x, y, r + 2)) continue;
        add(id, x, y, rng.next() * TAU);
      }
  }

  const list = rivers.get(w) ?? [];
  list.push({
    rule,
    water,
    bank,
    x: X,
    y: Y,
    a: A,
    half: H,
    n,
    bridge: B,
    decks,
    bridges: spans,
    dam,
    damAt,
    front: -1,
    laid: -1,
    gnaw: 0,
    sunk: new Set(),
    hit: new Set(),
  });
  rivers.set(w, list);
}

function weighted(rng: Rng, items: { prop: string; weight: number }[]): string {
  let r = rng.next() * items.reduce((s, i) => s + i.weight, 0);
  for (const i of items) if ((r -= i.weight) < 0) return i.prop;
  return items[items.length - 1]!.prop;
}

/** Has the dam been breached (and the flood let loose)? */
export function breached(R: River): boolean {
  return R.front >= 0;
}

/**
 * One tick of every river: water fills the holes in a broken bridge, a breach in the dam lets the
 * flood go, and the flood runs on down the river.
 */
export function updateRivers(w: World): void {
  const list = rivers.get(w);
  if (!list) return;
  for (const R of list) {
    for (const s of R.decks) {
      if (!s.down || R.sunk.has(s)) continue;
      R.sunk.add(s);
      pool(w, R.water, s.x, s.y, 6, true);
    }
    if (R.damAt < 0) continue;
    if (R.front < 0) {
      if (!R.dam.some((s) => s.down)) continue;
      R.front = R.damAt;
      const i = R.damAt;
      w.emit({ t: 'crash', x: R.x[i]!, y: R.y[i]!, impact: 240, player: false });
    }
    breach(w, R);
    flood(w, R);
  }
}

/** The water through a breach eats at the wall either side of it. */
function breach(w: World, R: River): void {
  R.gnaw -= DT;
  if (R.gnaw > 0) return;
  R.gnaw = 0.6;
  const D = R.dam;
  for (let k = 0; k < D.length; k++) {
    const s = D[k]!;
    if (s.down) continue;
    const by = (D[k - 1]?.down ? 1 : 0) + (D[k + 1]?.down ? 1 : 0);
    if (by) batter(w, s, 34 * by, 'impact', s.x, s.y);
  }
}

/** The flood runs on down the river: wider water, mud on the banks, and it shoves what it meets. */
function flood(w: World, R: River): void {
  if (R.front >= R.n - 1) return;
  const F = R.rule.flood;
  R.front = Math.min(R.n - 1, R.front + (F.speed * DT) / STEP);
  const head = Math.floor(R.front);
  const fh = F.width / 2;
  for (let i = R.laid + 1; i <= head; i++) {
    R.laid = i;
    if (i < R.damAt) continue;
    const x = R.x[i]!;
    const y = R.y[i]!;
    const nx = -Math.sin(R.a[i]!);
    const ny = Math.cos(R.a[i]!);
    // the wall of water batters everything standing in it: bridges, trees, sheds
    for (const s of w.near(x, y, fh)) {
      if (s.down || s.hp === undefined || R.hit.has(s) || R.dam.includes(s)) continue;
      if (Math.hypot(s.x - x, s.y - y) > fh + s.def.radius) continue;
      R.hit.add(s);
      batter(w, s, R.rule.flood.force, 'impact', s.x, s.y);
    }
    if (i % 2 !== 0) continue;
    if (i % 6 === 0) w.emit({ t: 'quench', x, y, r: fh * 0.6 });
    if (R.bridge[i]! >= 0) continue;
    // beyond the river's own banks: water out to the flood's width, then a ragged fringe of mud
    const h = R.half[i]!;
    const toRoad = (px: number, py: number) => (w.grid ? w.grid.at(px, py) - w.road / 2 : 1e4);
    for (const side of [-1, 1]) {
      for (let u = h - 2; u < fh; u += 9) {
        const px = x + nx * side * u;
        const py = y + ny * side * u;
        const r = Math.min(9, toRoad(px, py) - 1);
        if (r >= 3) pool(w, R.water, px, py, r, true);
      }
      if (i % 4 !== 0) continue;
      const m = fh + w.rng.range(2, 9);
      const mx = x + nx * side * m;
      const my = y + ny * side * m;
      const mr = Math.min(w.rng.range(7, 12), toRoad(mx, my) + 4);
      if (mr >= 3) pool(w, R.bank, mx, my, mr, true);
    }
  }
  // the front shoves cars and loose props down the river, and knocks them about
  const fx = R.x[head]!;
  const fy = R.y[head]!;
  const a = R.a[head]!;
  for (const c of w.cars) {
    if (c.z > 6 || Math.hypot(c.x - fx, c.y - fy) > fh + 8) continue;
    c.vx += Math.cos(a) * 420 * DT;
    c.vy += Math.sin(a) * 420 * DT;
    c.spin += w.rng.range(-3, 3) * DT * 4;
    if (w.tick % 15 === 0) damage(w, c, 4, null, c.x, c.y);
  }
  for (const p of w.props) {
    if (!p.alive || Math.hypot(p.x - fx, p.y - fy) > fh + 8) continue;
    p.vx += Math.cos(a) * 500 * DT;
    p.vy += Math.sin(a) * 500 * DT;
  }
}
