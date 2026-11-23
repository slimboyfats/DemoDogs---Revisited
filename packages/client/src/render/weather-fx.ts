import { DT, type SimEvent } from '@demodogs/shared';
import type { World } from '@demodogs/sim';
import type { Sound } from '../audio/sound';
import type { Effects } from './effects';
import { CKind } from './pixel/cells';
import { BREEZE, SOOT, WIND, shade } from './pixel/particles';
import { PULL } from './voxels';

/**
 * How world modifiers look and sound. The sim says what is on (`world.mods`), which way the wind
 * blows (`world.wind`) and what happens (`omen`, `bolt`, `skyfall`, `quake`, `split`, `gust`,
 * `flood`); everything here is the showing of it, in single cells like the rest of the effects.
 *
 * - Rain, wind-blown grit and rising embers are stateless: each cell's place is a pure function
 *   of its number and the time, so nothing is stored (after mudders' ambient layers, ambient.ts).
 * - A bolt is mudders' sky bolt (`skyBolt` and BOLT_FLICK in its pixel effects): a jagged channel
 *   walked down from the sky with a few branches, flickering in hard steps.
 * - Night and wet ground are the sky's (`Atmosphere`): this class says how dark and how wet. A
 *   modifier's own colour (dust, heat) is one multiply over the picture (`DuskPass`).
 */
type WeatherEvent = Extract<
  SimEvent,
  { t: 'weather' | 'omen' | 'bolt' | 'skyfall' | 'quake' | 'split' | 'gust' | 'flood' }
>;

/** How the scene hands a frame's weather cells to its batches. */
export interface WeatherDraw {
  /** The middle of the view on the ground, and half its width and height there, art px. */
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  /** One square of `n` fine cells at (x, y, z). */
  cell(x: number, y: number, z: number, n: number, rgb: number, a: number): void;
  /** The same, added to the picture as light. */
  glow(x: number, y: number, z: number, n: number, rgb: number, a: number): void;
  /** A bar of w by h fine cells, turned by `rot` on the screen. */
  bar(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    rgb: number,
    a: number,
    rot: number,
  ): void;
  /** A soft dark disc on the ground, d art px across. */
  shade(x: number, y: number, d: number, a: number): void;
  /** How much the ground is squashed up the screen (sin of the camera pitch), and its cosine. */
  ys: number;
  cosP: number;
}

interface Bolt {
  x: number;
  y: number;
  /** Cells of the channel as (dx, z) pairs: the main channel first, then its branches. */
  cells: Float32Array;
  main: number;
  /** Ticks since it struck. */
  age: number;
}

interface Omen {
  what: 'bolt' | 'scrap' | 'quake';
  x: number;
  y: number;
  r: number;
  t: number;
  max: number;
}

/**
 * A bolt's brightness per tick of age, in hard steps: the dim leader, the white return stroke,
 * then restrikes with dark gaps between, each weaker than the last (mudders' BOLT_FLICK).
 */
