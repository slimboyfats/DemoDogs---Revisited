import {
  CLIFF,
  MINE_TRIGGER,
  PICKUP_REACH,
  ROCKET_REACH,
  carShape,
  cloudReach,
  groundAt,
  gunSight,
  moundHeight,
  muzzle,
  newShape,
  propShape,
  type Car,
  type Shape,
  type StaticProp,
  type World,
} from '@demodogs/sim';
import type { Art } from './art';
import { BODY_UP, lampsOf } from './lamps';
import type { Projector } from './overlay';
import { tall } from './stack';

/**
 * The hitbox view: every shape the rules use, drawn over the world where the rules have it. Hulls,
 * scenery, loose props, crates, mines, rounds in the air, pools, pits, the road's edges and rails,
 * the edge of the map; and with HEIGHTS on, how high everything stands: the ground's own height,
 * faces a car cannot climb, decks, things in the air on a pin from the ground under them, and
 * where each car's lamps and gun are.
 *
 * It reads the same functions the rules do (sim/shapes.ts), so what it shows is what is hit.
 * Looks only, for the test range and `?hitboxes`: it changes nothing.
 */
export type HitboxMode = 'off' | 'boxes' | 'heights';
export const HITBOX_MODES: readonly HitboxMode[] = ['off', 'boxes', 'heights'];

const TAU = Math.PI * 2;
const COL = {
  car: '#ffe14a',
  solid: '#ff3b3b',
  low: '#ff9a2e',
  soft: '#5dff7a',
  ghost: 'rgba(255,255,255,0.45)',
  loose: '#ffb347',
  pad: '#35e0ff',
  mound: '#ff6bff',
  pick: '#35e0ff',
  mine: '#ff3b3b',
  pool: '#6aa8ff',
  pit: '#c9a074',
  fire: '#ff8a30',
  road: 'rgba(255,255,255,0.75)',
  deck: '#8fb4ff',
  edge: '#ff3b3b',
  high: '#b48cff',
  lamp: '#fff3b0',
  gun: '#ff7a7a',
  text: '#ffffff',
} as const;

const S = newShape();

export class HitboxView {
  mode: HitboxMode = 'off';

  /** Step to the next mode; the new one. */
  next(): HitboxMode {
    this.mode = HITBOX_MODES[(HITBOX_MODES.indexOf(this.mode) + 1) % HITBOX_MODES.length]!;
    return this.mode;
  }

  get label(): string {
    return this.mode === 'off'
      ? 'HITBOXES'
      : this.mode === 'boxes'
        ? 'HITBOXES ON'
        : 'HITBOXES + HEIGHTS';
  }

  private ctx!: CanvasRenderingContext2D;
  private art!: Art;
  private P!: Projector;
  private dpr = 1;
  private W = 0;
  private H = 0;

  draw(
    ctx: CanvasRenderingContext2D,
    P: Projector,
    art: Art,
    w: World,
    W: number,
    H: number,
    dpr: number,
  ): void {
    if (this.mode === 'off') return;
    this.art = art;
    this.ctx = ctx;
    this.P = P;
    this.dpr = dpr;
    this.W = W;
    this.H = H;
    const heights = this.mode === 'heights';
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (heights) this.land(w);
    this.bounds(w);
    this.road(w, heights);
    this.ground(w);
    this.statics(w, heights);
    this.loose(w, heights);
    this.arms(w);
    for (const c of w.cars) this.car(w, c, heights);
    this.legend(heights);
    ctx.restore();
  }

  // ------------------------------------------------------------------ drawing in the world

  /** A ground point's place on the screen, `z` over the ground there. */
  private at(x: number, y: number, z = 0): [number, number] {
    return [this.P.sx(x), this.P.sy(y, z + this.P.rise(x, y))];
  }

  private seen(x: number, y: number, r: number): boolean {
    const [sx, sy] = this.at(x, y);
    const m = r * (this.P.sx(1) - this.P.sx(0)) + 40 * this.dpr;
    return sx > -m && sx < this.W + m && sy > -m && sy < this.H + m;
  }

