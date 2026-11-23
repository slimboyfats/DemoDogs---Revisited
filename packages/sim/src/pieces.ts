import type { SceneryRule } from '@demodogs/shared';
import type { StaticProp } from './entities';
import { angDiff } from './math';
import type { Rng } from './prng';
import type { World } from './world';

type Add = (id: string, x: number, y: number, rot: number) => StaticProp | null;
type Along = Extract<SceneryRule, { rule: 'along' }>;
type Field = Extract<SceneryRule, { rule: 'field' }>;

/** Samples either side that a bend is measured over, and that a straight must stay straight for. */
const BEND = 6;
const RUN = 40;
/** Samples of road kept between one rule's tiles and the tiles already down. */
const TILE_GAP = 75;

/** How much the road turns round sample i: signed, radians over the window. */
function bend(w: World, i: number, span = BEND): number {
  const T = w.track!;
  return angDiff(T.a[(i + span) % T.n]!, T.a[(i - span + T.n) % T.n]!);
}

/**
 * The spots an `along` rule's `pick` finds: track samples, best first, at least `apart` of a lap
 * from each other, clear of the starting grid and of any flyover.
 */
export function pickSpots(
  w: World,
  where: 'straight' | 'bend',
  count: number,
  apart: number,
): number[] {
  const T = w.track!;
  const N = T.n;
  const score = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    if (where === 'bend') score[i] = Math.abs(bend(w, i));
    else {
      // a straight: the road ahead (where a boosted or flying car will be) hardly turns
      let worst = 0;
      for (let k = -8; k <= RUN; k += 4)
        worst = Math.max(worst, Math.abs(bend(w, (i + k + N) % N, 4)));
      score[i] = -worst;
    }
  }
  const order = Array.from({ length: N }, (_, i) => i).sort(
    (a, b) => score[b]! - score[a]! || a - b,
  );
  const gap = Math.max(1, Math.round(apart * N));
  const taken = w.grid ? w.pads.map((p) => w.grid!.nearest(p.x, p.y)).filter((k) => k >= 0) : [];
  const out: number[] = [];
  for (const i of order) {
    if (out.length >= count) break;
    // the grid stands behind the line, and the first corner comes soon after it
    if (i < Math.max(24, N * 0.06) || i > N - 70) continue;
    if (w.deckH && (w.deckH[i]! > 0 || w.deckH[(i + RUN) % N]! > 0)) continue;
    if (out.some((o) => Math.min(Math.abs(o - i), N - Math.abs(o - i)) < gap)) continue;
    if (where === 'straight') {
      // not within a few seconds' drive of a tile that already lies, and not where something
      // stands in the road just ahead
      if (taken.some((o) => Math.min(Math.abs(o - i), N - Math.abs(o - i)) < TILE_GAP)) continue;
      let clear = true;
      for (let k = -4; k <= 16 && clear; k += 3) {
        const j = (i + k + N) % N;
        clear = w.free(T.x[j]!, T.y[j]!, 12);
      }
      if (!clear) continue;
    }
    out.push(i);
  }
  return out.sort((a, b) => a - b);
}

/** The `along` rule: a set of things at chosen spots along the road. */
export function layAlong(w: World, rule: Along, add: Add): void {
  const T = w.track;
  if (!T) return;
  const N = T.n;
  const half = w.road / 2;
  const spots = rule.pick
    ? pickSpots(w, rule.pick.where, rule.pick.count, rule.pick.apart)
    : (rule.at ?? []).map((f) => Math.floor(f * N) % N);
  spots.forEach((i0, n) => {
    // at a bend, positive lanes are its outside
    let side = rule.pick?.where === 'bend' ? (bend(w, i0) > 0 ? -1 : 1) : 1;
    if (rule.mirror && n % 2) side = -side;
    for (const it of rule.items)
      for (let r = 0; r < it.n; r++) {
        const i = (i0 + Math.round((it.ahead + r * it.gap) / T.step) + N * 4) % N;
        if (w.deckH && w.deckH[i]! > 0) continue;
        const a = T.a[i]!;
        const nx = -Math.sin(a);
        const ny = Math.cos(a);
        for (let k = 0; k < it.row; k++) {
          const o = (it.lane * half + (k - (it.row - 1) / 2) * it.step) * side;
          const x = T.x[i]! + nx * o;
          const y = T.y[i]! + ny * o;
          if (x < 14 || y < 14 || x > w.w - 14 || y > w.h - 14) continue;
          const def = w.content.prop.get(it.prop)!;
          // what stands must stand on free ground; tiles and animals go where they are told
          if (def.body === 'static' && def.solid && !def.critter && !w.free(x, y, def.radius * 0.4))
            continue;
          add(it.prop, x, y, a + it.rot * side);
        }
      }
  });
}

/** The `field` rule: plots of a crop in rows beside the road. */
export function layField(w: World, rng: Rng, rule: Field, add: Add): void {
  const T = w.track;
  if (!T || !w.grid) return;
  const half = w.road / 2;
  const def = w.content.prop.get(rule.prop)!;
  for (let n = 0, tries = 0; n < rule.count && tries < rule.count * 30; tries++) {
    const i = rng.int(T.n);
    const side = rng.next() < 0.5 ? -1 : 1;
    const L = rng.range(rule.long[0], rule.long[1]);
    const Dp = rng.range(rule.deep[0], rule.deep[1]);
    const a = T.a[i]!;
    const off = half + rule.clear + Dp / 2;
    const cx = T.x[i]! - Math.sin(a) * side * off;
    const cy = T.y[i]! + Math.cos(a) * side * off;
    const reach = Math.hypot(L, Dp) / 2;
    if (cx < 24 + reach || cy < 24 + reach || cx > w.w - 24 - reach || cy > w.h - 24 - reach)
      continue;
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    const at = (u: number, v: number): [number, number] => [
      cx + u * cs - v * sn,
      cy + u * sn + v * cs,
    ];
    // no corner of it on the road (the inside of a bend comes closer than its middle)
    const corners = [
      at(-L / 2, -Dp / 2),
      at(L / 2, -Dp / 2),
      at(-L / 2, Dp / 2),
      at(L / 2, Dp / 2),
    ];
    if (corners.some(([x, y]) => w.grid!.at(x, y) < half + Math.max(6, rule.clear * 0.7))) continue;
    if (!w.free(cx, cy, reach)) continue;
    for (let u = -L / 2; u <= L / 2; u += rule.step)
      for (let v = -Dp / 2; v <= Dp / 2; v += rule.step) {
        const [x, y] = at(u + rng.range(-0.8, 0.8), v + rng.range(-0.8, 0.8));
        if (w.free(x, y, def.radius * 0.5)) add(rule.prop, x, y, rng.next() * 6.283);
      }
    n++;
  }
}
