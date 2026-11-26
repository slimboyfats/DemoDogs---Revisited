import { DECK_SURFACE, type PropManifest, type SceneryRule } from '@demodogs/shared';
import type { StaticProp } from './entities';
import { spill } from './damage';
import { pathAt } from './pads';
import { leapGaps, leapPieces } from './leaps';
import { putProp, stand } from './stand';
import { layAlong, layField } from './pieces';
import { harbour, stacks } from './docks';
import { buildDowntown } from './downtown';
import { TAU, angDiff } from './math';
import type { Rng } from './prng';
import type { World } from './world';
import { layRiver } from './river';
import { canopy, flyover } from './heights';
import { SHOULDER, laneWide, lanesOf, liftsOf } from './relief';

export { stand };

type Add = (id: string, x: number, y: number, rot: number) => StaticProp | null;

/**
 * Lays out a venue's scenery from its rules, using the venue's own seed so a venue always looks the
 * same. Static props go in world.statics; loose ones (cones, crates, barrels) in world.props.
 */
export function buildScenery(w: World, rng: Rng): void {
  const prop = (id: string): PropManifest => w.content.prop.get(id)!;
  // (nothing a rule scatters stands on the side of raised road, or hard against it: it is a wall)
  const R = w.relief;
  const onSide = (x: number, y: number): boolean =>
    !!R?.plat &&
    Math.hypot(R.platAt(x + 8, y) - R.platAt(x - 8, y), R.platAt(x, y + 8) - R.platAt(x, y - 8)) >
      6.5;
  // (nor on an on-ramp, which must stay clear)
  const loose: Add = (id, x, y, rot) =>
    onSide(x, y) || R?.slipAt(x, y) ? null : putProp(w, prop(id), x, y, rot, rng);
  // (nor, unless it was put there by hand, on the shoulder of raised road: that is the road's room)
  const half = w.road / 2;
  // (nor on a path laid off the road, which is road; nor out in a lake of something deep)
  // (nor in the way of a car leaping the gap from a takeoff to its landing)
  const leaps = leapGaps(leapPieces(w.venue, w.content));
  const blocked = (id: string, x: number, y: number): boolean => {
    const def = prop(id);
    if (def.pad || !def.solid) return false;
    const r = def.radius + 8;
    for (const [ax, ay, bx, by, wide] of leaps) {
      const dx = bx - ax;
      const dy = by - ay;
      const u = Math.max(
        0,
        Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)),
      );
      if (Math.hypot(ax + dx * u - x, ay + dy * u - y) < wide / 2 + r) return true;
    }
    if (w.paths.length)
      for (let k = 0; k < 5; k++)
        if (
          pathAt(w, x + (k ? Math.cos(k * 1.5708) * r : 0), y + (k ? Math.sin(k * 1.5708) * r : 0))
        )
          return true;
    return w.spills.some(
      (p) =>
        p.fixed && p.r > DEEP_FROM && p.def.drag >= 1.5 && Math.hypot(p.x - x, p.y - y) < p.r - 4,
    );
  };
  const add: Add = (id, x, y, rot) =>
    (R?.plat && w.grid && R.platAt(x, y) > 0.5 && w.grid.at(x, y) > half) || blocked(id, x, y)
      ? null
      : loose(id, x, y, rot);
  const weighted = (items: { prop: string; weight: number }[]): string => {
    let r = rng.next() * items.reduce((s, i) => s + i.weight, 0);
    for (const i of items) {
      r -= i.weight;
      if (r < 0) return i.prop;
    }
    return items[items.length - 1]!.prop;
  };
  layRails(w, rng);
  for (const rule of w.venue.scenery)
    apply(w, rng, rule, rule.rule === 'place' ? loose : add, weighted, prop);
}

/** A pool laid with the map that is wider than this (px) and drags hard is a lake: nothing is stood in it. */
const DEEP_FROM = 60;

/** How high road must stand to be railed, and how far in from the platform's edge the rail runs (px). */
const RAIL_FROM = 7;
const RAIL_IN = 7;

/**
 * Rails along both edges of raised road (the venue's `track.rail`), end to end from part way up
 * one end ramp to part way down the other. Where an on-ramp comes level with the road the rail
 * opens to let it in, and runs along the lane's own outer edge instead.
 */