  private stroke(col: string, wide = 1.5, dash?: number[]): void {
    const ctx = this.ctx;
    ctx.setLineDash(dash ? dash.map((d) => d * this.dpr) : []);
    // a dark line under the coloured one, so it reads on grass and tarmac alike
    ctx.lineWidth = (wide + 1.6) * this.dpr;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.stroke();
    ctx.lineWidth = wide * this.dpr;
    ctx.strokeStyle = col;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** The outline of shape Q, `z` over the ground, as a path. */
  private outline(Q: Shape, z: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    // round each of its four corners (a circle is all corner)
    const n = Q.r > 6 ? 10 : 6;
    let first = true;
    for (let k = 0; k < 4; k++) {
      const u = k === 0 || k === 3 ? Q.a : -Q.a;
      const v = k < 2 ? Q.b : -Q.b;
      const from = (k * Math.PI) / 2;
      for (let i = 0; i <= n; i++) {
        const t = from + (i / n) * (Math.PI / 2);
        const lx = u + Math.cos(t) * Q.r;
        const ly = v + Math.sin(t) * Q.r;
        const [sx, sy] = this.at(Q.x + lx * Q.cs - ly * Q.sn, Q.y + lx * Q.sn + ly * Q.cs, z);
        if (first) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
        first = false;
      }
    }
    ctx.closePath();
  }

  /**
   * Shape Q as a thing with height: its outline on the ground, the same again `high` up, and
   * an upright at each corner between the two.
   */
  private block(Q: Shape, z: number, high: number, col: string, wide: number): void {
    this.outline(Q, z);
    this.stroke(col, wide);
    if (high < 1) return;
    this.outline(Q, z + high);
    this.stroke(col, wide * 0.6);
    const ctx = this.ctx;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      // (a circle gets its four uprights at the quarters)
      const round = Q.a === 0 && Q.b === 0;
      const t = (k * Math.PI) / 2;
      const lx = round ? Math.cos(t) * Q.r : (k & 1 ? -1 : 1) * (Q.a + Q.r * 0.7);
      const ly = round ? Math.sin(t) * Q.r : (k & 2 ? -1 : 1) * (Q.b + Q.r * 0.7);
      const x = Q.x + lx * Q.cs - ly * Q.sn;
      const y = Q.y + lx * Q.sn + ly * Q.cs;
      const a = this.at(x, y, z);
      const b = this.at(x, y, z + high);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    this.stroke(col, wide * 0.5);
  }

  private ring(x: number, y: number, r: number, z = 0): void {
    S.x = x;
    S.y = y;
    S.cs = 1;
    S.sn = 0;
    S.a = S.b = 0;
    S.r = r;
    this.outline(S, z);
  }

  /** A box `long` by `wide` at (x, y) turned `rot`, as a path. */
  private slab(x: number, y: number, rot: number, long: number, wide: number, z = 0): void {
    S.x = x;
    S.y = y;
    S.cs = Math.cos(rot);
    S.sn = Math.sin(rot);
    S.a = long / 2;
    S.b = wide / 2;
    S.r = 0;
    this.outline(S, z);
  }

  private line(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const ctx = this.ctx;
    const a = this.at(x0, y0, z0);
    const b = this.at(x1, y1, z1);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }

  private text(s: string, x: number, y: number, z: number, col: string = COL.text, px = 8): void {
    const ctx = this.ctx;
    const [sx, sy] = this.at(x, y, z);
    ctx.font = `700 ${Math.round(px * this.dpr)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 2.5 * this.dpr;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(s, sx, sy);
    ctx.fillStyle = col;
    ctx.fillText(s, sx, sy);
  }

  /** Something up in the air: a pin from the ground under it to where it is. */
  private pin(x: number, y: number, z: number, col: string): void {
    if (z < 0.5) return;
    this.line(x, y, 0, x, y, z);
    this.stroke(col, 1, [2, 2]);
  }

  // ------------------------------------------------------------------ what is drawn

  /** The lie of the land: its height in numbers, and the faces a car on the ground cannot climb. */
  private land(w: World): void {
    const L = w.relief;
    if (!L && !w.mounds.length) return;
    const ctx = this.ctx;
    const scale = this.P.sx(1) - this.P.sx(0);
    // the part of the map on the screen (the ground is lifted up the screen, so look a way below)
    const x0 = Math.max(0, Math.floor(-this.P.sx(0) / scale / 8) * 8);
    const x1 = Math.min(w.w, x0 + this.W / scale + 16);
    const yk = this.P.sy(1) - this.P.sy(0);
    const y0 = Math.max(0, Math.floor(-this.P.sy(0) / yk / 8) * 8);
    const y1 = Math.min(w.h, y0 + this.H / yk + (L?.max ?? 0) + 24);
    if (L) {
      // faces: a short red tick across every steep place, pointing down the face
      ctx.beginPath();
      for (let y = y0; y <= y1; y += 4)
        for (let x = x0; x <= x1; x += 4) {
          const [ex, ey] = L.edge(x, y);
          const steep = Math.hypot(ex, ey);
          if (steep <= CLIFF) continue;
          const a = this.at(x, y);
          const b = this.at(x - (ex / steep) * 2.5, y - (ey / steep) * 2.5);
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
        }
      ctx.lineWidth = 1.2 * this.dpr;
      ctx.strokeStyle = 'rgba(255,70,70,0.85)';
      ctx.stroke();
    }
    // heights, a number every few px wherever the ground is not at nothing
    const step = scale * 32 < 70 * this.dpr ? 64 : 32;
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step)
      for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
        const h = groundAt(w, x, y);
        if (Math.abs(h) < 0.5) continue;
        this.text(h.toFixed(0), x, y, 0, 'rgba(255,255,255,0.8)', 7);
      }
  }

  /** The edge of the map: the wall no car goes through. */
  private bounds(w: World): void {
    const ctx = this.ctx;
    const O = w.oval;
    ctx.beginPath();
    if (O) {
      for (let i = 0; i <= 96; i++) {
        const t = (i / 96) * TAU;
        const [sx, sy] = this.at(O.cx + Math.cos(t) * O.rx, O.cy + Math.sin(t) * O.ry);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
    } else {
      const pts: [number, number][] = [
        [10, 10],
        [w.w - 10, 10],
        [w.w - 10, w.h - 10],
        [10, w.h - 10],
      ];
      pts.forEach(([x, y], i) => {
        // (walked in short steps: the ground under the line may rise and fall)
        const [nx, ny] = pts[(i + 1) % 4]!;
        const n = Math.ceil(Math.hypot(nx - x, ny - y) / 16);
        for (let k = 0; k <= n; k++) {
          const [sx, sy] = this.at(x + ((nx - x) * k) / n, y + ((ny - y) * k) / n);
          if (i === 0 && k === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
      });
    }
    this.stroke(COL.edge, 2);
  }

  /** The road: its middle, its edges, and up on a deck its height and its rails. */
  private road(w: World, heights: boolean): void {
    const T = w.track;
    if (!T) return;
    const ctx = this.ctx;
    const half = w.road / 2;
    for (const side of [-1, 0, 1]) {
      ctx.beginPath();
      let pen = false;
      for (let k = 0; k <= T.n; k++) {
        const i = k % T.n;
        const x = T.x[i]! - Math.sin(T.a[i]!) * side * half;
        const y = T.y[i]! + Math.cos(T.a[i]!) * side * half;
        if (!this.seen(x, y, 40)) {
          pen = false;
          continue;
        }
        const [sx, sy] = this.at(x, y, w.deckAt(i));
        if (pen) ctx.lineTo(sx, sy);
        else ctx.moveTo(sx, sy);
        pen = true;
      }
      this.stroke(COL.road, side ? 1.2 : 0.8, side ? undefined : [1, 5]);
    }
    if (!w.deckH) return;
    // decks: the rails that keep a car on, and how high it rides
    for (const side of [-1, 1]) {
      ctx.beginPath();
      let pen = false;
      for (let k = 0; k <= T.n; k++) {
        const i = k % T.n;
        const h = w.deckAt(i);
        const x = T.x[i]! - Math.sin(T.a[i]!) * side * half;
        const y = T.y[i]! + Math.cos(T.a[i]!) * side * half;
        if (h <= 4 || w.deckOpen?.[i] || !this.seen(x, y, 40)) {
          pen = false;
          continue;
        }
        const [sx, sy] = this.at(x, y, h);
        if (pen) ctx.lineTo(sx, sy);
        else ctx.moveTo(sx, sy);
        pen = true;
      }
      this.stroke(COL.deck, 2.4);
    }
    if (heights)
      for (let i = 0; i < T.n; i += 6) {
        const h = w.deckAt(i);
        if (h > 0 && this.seen(T.x[i]!, T.y[i]!, 10))
          this.text(h.toFixed(0), T.x[i]!, T.y[i]!, h, COL.deck, 7);
      }
  }

  /** What lies on the ground: pools, pits, fires, smoke, tacks. */
  private ground(w: World): void {
    for (const s of w.spills)
      if (this.seen(s.x, s.y, s.r)) {
        this.ring(s.x, s.y, s.r);
        this.stroke(COL.pool, 1, [3, 3]);
      }
    for (const c of w.craters)
      if (this.seen(c.x, c.y, c.r)) {
        this.ring(c.x, c.y, c.r);
        this.stroke(COL.pit, 1, [3, 3]);
      }
    for (const b of w.blazes)
      if (this.seen(b.x, b.y, b.r)) {
        this.ring(b.x, b.y, b.r);
        this.stroke(COL.fire, 1, [3, 3]);
      }
    for (const c of w.clouds)
      if (this.seen(c.x, c.y, c.r)) {
        this.ring(c.x, c.y, cloudReach(c));
        this.stroke(COL.ghost, 1, [2, 4]);
      }
    for (const s of w.spikes)
      if (this.seen(s.x, s.y, 4)) {
        this.ring(s.x, s.y, 1);
        this.stroke(COL.mine, 1);
      }
  }

  private statics(w: World, heights: boolean): void {
    for (const s of w.statics) {
      if (s.down || !this.seen(s.x, s.y, 40)) continue;
      const D = s.def;
      const lift = s.lift ?? 0;
      if (D.pad) {
        this.slab(s.x, s.y, s.rot, D.pad.long, D.pad.wide);
        this.stroke(COL.pad, 1.4);
        continue;
      }
      if (D.mound) {
        this.mound(s, heights);
        continue;
      }
      if (!D.solid) {
        // nothing runs into it: drawn faint (what a car flattens, in green), where it stands
        if (D.trample) {
          this.ring(s.x, s.y, D.radius);
          this.stroke(COL.soft, 1);
        } else if (heights && lift > 0) {
          this.ring(s.x, s.y, 2, lift);
          this.stroke(COL.high, 1);
          this.pin(s.x, s.y, lift, COL.high);
          this.text(lift.toFixed(0), s.x, s.y, lift + 3, COL.high, 7);
        }
        continue;
      }
      // (with HEIGHTS on, as tall as it is drawn: a low wall, a tower)
      const high = heights ? Math.min(40, tall(this.art.prop(D.id))) : 0;
      this.block(
        propShape(D, s.x, s.y, s.rot, S),
        lift,
        high,
        D.low !== undefined ? COL.low : COL.solid,
        1.5,
      );
      if (heights && D.low !== undefined) this.text(`<${D.low}`, s.x, s.y, 0, COL.low, 7);
    }
  }

  /** A shape in the road: its outline, and how high it stands at its highest. */
  private mound(s: StaticProp, heights: boolean): void {
    const M = s.def.mound!;
    if (M.shape === 'bowl') {
      const ctx = this.ctx;
      ctx.beginPath();
      const cs = Math.cos(s.rot);
      const sn = Math.sin(s.rot);
      for (let i = 0; i <= 24; i++) {
        const t = (i / 24) * TAU;
        const u = (Math.cos(t) * M.long) / 2;
        const v = (Math.sin(t) * M.wide) / 2;
        const [sx, sy] = this.at(s.x + u * cs - v * sn, s.y + u * sn + v * cs);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
    } else this.slab(s.x, s.y, s.rot, M.long, M.wide);
    this.stroke(COL.mound, 1.2);
    if (!heights) return;
    // (a wedge is highest at its lip)
    const lip = M.shape === 'wedge' ? M.long / 2 - 0.5 : 0;
    const hx = s.x + Math.cos(s.rot) * lip;
    const hy = s.y + Math.sin(s.rot) * lip;
    this.text(moundHeight(s, hx, hy).toFixed(1), hx, hy, 0, COL.mound, 7);
  }

  private loose(w: World, heights: boolean): void {
    for (const p of w.props) {
      if (!p.alive || !this.seen(p.x, p.y, 20)) continue;
      this.outline(propShape(p.def, p.x, p.y, p.rot, S), p.z);
      this.stroke(COL.loose, 1.3);
      if (heights) this.pin(p.x, p.y, p.z, COL.loose);
    }
    for (const k of w.critters) {
      if (!this.seen(k.x, k.y, 20)) continue;
      this.ring(k.x, k.y, k.def.radius, k.z);
      this.stroke(k.state === 'fly' ? COL.ghost : COL.loose, 1.2);
      if (heights) this.pin(k.x, k.y, k.z, COL.loose);
    }
    for (const b of w.bots)
      if (b.alive && this.seen(b.x, b.y, 10)) {
        this.ring(b.x, b.y, 5);
        this.stroke(COL.loose, 1.2);
      }
  }

  /** Crates, mines and what is flying: how near a car has to come. */
  private arms(w: World): void {
    for (const p of w.pickups)
      if (p.on && this.seen(p.x, p.y, 10)) {
        this.ring(p.x, p.y, PICKUP_REACH, p.z);
        this.stroke(COL.pick, 1.3);
      }
    for (const m of w.mines)
      if (this.seen(m.x, m.y, 14)) {
        const armed = m.t >= (m.def.arm ?? 0.7);
        this.ring(m.x, m.y, m.def.trigger ?? MINE_TRIGGER, m.z);
        this.stroke(COL.mine, 1.3, armed ? undefined : [2, 3]);
      }
    for (const r of w.rockets)
      if (this.seen(r.x, r.y, 10)) {
        this.ring(r.x, r.y, ROCKET_REACH, r.z);
        this.stroke(COL.mine, 1.3);
      }
  }

  private car(w: World, c: Car, heights: boolean): void {
    if (c.buried || !this.seen(c.x, c.y, 30)) return;
    const col = c.wrecked ? COL.ghost : COL.car;
    const Q = carShape(c, S);
    // up in the air (or on a deck): where it is over the ground, faint, and where it is
    if (c.z > 0.5) {
      this.outline(Q, 0);
      this.stroke(col, 1, [2, 3]);
    }
    // (with HEIGHTS on, as tall as its roof)
    const roof = heights
      ? (BODY_UP + this.art.carHeight(c.def.id, this.art.carRoof(c.def.id), 0)) * c.size
      : 0;
    this.block(Q, c.z, roof, col, 1.6);
    // which end is the nose
    const n = (c.def.body.halfLength + 0.5) * c.size;
    this.line(c.x, c.y, c.z, c.x + Math.cos(c.h) * n, c.y + Math.sin(c.h) * n, c.z);
    this.stroke(col, 1);
    if (!heights) return;
    this.pin(c.x, c.y, c.z, col);
    const g = groundAt(w, c.x, c.y);
    const bits = [`z${c.z.toFixed(0)}`];
    if (c.deck > 0) bits.push(`deck${c.deck.toFixed(0)}`);
    if (Math.abs(g) >= 0.5) bits.push(`gnd${g.toFixed(0)}`);
    if (c.z > 0.5 || c.deck > 0 || Math.abs(g) >= 0.5)
      this.text(bits.join(' '), c.x, c.y, c.z + 15 * c.size, col, 7);
    if (c.wrecked) return;
    // its lamps where the look has them, and the foot of the beam they throw on the ground
    const lamp = c.has.front ? this.art.headLamp(c.def.id) : null;
    for (const [x, y, z] of lamp ? lampsOf(c, lamp) : []) {
      this.ring(x, y, 0.8, z);
      this.stroke(COL.lamp, 1.2);
      this.line(x, y, z, x, y, 0);
      this.stroke(COL.lamp, 0.8, [1, 2]);
    }
    // the gun: where a round leaves it, and the sights it fires in (your own car's only)
    const [mx, my, mz] = muzzle(c);
    this.ring(mx, my, 0.6, mz);
    this.stroke(COL.gun, 1.2);
    if (c !== w.player || !c.gun) return;
    const [range, aim] = gunSight(c);
    const ctx = this.ctx;
    ctx.beginPath();
    for (const sg of [-1, 1]) {
      const a = this.at(c.x, c.y, c.z);
      const b = this.at(
        c.x + Math.cos(c.h + aim * sg) * range,
        c.y + Math.sin(c.h + aim * sg) * range,
        c.z,
      );
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    this.stroke(COL.gun, 0.8, [4, 4]);
  }

  private legend(heights: boolean): void {
    const ctx = this.ctx;
    const d = this.dpr;
    const rows: [string, string][] = [
      [COL.car, 'car hull'],
      [COL.solid, 'solid scenery, map edge, mine, rocket'],
      [COL.low, 'low: a car in the air clears it'],
      [COL.loose, 'loose prop, animal'],
      [COL.soft, 'flattened by a car'],
      [COL.pad, 'tile, crate'],
      [COL.mound, 'bump, dip, ramp'],
      [COL.road, 'road edge'],
      [COL.deck, 'deck rail'],
    ];
    if (heights)
      rows.push(
        [COL.edge, 'ticks: a face too steep to climb'],
        [COL.high, 'up off the ground (height)'],
        [COL.lamp, 'lamp'],
        [COL.gun, 'gun muzzle and sights'],
      );
    ctx.font = `700 ${Math.round(8 * d)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const x = 8 * d;
    let y = 70 * d;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 4 * d, y - 7 * d, 190 * d, (rows.length * 10 + 6) * d);
    for (const [col, label] of rows) {
      ctx.fillStyle = col;
      ctx.fillRect(x, y - 2 * d, 10 * d, 4 * d);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x + 14 * d, y);
      y += 10 * d;
    }
  }
}