const BOLT_FLICK = [
  0.45, 1, 0.7, 0.95, 0, 0.85, 0.4, 0, 0.9, 0.3, 0.6, 0, 0.5, 0.25, 0, 0.3,
] as const;
/** How high the sky starts, art px: far above the top of the screen. */
const SKY = 300;
/** Rain and grit repeat over a square of ground this wide, wider than any view. */
const TILE = 512;
const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const hexRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Integer hash to [0, 1) (mudders' h01). */
function h01(i: number, salt: number): number {
  let x = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

/** The copy of a tiled point nearest to c. */
const wrap = (p: number, c: number): number => p + TILE * Math.round((c - p) / TILE);

/** A jagged channel from the sky down to the ground, with branches, as (dx, z) cells. */
export function boltCells(rng: () => number = Math.random): { cells: Float32Array; main: number } {
  const out: number[] = [];
  const walk = (x0: number, z0: number, z1: number, drift: number): number => {
    let x = x0;
    let z = z0;
    while (z > z1) {
      const seg = Math.min(z - z1, Math.round(3 + rng() * 6));
      const nx = x + Math.round((rng() * 2 - 1) * 3 + drift);
      for (let i = 0; i < seg; i++) out.push(x + ((nx - x) * i) / seg, z - i);
      x = nx;
      z -= seg;
    }
    return x;
  };
  const end = walk((rng() * 2 - 1) * 18, SKY, 0, 0);
  // slide the whole channel so its foot stands on the target
  const main = out.length;
  for (let i = 0; i < main; i += 2) out[i] = out[i]! - end * (1 - out[i + 1]! / SKY);
  const branches = 3 + Math.floor(rng() * 3);
  for (let b = 0; b < branches; b++) {
    const at = 2 * Math.floor((0.1 + rng() * 0.7) * (main / 2));
    const z = out[at + 1]!;
    walk(out[at]!, z, Math.max(4, z - (14 + rng() * 40)), rng() < 0.5 ? -1.6 : 1.6);
  }
  return { cells: Float32Array.from(out), main };
}

export class WeatherFx {
  /** What the whole picture is multiplied by: white when nothing dims it. */
  readonly tint: [number, number, number] = [1, 1, 1];
  /** Cars light the road ahead of them (night). */
  /** The least darkness and wet the modifiers ask of the sky (see Atmosphere). */
  dark = 0;
  wet = 0;
  /** How hard it is raining, 0 to 1 (eased, so rain comes on and dies away). */
  rain = 0;
  /** How dry and hot it is, 0 to 1: embers ride the air. */
  heat = 0;
  /** The sky's blink after a bolt, 1 fading to 0. */
  flash = 0;
  readonly bolts: Bolt[] = [];
  readonly omens: Omen[] = [];
  private quake: { x: number; y: number; r: number; t: number; max: number } | null = null;
  private clock = 0;

  constructor(
    private readonly fx: Effects,
    private readonly w: World,
    private readonly sound: Sound,
  ) {
    // a new race starts in still air under the usual gravity
    WIND[0] = BREEZE[0];
    WIND[1] = BREEZE[1];
    PULL.g = 1;
  }

  /** Does anything dim or light the picture this frame? */
  get dim(): boolean {
    const t = this.tint;
    return t[0] < 0.995 || t[1] < 0.995 || t[2] < 0.995;
  }

  handle(e: WeatherEvent): void {
    const fx = this.fx;
    const S = this.sound;
    switch (e.t) {
      case 'weather':
        break;
      case 'omen': {
        this.omens.push({ what: e.what, x: e.x, y: e.y, r: e.r, t: e.in, max: e.in });
        const v = fx.vol(e.x, e.y);
        if (e.what === 'scrap' && v > 0) S.whistle(e.in, v);
        if (e.what === 'quake' && v > 0) S.rumble(e.in + 0.3, 0.45);
        break;
      }
      case 'bolt': {
        this.bolts.push({ x: e.x, y: e.y, ...boltCells(), age: 0 });
        this.flash = 1;
        fx.flashes.push({ x: e.x, y: e.y, r: 240, life: 0.4, max: 0.4, rgb: 0xc8d8ff });
        for (let i = 0; i < 22; i++) fx.spark(e.x, e.y, rand(1, 6), 150);
        fx.shake = Math.max(fx.shake, 3 + 6 * fx.vol(e.x, e.y));
        S.thunder(0.35 + 0.65 * fx.vol(e.x, e.y));
        break;
      }
      case 'skyfall': {
        fx.flashes.push({ x: e.x, y: e.y, r: 150, life: 0.3, max: 0.3, rgb: 0xffc070 });
        for (let i = 0; i < 26; i++) fx.spark(e.x, e.y, rand(1, 5), 190);
        fx.shake = Math.max(fx.shake, 9 * fx.vol(e.x, e.y));
        break;
      }
      case 'quake': {
        this.quake = { x: e.x, y: e.y, r: e.r, t: e.time, max: e.time };
        S.rumble(e.time + 0.6, 0.5 + 0.5 * fx.vol(e.x, e.y));
        const P = this.w.player;
        if (Math.hypot(P.x - e.x, P.y - e.y) < e.r) fx.setMsg('QUAKE!', 1.2);
        break;
      }
      case 'split':
        this.crack(e.pts);
        break;
      case 'gust':
        S.gust(e.time, 0.9);
        break;
      case 'flood': {
        const m = this.w.content.material.get(e.material);
        if (!m) break;
        // flood water is the material lit by the sky: its colour pulled toward the flood's own
        const sky = this.w.mods.find((k) => k.def.kind === 'flood')?.def.colour ?? m.colour;
        const a0 = parseInt(m.colour.slice(1), 16);
        const b0 = shade(parseInt(sky.slice(1), 16), 0.55);
        const mid = (sh: number) =>
          Math.round(((a0 >> sh) & 255) * 0.35 + ((b0 >> sh) & 255) * 0.65) << sh;
        const rgb = mid(16) | mid(8) | mid(0);
        fx.pool(
          { ...m, colour: '#' + rgb.toString(16).padStart(6, '0'), alpha: 0.42 },
          e.x,
          e.y,
          e.r,
        );
        // the edge creeping out: a few pale cells along it
        const pale = shade(rgb, 1.9);
        for (let i = 0; i < 6 * fx.quality; i++) {
          const a = rand(0, TAU);
          fx.cells.add(
            CKind.Wisp,
            e.x + Math.cos(a) * e.r,
            e.y + Math.sin(a) * e.r,
            0.5,
            Math.cos(a) * 6,
            Math.sin(a) * 6,
            rand(0, 3),
            rand(0.3, 0.7),
            pale,
          );
        }
        break;
      }
    }
  }

  /** The ground split along a line: a dark jagged fissure with a pale lip, and dust out of it. */
  private crack(pts: number[]): void {
    const fx = this.fx;
    const w = this.w;
    const dirt = parseInt(w.venue.colors.dirt.slice(1), 16);
    const top = parseInt(w.venue.colors.ground2.slice(1), 16);
    const css = (rgb: number) => '#' + rgb.toString(16).padStart(6, '0');
    const n = pts.length / 2 - 1;
    for (let i = 0; i < n; i++) {
      const x0 = pts[i * 2]!;
      const y0 = pts[i * 2 + 1]!;
      const x1 = pts[i * 2 + 2]!;
      const y1 = pts[i * 2 + 3]!;
      const len = Math.hypot(x1 - x0, y1 - y0);
      // widest where it starts, a hairline at its tip
      const wide = 2.6 * (1 - i / (n + 1)) + 0.6;
      const nx = -(y1 - y0) / (len || 1);
      const ny = (x1 - x0) / (len || 1);
      fx.paintGround((x0 + x1) / 2, (y0 + y1) / 2, len / 2 + 5, (g) => {
        for (let s = 0; s <= len; s += 0.5) {
          const jag = Math.sin(s * 1.7 + i * 2.3) * 0.8 + rand(-0.4, 0.4);
          const px = x0 + ((x1 - x0) * s) / (len || 1) + nx * jag;
          const py = y0 + ((y1 - y0) * s) / (len || 1) + ny * jag;
          for (let k = -wide; k <= wide; k += 0.5) {
            const edge = Math.abs(k) / wide;
            if (edge > 0.75 && Math.random() < 0.5) {
              g.fillStyle = css(shade(top, rand(1.1, 1.35)));
            } else g.fillStyle = css(shade(dirt, 0.16 + 0.3 * edge + rand(-0.04, 0.04)));
            g.fillRect(Math.floor(px + nx * k), Math.floor(py + ny * k), 1, 1);
          }
        }
      });
      for (let k = 0; k < 5 * fx.quality; k++) {
        const s = Math.random();
        fx.cells.add(
          CKind.Wisp,
          x0 + (x1 - x0) * s + rand(-2, 2),
          y0 + (y1 - y0) * s + rand(-2, 2),
          rand(0, 2),
          rand(-14, 14),
          rand(-14, 14),
          rand(15, 60),
          rand(0.7, 1.6),
          shade(dirt, rand(0.9, 1.3)),
        );
      }
    }
  }

  /** Once a sim tick: follow the world's weather, age what is in the air. */
  tick(): void {
    const w = this.w;
    const fx = this.fx;
    const P = w.player;
    this.clock++;
    // what is on, read straight off the world
    let tr = 1;
    let tg = 1;
    let tb = 1;
    let rain = 0;
    let heat = 0;
    let dark = 0;
    let wet = 0;
    for (const m of w.mods) {
      const [r, g, b] = hexRgb(m.def.tint);
      tr *= r;
      tg *= g;
      tb *= b;
      if (m.def.kind === 'rain') rain = 1;
      if (m.def.kind === 'tinder') heat = 1;
      dark = Math.max(dark, m.def.sky?.dark ?? 0);
      wet = Math.max(wet, m.def.sky?.wet ?? 0);
    }
    const k = Math.min(1, 1.6 * DT);
    const T = this.tint;
    T[0] += (tr - T[0]) * k;
    T[1] += (tg - T[1]) * k;
    T[2] += (tb - T[2]) * k;
    this.rain += (rain - this.rain) * k;
    this.heat += (heat - this.heat) * k;
    this.dark = dark;
    this.wet = wet;
    this.flash = Math.max(0, this.flash - DT * 3.2);
    WIND[0] = BREEZE[0] + w.wind[0] * 0.9;
    WIND[1] = BREEZE[1] + w.wind[1] * 0.9;
    PULL.g = w.gravity;
    if (this.clock % 20 === 0) this.sound.rain(this.rain);

    for (const b of this.bolts) b.age++;
    while (this.bolts.length && this.bolts[0]!.age > 22) this.bolts.shift();

    for (let i = this.omens.length - 1; i >= 0; i--) {
      const o = this.omens[i]!;
      o.t -= DT;
      if (o.t <= 0) {
        this.omens.splice(i, 1);
        continue;
      }
      if (o.what === 'scrap') {
        // the piece on its way down: fire streaming off it, and a line of smoke behind
        const [x, y, z] = scrapAt(o);
        fx.flame(x, y, z, 4.5, 0, 0, rand(-10, 20));
        if (this.clock % 2 === 0) fx.plume(x, y, z + 2, 3.5, SOOT, rand(4, 14));
        if (Math.random() < 0.3) fx.spark(x, y, z, 40);
      } else if (o.what === 'bolt') {
        // the air charging: pale sparks lifting off the ground where it will strike
        for (let n = 0; n < 2; n++) {
          const a = rand(0, TAU);
          const d = rand(0, 9);
          fx.emit(
            'spark',
            o.x + Math.cos(a) * d,
            o.y + Math.sin(a) * d,
            rand(0, 2),
            rand(-8, 8),
            rand(-8, 8),
            rand(40, 120),
            rand(0.15, 0.4),
            1,
            Math.random() < 0.5 ? 0xc8dcff : 0x8fb4ff,
          );
        }
      } else if (Math.hypot(P.x - o.x, P.y - o.y) < o.r * 1.3) {
        // the rumble before a quake: the picture trembles and grit jumps
        fx.shake = Math.max(fx.shake, 1.5 + 2 * (1 - o.t / o.max));
        if (Math.random() < 0.5) fx.puff(P.x + rand(-90, 90), P.y + rand(-70, 70), 0.5, 'dust');
      }
    }

    const Q = this.quake;
    if (Q) {
      Q.t -= DT;
      const near = 1 - Math.hypot(P.x - Q.x, P.y - Q.y) / (Q.r * 1.6);
      const ease = Math.max(0, Q.t / Q.max);
      if (near > 0) {
        fx.shake = Math.max(fx.shake, 12 * near * ease);
        // dust shaken up out of the ground all round
        for (let n = 0; n < 3 * fx.quality * ease; n++)
          fx.puff(P.x + rand(-170, 170), P.y + rand(-120, 120), 0.5, 'dust', 0, 0);
      }
      if (Q.t <= 0) this.quake = null;
    }
  }

  /** The frame's weather cells: omens, falling scrap, bolts, rain, blown grit, embers. */
  draw(d: WeatherDraw): void {
    const w = this.w;
    const t = w.time;
    const q = this.fx.quality;

    for (const o of this.omens) {
      const p = 1 - o.t / o.max;
      if (o.what === 'scrap') {
        // where it will land: a shadow closing in, and a ring of hot cells turning round it
        d.shade(o.x, o.y, o.r * 2 * (0.35 + 0.65 * p), 0.2 + 0.3 * p);
        const n = 36;
        for (let i = 0; i < n; i++) {
          if ((i + Math.floor(t * 12)) % 3 > 1) continue;
          const a = (i / n) * TAU;
          const rx = o.x + Math.cos(a) * o.r;
          const ry = o.y + Math.sin(a) * o.r;
          d.cell(rx, ry, 0.3, 3, 0xff3a18, 0.6 + 0.4 * p);
          d.glow(rx, ry, 0.3, 3, 0xff7a30, 0.4 + 0.6 * p);
        }
        const [x, y, z] = scrapAt(o);
        d.cell(x, y, z, 5, 0x3a2a26, 1);
        d.glow(x, y, z, 5, 0xffb050, 1);
        d.glow(x, y, z, 3, 0xfff0c0, 1);
      } else if (o.what === 'bolt') {
        const n = 12;
        for (let i = 0; i < n; i++) {
          if (h01(i, Math.floor(t * 30)) > 0.35 + 0.5 * p) continue;
          const a = (i / n) * TAU + t * 3;
          d.glow(o.x + Math.cos(a) * 9, o.y + Math.sin(a) * 9, 0.3, 1, 0xb8d0ff, 0.9);
        }
      }
    }

    for (const b of this.bolts) {
      const k = BOLT_FLICK[b.age] ?? Math.max(0, 0.25 - (b.age - BOLT_FLICK.length) * 0.05);
      if (k <= 0) continue;
      const C = b.cells;
      for (let i = 0; i < C.length; i += 2) {
        const main = i < b.main;
        // a blue halo round the main channel, the channel itself, and a white core at its brightest
        if (main && (i & 2) === 0) d.glow(b.x + C[i]!, b.y, C[i + 1]!, 22, 0x4060d0, k * 0.5);
        d.glow(b.x + C[i]!, b.y, C[i + 1]!, main ? 8 : 4, 0xc8d8ff, main ? k : k * 0.8);
        if (main && k > 0.6) d.cell(b.x + C[i]!, b.y, C[i + 1]!, 4, 0xffffff, 1);
      }
    }

    // rain: streaks that fall to a point on the ground and splash there
    if (this.rain > 0.02) {
      const n = Math.round(1700 * this.rain * (0.4 + 0.6 * q));
      const lx = WIND[0] * 0.012;
      const ly = WIND[1] * 0.012;
      const rot = Math.atan2(lx, d.cosP + ly * d.ys);
      for (let i = 0; i < n; i++) {
        const per = 0.42 + h01(i, 1) * 0.2;
        const ph = t / per + h01(i, 2);
        const cyc = Math.floor(ph);
        const u = ph - cyc;
        const gx = wrap(h01(i, cyc * 2 + 3) * TILE, d.cx);
        const gy = wrap(h01(i, cyc * 2 + 4) * TILE, d.cy);
        if (Math.abs(gx - d.cx) > d.hw + 30 || Math.abs(gy - d.cy) > d.hh + 30) continue;
        if (u < 0.74) {
          const z = 72 * (1 - u / 0.74);
          d.bar(gx - lx * z, gy - ly * z, z, i % 4 ? 1 : 2, 10, 0xd4e4f8, 0.85, rot);
        } else {
          // the splash: two cells hopping apart
          const s = (u - 0.74) / 0.26;
          const a = 0.9 * (1 - s);
          const hop = s * (1 - s) * 7;
          d.cell(gx - 0.5 - s * 2.4, gy, hop, 2, 0xe4f0ff, a);
          d.cell(gx + 0.5 + s * 2.4, gy, hop, 2, 0xe4f0ff, a);
          d.cell(gx, gy - 0.5 - s * 1.6, hop * 0.6, 1, 0xe4f0ff, a);
          // and the ring it leaves on the wet ground
          d.bar(gx, gy, 0.1, 3 + Math.round(s * 5), 1, 0xb8cce4, a * 0.55, 0);
        }
      }
    }

    // wind: grit and scraps streaming low over the ground, the way it blows
    const wv = Math.hypot(w.wind[0], w.wind[1]);
    if (wv > 18) {
      const n = Math.round(Math.min(420, wv * 3.2) * (0.4 + 0.6 * q));
      const dx = w.wind[0] / wv;
      const dy = w.wind[1] / wv;
      const rot = Math.atan2(dy * d.ys, dx);
      const dirt = shade(parseInt(w.venue.colors.dirt.slice(1), 16), 1.5);
      const speed = 120 + wv * 2.2;
      for (let i = 0; i < n; i++) {
        const per = 0.7 + h01(i, 11) * 0.6;
        const ph = t / per + h01(i, 12);
        const cyc = Math.floor(ph);
        const u = ph - cyc;
        const run = speed * per * (u - 0.5);
        const gx = wrap(h01(i, cyc * 2 + 13) * TILE + dx * run, d.cx);
        const gy = wrap(h01(i, cyc * 2 + 14) * TILE + dy * run, d.cy);
        if (Math.abs(gx - d.cx) > d.hw + 20 || Math.abs(gy - d.cy) > d.hh + 20) continue;
        const z = 1 + h01(i, 15) * 12 + Math.sin(u * 9 + i) * 1.5;
        const a = Math.sin(u * Math.PI) * 0.85;
        if (i % 7 === 0) {
          // a streak of the wind itself, high up: long, pale and quick
          d.bar(gx, gy, 18 + h01(i, 16) * 26, 60 + Math.round(wv * 0.8), 2, 0xf4f4ec, a * 0.7, rot);
        } else if (i % 7 === 1) {
          // something torn loose and tumbling: a leaf, a scrap of paper
          const tum = Math.sin(t * 14 + i) > 0;
          const rgb = i % 3 ? (tum ? 0x8fd04a : 0x4c8a2a) : tum ? 0xf0ead8 : 0xb8b09c;
          d.cell(gx, gy, z + 4 + Math.sin(u * 14 + i) * 4, tum ? 5 : 4, rgb, Math.min(1, a * 2));
        } else
          d.bar(gx, gy, z, 16 + Math.round(wv / 5), i % 3 ? 2 : 3, i % 3 ? dirt : 0xe8e4d8, a, rot);
      }
    }

    // heat: embers riding the hot air up off the ground
    if (this.heat > 0.02) {
      const n = Math.round(280 * this.heat * (0.4 + 0.6 * q));
      for (let i = 0; i < n; i++) {
        const per = 2.2 + h01(i, 21) * 2;
        const ph = t / per + h01(i, 22);
        const cyc = Math.floor(ph);
        const u = ph - cyc;
        const gx = wrap(
          h01(i, cyc * 2 + 23) * TILE + Math.sin(t * 1.3 + i) * 4 + WIND[0] * u,
          d.cx,
        );
        const gy = wrap(h01(i, cyc * 2 + 24) * TILE + WIND[1] * u, d.cy);
        if (Math.abs(gx - d.cx) > d.hw + 10 || Math.abs(gy - d.cy) > d.hh + 40) continue;
        const hot = h01(i, Math.floor(t * 10)) > 0.5;
        const ea = Math.sin(u * Math.PI);
        d.cell(gx, gy, 2 + u * 46, i % 3 ? 2 : 4, hot ? 0xffb040 : 0xe05818, ea);
        d.glow(gx, gy, 2 + u * 46, i % 3 ? 4 : 7, hot ? 0xffd070 : 0xff8030, ea * 0.9);
      }
    }

    // low gravity: grit and pebbles that have come loose of the ground and hang there, turning
    if (PULL.g < 0.75) {
      const n = Math.round(240 * (0.4 + 0.6 * q));
      const stone = shade(parseInt(w.venue.colors.dirt.slice(1), 16), 1.25);
      for (let i = 0; i < n; i++) {
        const per = 5 + h01(i, 41) * 5;
        const ph = t / per + h01(i, 42);
        const cyc = Math.floor(ph);
        const u = ph - cyc;
        const gx = wrap(h01(i, cyc * 2 + 43) * TILE + Math.sin(t * 0.5 + i) * 5, d.cx);
        const gy = wrap(h01(i, cyc * 2 + 44) * TILE + Math.cos(t * 0.4 + i * 1.7) * 5, d.cy);
        if (Math.abs(gx - d.cx) > d.hw + 10 || Math.abs(gy - d.cy) > d.hh + 50) continue;
        const z = 3 + Math.sin(u * Math.PI) * (10 + h01(i, 45) * 34);
        const a = Math.min(1, Math.sin(u * Math.PI) * 3);
        if (i % 5 === 0) {
          // a pebble, with its shadow left behind on the ground
          const big = 6 + (i % 4) * 2;
          d.shade(gx, gy, 7, 0.4 * a);
          d.cell(gx, gy, z, big, shade(stone, 0.7), a);
          d.cell(gx - 0.4, gy - 0.4, z + 0.6, big - 3, shade(stone, 1.35), a);
        } else {
          d.cell(gx, gy, z, 3 + (i % 3), i % 3 ? 0xe0d4ff : stone, a);
          d.glow(gx, gy, z, 5 + (i % 3), 0xb39ddb, a * 0.6);
        }
      }
    }

    // oil on the road: the colours sliding about on each slick in view
    for (const m of w.mods) {
      if (m.def.kind !== 'slick' || !m.def.pools) continue;
      for (const p of w.spills) {
        if (p.def.id !== m.def.pools.material) continue;
        if (Math.abs(p.x - d.cx) > d.hw + p.r || Math.abs(p.y - d.cy) > d.hh + p.r) continue;
        const n = Math.min(36, Math.ceil(p.r * 1.4 * q));
        const id = Math.floor(p.x * 5 + p.y * 11);
        for (let i = 0; i < n; i++) {
          const a = h01(i + id, 51) * TAU + Math.sin(t * 0.7 + i) * 0.5;
          const rr = Math.sqrt(h01(i + id, 52)) * p.r * 0.85;
          const hue = (h01(i + id, 53) + t * 0.25) % 1;
          const rgb = hue < 0.33 ? 0xff5ac8 : hue < 0.66 ? 0x4fe0ff : 0xf2e85a;
          d.bar(
            p.x + Math.cos(a) * rr,
            p.y + Math.sin(a) * rr,
            0.2,
            5 + (i % 3) * 3,
            2,
            rgb,
            0.6 + 0.3 * Math.sin(t * 2 + i),
            0,
          );
        }
      }
    }

    // rising water glints: short pale dashes that come and go on each pool in view
    for (const m of w.mods)
      for (const p of m.pools) {
        if (Math.abs(p.x - d.cx) > d.hw + p.r || Math.abs(p.y - d.cy) > d.hh + p.r) continue;
        const n = Math.min(70, Math.ceil(p.r * 1.1 * q));
        const id = Math.floor(p.x * 7 + p.y * 13);
        for (let i = 0; i < n; i++) {
          const per = 0.6 + h01(i + id, 31) * 0.8;
          const ph = t / per + h01(i + id, 32);
          const cyc = Math.floor(ph);
          const u = ph - cyc;
          const a = h01(i + id, cyc * 2 + 33) * TAU;
          const rr = Math.sqrt(h01(i + id, cyc * 2 + 34)) * p.r * 0.8;
          d.bar(
            p.x + Math.cos(a) * rr,
            p.y + Math.sin(a) * rr,
            0.2,
            5 + Math.floor(h01(i + id, 35) * 6),
            2,
            0xcfeaff,
            Math.sin(u * Math.PI) * 0.8,
            0,
          );
        }
      }
  }
}

/** Where a falling piece of scrap is: it comes in steeply from up the sky and one side. */
function scrapAt(o: Omen): [number, number, number] {
  const left = o.t / o.max;
  const z = 560 * left;
  return [o.x + z * 0.22, o.y - z * 0.1, z];
}
