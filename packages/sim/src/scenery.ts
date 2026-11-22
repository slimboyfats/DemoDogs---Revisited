import type { PropManifest, SceneryRule } from '@demodogs/shared';
import type { StaticProp } from './entities';
import { spill } from './damage';
import { buildDowntown } from './downtown';
import { TAU, angDiff } from './math';
import type { Rng } from './prng';
import type { World } from './world';

/**
 * Lays out a venue's scenery from its rules, using the venue's own seed so a venue always looks the
 * same. Static props go in world.statics; loose ones (cones, crates, barrels) in world.props.
 */
/** Stand a static prop in the world. */
export function stand(
  w: World,
  def: PropManifest,
  x: number,
  y: number,
  rot: number,
  seed: number,
): StaticProp {
  const s: StaticProp = {
    index: w.statics.length,
    def,
    made: def.made ? (w.content.material.get(def.made) ?? null) : null,
    x,
    y,
    rot,
    seed,
  };
  if (def.integrity !== undefined) s.hp = def.integrity;
  if (def.crown) s.leaves = 1;
  if (def.storeys) s.storeys = def.storeys;
  w.statics.push(s);
  return s;
}

type Add = (id: string, x: number, y: number, rot: number) => StaticProp | null;

export function buildScenery(w: World, rng: Rng): void {
  const prop = (id: string): PropManifest => w.content.prop.get(id)!;
  const add: Add = (id, x, y, rot) => {
    const def = prop(id);
    if (def.body === 'static') return stand(w, def, x, y, rot, rng.range(0, 10));
    else
      w.props.push({
        index: w.props.length,
        def,
        x,
        y,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rot,
        spin: 0,
        alive: true,
        fuse: 0,
        owner: -1,
      });
    return null;
  };
  const weighted = (items: { prop: string; weight: number }[]): string => {
    let r = rng.next() * items.reduce((s, i) => s + i.weight, 0);
    for (const i of items) {
      r -= i.weight;
      if (r < 0) return i.prop;
    }
    return items[items.length - 1]!.prop;
  };
  for (const rule of w.venue.scenery) apply(w, rng, rule, add, weighted, prop);
}