function layRails(w: World, rng: Rng): void {
  const T = w.track;
  const id = w.venue.track?.rail;
  const raised = w.venue.track?.raised;
  const def = id ? w.content.prop.get(id) : undefined;
  if (!T || !def || !raised?.length) return;
  const lift = liftsOf(T, raised);
  const lane = lanesOf(T, lift, w.road, w.tuning);
  const edge = w.road / 2 + SHOULDER - RAIL_IN;
  // two lines a side: the road's own edge, and the outer edge of each lane beside it
  for (const outer of [false, true])
    for (const side of [-1, 1]) {
      let lx = -1e9;
      let ly = -1e9;
      for (let i = 0; i < T.n; i++) {
        const top = lift[i]!;
        if (top < RAIL_FROM || (w.deckH && w.deckH[i]! > 0)) continue;
        const wide = laneWide(lane, i, side);
        const up = top * lane.rise[i]!;
        // the road's edge opens where the lane beside it is nearly up; the lane's is railed
        // once it is high enough to need one
        if (outer ? wide <= 0 || up < RAIL_FROM : wide > 0 && top - up < RAIL_FROM) continue;
        const out = outer ? edge + wide : edge;
        const a = T.a[i]!;
        const x = T.x[i]! - Math.sin(a) * side * out;
        const y = T.y[i]! + Math.cos(a) * side * out;
        if (Math.hypot(x - lx, y - ly) < def.radius * 1.96) continue;
        // not across the inside of a tight bend, where it would stand beside another stretch
        const near = w.grid ? w.grid.nearest(x, y) : -1;
        if (near >= 0 && Math.min((near - i + T.n) % T.n, (i - near + T.n) % T.n) > 8) continue;
        if (x < 8 || y < 8 || x > w.w - 8 || y > w.h - 8) continue;
        putProp(w, def, x, y, a, rng);
        lx = x;
        ly = y;
      }
    }
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
    case 'along':
      layAlong(w, rule, add);
      return;
    case 'field':
      layField(w, rng, rule, add);
      return;
    case 'flyover':
      flyover(w, rule, add, DECK_SURFACE);
      return;
    case 'canopy':
      canopy(w, rng, rule, add);
      return;
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
    case 'arch': {
      if (!T) return;
      // never over the starting grid
      for (let i = Math.floor(rule.every / 2) + 20; i < T.n - 20; i += rule.every)
        archAt(w, i, rule, add, prop);
      return;
    }
    case 'gantry': {
      if (!T) return;
      archAt(w, Math.round(rule.at * T.n) % T.n, rule, add, prop);
      return;
    }
    case 'trackside': {
      if (!T || !w.grid) return;
      const out = half + rule.offset;
      for (const side of [-1, 1]) {
        let i = rng.int(Math.round(rule.gap[1] / T.step) + 1);
        while (i < T.n) {
          const id = weighted(rule.items);
          const r = prop(id).radius;
          const end = Math.min(T.n, i + Math.round(rng.range(rule.run[0], rule.run[1]) / T.step));
          let lx = -1e9;
          let ly = -1e9;
          for (let j = i; j < end; j++) {
            if (w.deckH && w.deckH[j]! > 0) continue;
            const a = T.a[j]!;
            const x = T.x[j]! - Math.sin(a) * side * out;
            const y = T.y[j]! + Math.cos(a) * side * out;
            // end to end: the next piece starts where the last one stops
            if (Math.hypot(x - lx, y - ly) < r * 1.96) continue;
            if (x < 8 || y < 8 || x > w.w - 8 || y > w.h - 8) continue;
            // not across the inside of a tight bend, nor where another stretch of road runs
            if (w.grid.at(x, y) < out - 2 || !w.free(x, y, r * 0.5)) continue;
            // nor in water, tar or mud that is already there (a river and its bridge stay open)
            if (w.spills.some((p) => p.fixed && Math.hypot(p.x - x, p.y - y) < p.r + 10)) continue;
            add(id, x, y, a);
            lx = x;
            ly = y;
          }
          i = end + Math.round(rng.range(rule.gap[0], rule.gap[1]) / T.step);
        }
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
    case 'pools': {
      for (const i of rule.items)
        spill(w, w.content.material.get(i.material)!, i.x, i.y, i.r, -1, true);
      return;
    }
    case 'river':
      layRiver(w, rng, rule, add);
      return;
    case 'harbour':
      harbour(w, rng, rule, add);
      return;
    case 'stacks':
      stacks(w, rng, rule, add);
      return;
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

/** An arch or a gantry across the road at sample i: a leg either side, span pieces between. */
function archAt(
  w: World,
  i: number,
  rule: { leg: string; span: string; step: number; offset: number },
  add: Add,
  prop: (id: string) => PropManifest,
): void {
  const T = w.track!;
  const half = w.road / 2;
  const group = w.statics.reduce((m, s) => Math.max(m, (s.group ?? -1) + 1), 0);
  const a = T.a[i]!;
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  const legOff = half + rule.offset + prop(rule.leg).radius;
  const legs: [number, number][] = [-1, 1].map((sd) => [
    T.x[i]! + nx * legOff * sd,
    T.y[i]! + ny * legOff * sd,
  ]);
  // a leg must stand clear of the road everywhere, also across the inside of a bend
  if (w.grid && legs.some(([x, y]) => w.grid!.at(x, y) < legOff - 4)) return;
  if (!legs.every(([x, y]) => w.free(x, y, prop(rule.leg).radius + 2))) return;
  for (const [x, y] of legs) {
    const s = add(rule.leg, x, y, a);
    if (s) {
      s.group = group;
      s.bears = true;
    }
  }
  const n = Math.max(1, Math.round((legOff * 2) / rule.step) - 1);
  for (let k = 1; k <= n; k++) {
    const o = -legOff + (k * legOff * 2) / (n + 1);
    const s = add(rule.span, T.x[i]! + nx * o, T.y[i]! + ny * o, a + Math.PI / 2);
    if (s) {
      s.group = group;
      s.bears = false;
    }
  }
}
