import type { PropManifest, SceneryRule } from '@demodogs/shared';
import { TAU, angDiff } from './math';
import type { Rng } from './prng';
import type { World } from './world';

/**
 * Lays out a venue's scenery from its rules, using the venue's own seed so a venue always looks the
 * same. Static props go in world.statics; loose ones (cones, crates, barrels) in world.props.
 */
export function buildScenery(w: World, rng: Rng): void {
  const prop = (id: string): PropManifest => w.content.prop.get(id)!;
  const add = (id: string, x: number, y: number, rot: number) => {
    const def = prop(id);
    if (def.body === 'static') w.statics.push({ def, x, y, rot, seed: rng.range(0, 10) });
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
  add: (id: string, x: number, y: number, rot: number) => void,
  weighted: (items: { prop: string; weight: number }[]) => string,
  prop: (id: string) => PropManifest,
): void {
  const T = w.track;
  const half = w.road / 2;
  const O = w.oval;
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