function apply(
  w: World,
  rng: Rng,
  rule: SceneryRule,
  add: Add,
  weighted: (items: { prop: string; weight: number }[]) => string,
  prop: (id: string) => PropManifest,
): void {
  const T = w.track;
  const half = w.road / 2;
  const O = w.oval;
  if (buildDowntown(w, rng, rule, add)) return;
  switch (rule.rule) {
    case 'bend-wall': {
      if (!T || !w.grid) return;
      for (let i = 0; i < T.n; i += 3) {
        const k = angDiff(T.a[(i + 4) % T.n]!, T.a[(i - 4 + T.n) % T.n]!);
        if (Math.abs(k) < rule.minCurve) continue;
        const side = k > 0 ? -1 : 1;
        const nx = -Math.sin(T.a[i]!) * side;
        const ny = Math.cos(T.a[i]!) * side;
        const x = T.x[i]! + nx * (half + rule.offset);
        const y = T.y[i]! + ny * (half + rule.offset);
        if (w.grid.at(x, y) < half + 12 || !w.free(x, y, 6)) continue;
        add(rule.props[(i / 3) % rule.props.length]!, x, y, 0);
      }
      return;
    }
    case 'build': {
      let group = w.statics.reduce((m, s) => Math.max(m, (s.group ?? -1) + 1), 0);
      const total = rule.kinds.reduce((s, k) => s + k.weight, 0);
      for (let n = 0, tries = 0; n < rule.count && tries < rule.count * 30; tries++) {
        let pick = rng.next() * total;
        const K = rule.kinds.find((k) => (pick -= k.weight) < 0) ?? rule.kinds[0]!;
        const L = rng.int(K.long[1] - K.long[0] + 1) + K.long[0];
        const Dp = K.shape === 'wall' ? 1 : rng.int(K.deep[1] - K.deep[0] + 1) + K.deep[0];
        const st = K.step;
        const reach = (Math.hypot(L, Dp) * st) / 2 + 6;
        let cx = 60 + rng.next() * (w.w - 120);
        let cy = 60 + rng.next() * (w.h - 120);
        let rot = rng.next() * TAU;
        if (T && rule.along !== undefined) {
          // on a street: beside the road somewhere along it, its long side to the kerb
          const i = rng.int(T.n);
          const side = rng.next() < 0.5 ? -1 : 1;
          const off = half + rule.clear + (Dp * st) / 2 + rng.next() * rule.along;
          rot = T.a[i]! + (side > 0 ? Math.PI : 0);
          cx = T.x[i]! - Math.sin(T.a[i]!) * side * off;
          cy = T.y[i]! + Math.cos(T.a[i]!) * side * off;
          if (cx < 40 + reach || cy < 40 + reach || cx > w.w - 40 - reach || cy > w.h - 40 - reach)
            continue;
        }
        const cs = Math.cos(rot);
        const sn = Math.sin(rot);
        // the ground it would stand on must be clear of the road and of everything else
        if (w.grid && w.grid.at(cx, cy) < half + rule.clear + (Dp * st) / 2) continue;
        if (O && Math.hypot((cx - O.cx) / O.rx, (cy - O.cy) / O.ry) > 1 - (reach + 20) / O.rx)
          continue;
        if (!w.free(cx, cy, reach + 6)) continue;
        if (w.cars.some((c) => Math.hypot(c.x - cx, c.y - cy) < reach + 30)) continue;
        const at = (i: number, j: number): [number, number] => {
          const lx = (i - (L - 1) / 2) * st;
          const ly = (j - (Dp - 1) / 2) * st;
          return [cx + lx * cs - ly * sn, cy + lx * sn + ly * cs];
        };
        // no corner of it may reach the road (the inside of a bend comes closer than its middle)
        const corners: [number, number][] = [
          at(0, 0),
          at(L - 1, 0),
          at(0, Dp - 1),
          at(L - 1, Dp - 1),
        ];
        if (w.grid && corners.some(([x, y]) => w.grid!.at(x, y) < half + Math.max(8, rule.clear)))
          continue;
        const piece = (id: string, i: number, j: number, r: number, bears: boolean) => {
          const s = add(id, ...at(i, j), r);
          if (s) {
            s.group = group;
            s.bears = bears;
          }
        };
        if (K.shape === 'wall') {
          for (let i = 0; i < L; i++)
            piece((i === 0 || i === L - 1) && K.post ? K.post : K.wall, i, 0, rot, true);
        } else {
          const door = 1 + rng.int(Math.max(1, L - 2));
          const wide = K.shape === 'yard' ? 2 : 1;
          for (let i = 0; i < L; i++)
            for (let j = 0; j < Dp; j++) {
              const ex = i === 0 || i === L - 1;
              const ey = j === 0 || j === Dp - 1;
              if (!ex && !ey) {
                if (K.shape === 'house' && K.roof) piece(K.roof, i, j, rot, false);
                else if (K.inside.length && rng.next() < 0.45)
                  add(rng.pick(K.inside), ...at(i, j), rng.next() * TAU);
                continue;
              }
              if (ex && ey) {
                piece(K.post ?? K.wall, i, j, rot, true);
                continue;
              }
              // the doorway, in the near long side
              if (j === 0 && i >= door && i < door + wide) continue;
              const glass = K.window && rng.next() < 0.3;
              piece(glass ? K.window! : K.wall, i, j, ey ? rot : rot + Math.PI / 2, true);
            }
        }
        group++;
        n++;
      }
      return;
    }
    case 'patches': {
      const def = w.content.material.get(rule.material)!;
      for (let n = 0, tries = 0; n < rule.count && tries < rule.count * 40; tries++) {
        const r = rng.range(rule.r[0], rule.r[1]);
        let x = 40 + rng.next() * (w.w - 80);
        let y = 40 + rng.next() * (w.h - 80);
        if (T && rule.on === 'road') {
          const i = 25 + rng.int(T.n - 50);
          const o = rng.range(-1, 1) * Math.max(0, half - r * 0.6);
          x = T.x[i]! - Math.sin(T.a[i]!) * o;
          y = T.y[i]! + Math.cos(T.a[i]!) * o;
        } else if (rule.on === 'off' && w.grid && w.grid.at(x, y) < half + r + 4) continue;
        if (O && Math.hypot((x - O.cx) / O.rx, (y - O.cy) / O.ry) > 0.9) continue;
        // not under the cars on the grid
        if (w.cars.some((c) => Math.hypot(c.x - x, c.y - y) < r + 40)) continue;
        spill(w, def, x, y, r, -1, true);
        n++;
      }
      return;
    }
    case 'barricade': {
      if (!T) return;
      // never on the starting grid: the first one stands half a gap down the road
      for (let i = Math.floor(rule.every / 2) + 20; i < T.n - 20; i += rule.every) {
        const nx = -Math.sin(T.a[i]!);
        const ny = Math.cos(T.a[i]!);
        const n = Math.max(1, Math.floor((half * 2) / rule.step));
        const open = rule.gap > 0 ? rng.int(n - rule.gap + 1) : -1;
        for (let k = 0; k < n; k++) {
          if (open >= 0 && k >= open && k < open + rule.gap) continue;
          const o = (k - (n - 1) / 2) * rule.step;
          add(rule.prop, T.x[i]! + nx * o, T.y[i]! + ny * o, T.a[i]! + Math.PI / 2);
        }
      }
      return;
    }
    case 'scatter': {
      const n = Math.round(w.w * w.h * rule.perArea);
      for (let k = 0; k < n; k++) {
        const x = 30 + rng.next() * (w.w - 60);
        const y = 30 + rng.next() * (w.h - 60);
        const id = weighted(rule.items);
        const rot = rng.next() * TAU;
        if (w.grid && w.grid.at(x, y) < half + rule.clear) continue;
        if (!w.free(x, y, prop(id).radius + 8)) continue;
        add(id, x, y, rot);
      }
      return;
    }
    case 'roadside': {
      if (!T) return;
      for (let i = 9; i < T.n; i += rule.every) {
        const side = rng.next() < 0.5 ? -1 : 1;
        const nx = -Math.sin(T.a[i]!) * side;
        const ny = Math.cos(T.a[i]!) * side;
        const kind = rng.next();
        if (kind < 0.45) {
          const x = T.x[i]! + nx * (half - 6);
          const y = T.y[i]! + ny * (half - 6);
          add(rule.pair, x, y, rng.next() * TAU);
          add(rule.pair, x + Math.cos(T.a[i]!) * 9, y + Math.sin(T.a[i]!) * 9, rng.next() * TAU);
          continue;
        }
        const x = T.x[i]! + nx * (half + 23);
        const y = T.y[i]! + ny * (half + 23);
        if (!w.free(x, y, 10)) continue;
        if (kind < 0.75) {
          add(rule.stack, x, y, rng.next() * TAU);
          add(rule.stack, x + 10, y + 3, rng.next() * TAU);
          add(rule.drum, x + 4, y - 10, 0);
        } else if (rule.tanks.length && rng.next() < 0.5) {
          add(rng.pick(rule.tanks), x, y, 0);
        } else {
          add(rule.drum, x, y, 0);
          add(rule.drum, x + 8, y + 4, 0);
        }
      }
      return;
    }
    case 'border': {
      for (let x = 6; x < w.w; x += rule.spacing) {
        add(rule.prop, x, 5, 0);
        add(rule.prop, x, w.h - 5, 0);
      }
      for (let y = 5 + rule.spacing; y < w.h - rule.spacing; y += rule.spacing) {
        add(rule.prop, 5, y, 0);
        add(rule.prop, w.w - 5, y, 0);
      }
      return;
    }
    case 'oval-wall': {
      if (!O) return;
      const per = Math.PI * (3 * (O.rx + O.ry) - Math.sqrt((3 * O.rx + O.ry) * (O.rx + 3 * O.ry)));
      const n = Math.round(per / rule.spacing);
      for (let i = 0; i < n; i++) {
        const t = (i / n) * TAU;
        add(
          rule.prop,
          O.cx + Math.cos(t) * (O.rx + 3),
          O.cy + Math.sin(t) * (O.ry + 3),
          Math.atan2(Math.cos(t) * O.ry, -Math.sin(t) * O.rx),
        );
      }
      return;
    }
    case 'ring': {
      const cx = O ? O.cx : w.w / 2;
      const cy = O ? O.cy : w.h / 2;
      for (let i = 0; i < rule.count; i++) {
        const t = (i / rule.count) * TAU;
        add(
          rule.props[i % rule.props.length]!,
          cx + Math.cos(t) * rule.rx,
          cy + Math.sin(t) * rule.ry,
          0,
        );
      }
      return;
    }
    case 'place': {
      const cx = O ? O.cx : w.w / 2;
      const cy = O ? O.cy : w.h / 2;
      for (const i of rule.items) add(i.prop, cx + i.x, cy + i.y, i.rot);
      return;
    }
    case 'oval-scatter': {
      if (!O) return;
      for (let k = 0; k < rule.count; k++) {
        const t = rng.next() * TAU;
        const q = rule.qMin + rng.next() * (rule.qMax - rule.qMin);
        const x = O.cx + Math.cos(t) * O.rx * q;
        const y = O.cy + Math.sin(t) * O.ry * q;
        const id = weighted(rule.items);
        const rot = rng.next() * TAU;
        if (rule.clear > 0 && !w.free(x, y, rule.clear)) continue;
        add(id, x, y, rot);
      }
      return;
    }
  }
}
