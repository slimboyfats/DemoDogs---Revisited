import type { SceneryRule } from '@demodogs/shared';
import type { StaticProp } from './entities';
import { TAU } from './math';
import type { Rng } from './prng';
import type { World } from './world';
import { stand } from './scenery';
import { nextBeam } from './spans';

/**
 * Scenery with height: a flyover the track climbs onto and passes under, and great trees whose
 * crowns hang over the road. Both are built of ordinary static pieces, some stood up off the
 * ground (`lift`), grouped so that what holds them up brings them down when it goes.
 */

type Add = (id: string, x: number, y: number, rot: number) => StaticProp | null;
type Rule<K extends SceneryRule['rule']> = Extract<SceneryRule, { rule: K }>;

/** The next free building group number. */
function nextGroup(w: World): number {
  return w.statics.reduce((m, s) => Math.max(m, (s.group ?? -1) + 1), 0);
}

/** How far (x, y) is from any part of the road outside samples [lo, hi] (wrapping). */
function roadElsewhere(w: World, x: number, y: number, lo: number, hi: number): number {
  const T = w.track!;
  let best = 1e9;
  for (let i = 0; i < T.n; i++) {
    const inside = lo <= hi ? i >= lo && i <= hi : i >= lo || i <= hi;
    if (inside) continue;
    const d = Math.hypot(T.x[i]! - x, T.y[i]! - y);
    if (d < best) best = d;
  }
  return best;
}

export function flyover(w: World, rule: Rule<'flyover'>, add: Add, surface: number): void {
  const T = w.track;
  if (!T) return;
  const N = T.n;
  const H = rule.height;
  const flat = rule.length / 2;
  const reach = Math.ceil((flat + rule.ramp) / T.step);
  const mid = Math.round(rule.at * N) % N;
  const at = (o: number) => (((mid + o) % N) + N) % N;
  const deck = (w.deckH ??= new Float32Array(N));
  const piece = (w.deckPiece ??= new Int32Array(N).fill(-1));
  for (let o = -reach; o <= reach; o++) {
    const d = Math.abs(o) * T.step;
    const t = d <= flat ? 1 : Math.max(0, 1 - (d - flat) / rule.ramp);
    deck[at(o)] = H * t * t * (3 - 2 * t);
  }
  const lo = at(-reach - 6);
  const hi = at(reach + 6);
  const half = w.road / 2;
  let group = nextGroup(w);
  // the whole flyover is one beam: its low ramps lie on the ground, the rest stands on pillars
  const beam = nextBeam(w);
  let link = 0;
  let inSpan = 0;
  // a piece of deck every other sample, each carrying the road over the two
  for (let o = -reach; o <= reach; o += 2) {
    const i = at(o);
    const h = deck[i]!;
    if (h < 0.5) continue;
    const s = add(rule.deck, T.x[i]!, T.y[i]!, T.a[i]!);
    if (!s) continue;
    s.lift = h - surface;
    piece[i] = s.index;
    piece[at(o + 1)] = s.index;
    s.beam = beam;
    s.link = link++;
    if (h < H * 0.5) s.rests = true;
    if (h < H * 0.95) continue;
    // up at full height it is part of a span, held up by a pair of pillars under its middle
    s.group = group;
    if (inSpan === Math.floor(rule.span / 2)) {
      for (const side of [-1, 1]) {
        const off = (half - 4) * side;
        const x = T.x[i]! - Math.sin(T.a[i]!) * off;
        const y = T.y[i]! + Math.cos(T.a[i]!) * off;
        // no pillar stands in the road that passes underneath
        if (roadElsewhere(w, x, y, lo, hi) < half + 10) continue;
        const p = add(rule.pillar, x, y, T.a[i]!);
        if (p) {
          p.group = group;
          p.beam = beam;
          p.holds = s.link;
        }
      }
    }
    if (++inSpan >= rule.span) {
      inSpan = 0;
      group++;
    }
  }
}

export function canopy(w: World, rng: Rng, rule: Rule<'canopy'>, add: Add): void {
  const T = w.track;
  if (!T || !w.grid) return;
  const half = w.road / 2;
  const trunkR = w.content.prop.get(rule.trunk)!.radius;
  // no crown pokes through a deck: keep the trees away from any raised road
  const raised: number[] = [];
  if (w.deckH) for (let i = 0; i < T.n; i++) if (w.deckH[i]! > 2) raised.push(i);
  let group = nextGroup(w);
  for (let n = 0, tries = 0; n < rule.count && tries < rule.count * 40; tries++) {
    const i = rng.int(T.n);
    const side = rng.next() < 0.5 ? -1 : 1;
    const nx = -Math.sin(T.a[i]!) * side;
    const ny = Math.cos(T.a[i]!) * side;
    const off = half + rule.edge + trunkR;
    const x = T.x[i]! + nx * off;
    const y = T.y[i]! + ny * off;
    if (x < 40 || y < 40 || x > w.w - 40 || y > w.h - 40) continue;
    if (w.grid.at(x, y) < half + rule.edge) continue;
    if (!w.free(x, y, rule.reach * 0.7)) continue;
    if (raised.some((k) => Math.hypot(T.x[k]! - x, T.y[k]! - y) < rule.reach + half + 12)) continue;
    // not over the cars on the grid, where a falling crown would land on them at the start
    if (w.cars.some((c) => Math.hypot(c.x - x, c.y - y) < rule.reach + 30)) continue;
    plant(w, rng, rule, add, x, y, Math.atan2(-ny, -nx), group);
    group++;
    n++;
  }
}

/** The parts of a great tree: as a `canopy` rule gives them. */
export type TreeKit = Pick<Rule<'canopy'>, 'trunk' | 'crowns' | 'clumps' | 'lift' | 'reach'>;

/**
 * Stand one great tree at (x, y) as building group `group`: the trunk holds it up, and its
 * crowns hang round it, leaning out towards `toward` (radians), the way the light is.
 */
export function plant(
  w: World,
  rng: Rng,
  kit: TreeKit,
  add: Add,
  x: number,
  y: number,
  toward: number,
  group: number,
): void {
  const trunk = add(kit.trunk, x, y, rng.next() * TAU);
  if (!trunk) return;
  trunk.group = group;
  trunk.bears = true;
  const k = kit.clumps[0] + rng.int(kit.clumps[1] - kit.clumps[0] + 1);
  for (let j = 0; j < k; j++) {
    const top = j === 0;
    const a = toward + rng.range(-1.5, 1.5);
    const d = top ? 0 : rng.range(0.3, 1) * kit.reach;
    const lift = top
      ? kit.lift[1]
      : kit.lift[0] + (kit.lift[1] - kit.lift[0]) * (1 - d / kit.reach) * rng.range(0.6, 1);
    const c = add(rng.pick(kit.crowns), x + Math.cos(a) * d, y + Math.sin(a) * d, rng.next() * TAU);
    if (!c) continue;
    c.lift = lift;
    c.group = group;
    c.bears = false;
  }
}

/** A great tree put down by hand (the test range), its crown leaning `toward`. */
export function plantTree(w: World, kit: TreeKit, x: number, y: number, toward: number): void {
  const add: Add = (id, px, py, rot) =>
    stand(w, w.content.prop.get(id)!, px, py, rot, w.rng.range(0, 10));
  plant(w, w.rng, kit, add, x, y, toward, nextGroup(w));
}
