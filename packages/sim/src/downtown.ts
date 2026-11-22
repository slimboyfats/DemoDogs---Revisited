import type { PropManifest, SceneryRule } from '@demodogs/shared';
import type { StaticProp } from './entities';
import { damage } from './damage';
import { TAU } from './math';
import type { Rng } from './prng';
import type { World } from './world';

/**
 * Buildings with floors: towers that lose storeys from the top as they are hit and fall over
 * when their block gives way, laying rubble where they land. Also the scenery rules that put a
 * downtown up (tower blocks, a raised road over the track, things along the kerbs). Kept apart
 * from scenery.ts and damage.ts, which only call in here.
 */

type Add = (id: string, x: number, y: number, rot: number) => StaticProp | null;
type Stand = (def: PropManifest, x: number, y: number, rot: number) => StaticProp;

/** How many floors a piece with `storeys` has left for its health. */
export function floorsLeft(s: StaticProp): number {
  const n = s.def.storeys ?? 0;
  if (!n || s.hp === undefined || s.def.integrity === undefined) return n;
  return Math.max(0, Math.min(n, Math.ceil((s.hp / s.def.integrity) * n - 1e-9)));
}

/** After a knock: a building that has lost floors says so, one event per floor. */
export function settleFloors(w: World, s: StaticProp, x: number, y: number): void {
  if (s.storeys === undefined) return;
  const left = floorsLeft(s);
  while (s.storeys > left) {
    s.storeys--;
    w.emit({ t: 'storey', prop: s.index, left: s.storeys, x, y });
  }
}

/**
 * It is coming down with floors still standing: it falls over, the way it leans or away from
 * the knock at (x, y), and lays rubble along where it lands. Cars under it are crushed.
 */
export function topple(
  w: World,
  s: StaticProp,
  x: number,
  y: number,
  stand: Stand,
  hurt = damage,
): void {
  const T = s.def.topple;
  if (!T) return;
  // a thing without floors (a span of road) falls as one
  const n = s.def.storeys ?? 1;
  const left = s.def.storeys ? (s.storeys ?? floorsLeft(s)) : 1;
  if (left <= 0) return;
  const height = T.floor * left;
  const a =
    s.lean ?? (Math.hypot(s.x - x, s.y - y) > 0.5 ? Math.atan2(s.y - y, s.x - x) : s.seed * TAU);
  const len = height * T.spread;
  w.emit({ t: 'topple', prop: s.index, left, a, len });
  s.storeys = 0;
  const rubble = w.content.prop.get(T.rubble);
  if (!rubble) return;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  // the crush: what it lands on along its length takes a blow that grows with what fell
  const crush = T.crush * (left / n);
  for (const c of w.cars) {
    if (c.wrecked) continue;
    const dx = c.x - s.x;
    const dy = c.y - s.y;
    const along = dx * cs + dy * sn;
    const across = Math.abs(-dx * sn + dy * cs);
    if (along < -4 || along > len + 4 || across > s.def.radius + 6) continue;
    hurt(w, c, crush, null, c.x, c.y);
    c.vx *= 0.5;
    c.vy *= 0.5;
  }
  for (let d = T.step * 0.6; d <= len; d += T.step) {
    const j = (w.rng.next() - 0.5) * s.def.radius;
    const px = s.x + cs * d - sn * j;
    const py = s.y + sn * d + cs * j;
    if (px < 8 || py < 8 || px > w.w - 8 || py > w.h - 8) continue;
    stand(rubble, px, py, w.rng.next() * TAU);
  }
}

/** The downtown rules. Returns false for a rule that is not one of them. */
export function buildDowntown(w: World, rng: Rng, rule: SceneryRule, add: Add): boolean {
  const T = w.track;
  const half = w.road / 2;
  switch (rule.rule) {
    case 'towers': {
      if (!T) return true;
      let group = w.statics.reduce((m, s) => Math.max(m, (s.group ?? -1) + 1), 0);
      for (let n = 0, tries = 0; n < rule.count && tries < rule.count * 30; tries++) {
        const C = rule.cols[0] + rng.int(rule.cols[1] - rule.cols[0] + 1);
        const R = rule.rows[0] + rng.int(rule.rows[1] - rule.rows[0] + 1);
        const st = rule.step;
        const i = rng.int(T.n);
        const side = rng.next() < 0.5 ? -1 : 1;
        // the road's normal on this side, pointing away from it
        const nx = -Math.sin(T.a[i]!) * side;
        const ny = Math.cos(T.a[i]!) * side;
        const tx = Math.cos(T.a[i]!);
        const ty = Math.sin(T.a[i]!);
        const off = half + rule.clear + st / 2 + rng.next() * rule.along;
        const at = (c: number, r: number): [number, number] => {
          const u = (c - (C - 1) / 2) * st;
          const v = off + r * st;
          return [T.x[i]! + nx * v + tx * u, T.y[i]! + ny * v + ty * u];
        };
        const cells: [number, number][] = [];
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) cells.push(at(c, r));
        const ok = cells.every(
          ([x, y]) =>
            x > 30 &&
            y > 30 &&
            x < w.w - 30 &&
            y < w.h - 30 &&
            (!w.grid || w.grid.at(x, y) >= half + rule.clear) &&
            w.free(x, y, st / 2 + 2) &&
            !w.cars.some((k) => Math.hypot(k.x - x, k.y - y) < 40),
        );
        if (!ok) continue;
        // it falls the way it faces: across the road
        // its front (+x) faces the road
        const lean = Math.atan2(-ny, -nx);
        const kind = rule.column[rng.int(rule.column.length)]!;
        for (let r = 0; r < R; r++)
          for (let c = 0; c < C; c++) {
            const id = r === 0 && rule.front ? rule.front : kind;
            const s = add(id, ...at(c, r), lean);
            if (!s) continue;
            s.group = group;
            // the street floor holds the block up: blow out the shops and the tower above falls
            s.bears = !rule.front || r === 0;
            s.lean = lean;
          }
        group++;
        n++;
      }
      return true;
    }
    case 'overpass': {
      if (!T) return true;
      let group = w.statics.reduce((m, s) => Math.max(m, (s.group ?? -1) + 1), 0);
      for (const f of rule.at) {
        const i = Math.floor(f * T.n) % T.n;
        const a = T.a[i]!;
        const nx = -Math.sin(a);
        const ny = Math.cos(a);
        const tx = Math.cos(a);
        const ty = Math.sin(a);
        const reach = half + rule.out;
        const lanes = rule.width;
        for (let l = 0; l < lanes; l++) {
          const u = (l - (lanes - 1) / 2) * rule.step;
          const bx = T.x[i]! + tx * u;
          const by = T.y[i]! + ty * u;
          for (const sg of [-1, 1]) {
            const s = add(rule.pillar, bx + nx * reach * sg, by + ny * reach * sg, a);
            if (s) {
              s.group = group;
              s.bears = true;
            }
          }
          const k = Math.ceil((reach * 2) / rule.step);
          for (let j = 0; j <= k; j++) {
            const v = -reach + (j * reach * 2) / k;
            const s = add(rule.deck, bx + nx * v, by + ny * v, a + Math.PI / 2);
            if (s) {
              s.group = group;
              s.bears = false;
            }
          }
        }
        group++;
      }
      return true;
    }
    case 'kerb': {
      if (!T) return true;
      const total = rule.items.reduce((s, it) => s + it.weight, 0);
      for (let i = 12; i < T.n - 6; i += rule.every)
        for (const sg of [-1, 1]) {
          if (rng.next() >= rule.chance) continue;
          let r = rng.next() * total;
          const it = rule.items.find((it) => (r -= it.weight) < 0) ?? rule.items[0]!;
          const def = w.content.prop.get(it.prop)!;
          const nx = -Math.sin(T.a[i]!) * sg;
          const ny = Math.cos(T.a[i]!) * sg;
          const x = T.x[i]! + nx * (half + rule.offset + def.radius);
          const y = T.y[i]! + ny * (half + rule.offset + def.radius);
          if (w.grid && w.grid.at(x, y) < half + rule.offset + def.radius - 2) continue;
          if (!w.free(x, y, def.radius + 2)) continue;
          if (w.cars.some((k) => Math.hypot(k.x - x, k.y - y) < 30)) continue;
          add(it.prop, x, y, T.a[i]! + (sg > 0 ? 0 : Math.PI));
        }
      return true;
    }
    default:
      return false;
  }
}
