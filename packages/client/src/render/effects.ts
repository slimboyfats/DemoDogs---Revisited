import { DT, type SimEvent } from '@demodogs/shared';
import type { Car, World } from '@demodogs/sim';
import { createWalker, place, step, type Walker } from './rig';
import type { Art } from './art';
import type { Ground } from './ground';
import type { Strip } from './stack';
import { char, clone, dent } from './strips';
import type { Sound } from '../audio/sound';

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export type FxKind = 'spark' | 'smoke' | 'dust' | 'fire';
export interface Particle {
  kind: FxKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
}
export interface Debris {
  strip: Strip;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: number;
  spin: number;
  life: number;
}
export interface FloatText {
  x: number;
  y: number;
  z: number;
  text: string;
  col: string;
  life: number;
  max: number;
  big: boolean;
}

const BOT_RIG = {
  thigh: 3.4,
  shin: 3.6,
  ankle: 0.8,
  hipHalf: 2.2,
  standHip: 6.2,
  stride: 9,
  duty: 0.58,
  lift: 2.2,
  bob: 0.45,
  twist: 0.12,
  spine: 6,
  kneeHint: -1,
};

/**
 * Everything the client shows that the sim does not track: particles, flying debris, floating
 * words, screen shake, each car's dented body, the bots' walk rigs and the big centre message.
 * It reads the sim's events after every tick and plays them as sights and sounds.
 */
export class Effects {
  readonly fx: Particle[] = [];
  readonly debris: Debris[] = [];
  readonly texts: FloatText[] = [];
  readonly bodies: Strip[] = [];
  readonly walkers: Walker[] = [];
  shake = 0;
  msg = '';
  msgT = 0;
  private readonly smokeT: number[] = [];

  constructor(
    private readonly w: World,
    private readonly art: Art,
    private readonly ground: Ground,
    private readonly sound: Sound,
  ) {
    for (const c of w.cars) this.bodies.push(clone(this.carArt(c).body));
    for (const b of w.bots) {
      const wk = createWalker(BOT_RIG);
      place(wk, b.x, b.y, b.h);
      this.walkers.push(wk);
    }
  }

  carArt(c: Car) {
    return this.art.car(c.def.id, c.paint);
  }

  setMsg(text: string, t: number): void {
    this.msg = text;
    this.msgT = t;
  }

  // ------------------------------------------------------------ helpers
  spark(x: number, y: number, z: number, sp = 0): void {
    if (this.fx.length > 700) return;
    const a = rand(0, TAU);
    const v = rand(20, 60) + sp * Math.random();
    this.fx.push({
      kind: 'spark',
      x,
      y,
      z,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      vz: rand(30, 110),
      life: rand(0.25, 0.55),
      max: 0.55,
      size: 1,
    });
  }

  puff(x: number, y: number, z: number, kind: FxKind, vx = 0, vy = 0): void {
    if (this.fx.length > 700) return;
    const fire = kind === 'fire';
    this.fx.push({
      kind,
      x: x + rand(-2, 2),
      y: y + rand(-2, 2),
      z,
      vx: vx + rand(-8, 8),
      vy: vy + rand(-8, 8),
      vz: fire ? rand(18, 36) : rand(8, 20),
      life: fire ? rand(0.3, 0.6) : rand(0.8, 1.6),
      max: fire ? 0.6 : 1.6,
      size: fire ? rand(1.5, 3) : rand(2, 3.5),
    });
  }

  text(x: number, y: number, text: string, col = '#fff', big = false): void {
    this.texts.push({ x, y, z: 18, text, col, life: big ? 1.8 : 1.2, max: big ? 1.8 : 1.2, big });
  }

  private fling(
    strip: Strip,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    rot: number,
    life: number,
  ): void {
    this.debris.push({ strip, x, y, z, vx, vy, vz, rot, spin: rand(-14, 14), life });
  }

  private paintGround(fn: (g: CanvasRenderingContext2D) => void): void {
    fn(this.ground.g);
  }

  private splat(x: number, y: number): void {
    this.paintGround((g) => {
      g.fillStyle = 'rgba(16,14,20,0.55)';
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.arc(x + rand(-6, 6), y + rand(-5, 5), rand(1.5, 4), 0, TAU);
        g.fill();
      }
      g.fillStyle = 'rgba(60,200,220,0.25)';
      g.beginPath();
      g.arc(x, y, 3, 0, TAU);
      g.fill();
    });
  }

  private scorch(x: number, y: number, r: number): void {
    this.paintGround((g) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(10,8,6,0.6)');
      gr.addColorStop(1, 'rgba(10,8,6,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    });
  }

  /** How loud a sound at (x, y) is for the player: 1 close, 0 far away. */
  vol(x: number, y: number): number {
    const P = this.w.player;
    return clamp(1 - Math.hypot(x - P.x, y - P.y) / 380, 0, 1);
  }

  private near(x: number, y: number, d: number): boolean {
    const P = this.w.player;
    return Math.hypot(x - P.x, y - P.y) < d;
  }

  // ------------------------------------------------------------ events
  handle(events: SimEvent[]): void {
    const w = this.w;
    const S = this.sound;
    let smashAt = '';
    for (const e of events) {
      switch (e.t) {
        case 'hit': {
          const c = w.cars[e.car]!;
          dent(
            this.bodies[e.car]!,
            e.lx * 0.9,
            e.ly * 0.85,
            clamp(3 + e.amount * 0.14, 3, 7),
            clamp(e.amount / 45, 0.05, 0.6),
            Math.random,
            1,
          );
          if (c.isPlayer && e.amount > 6)
            this.shake = Math.max(this.shake, Math.min(10, e.amount * 0.35));
          break;
        }
        case 'crash': {
          for (let i = 0; i < 6; i++) this.spark(e.x, e.y, 3, e.impact * 0.4);
          const v = this.vol(e.x, e.y);
          if (v > 0) S.crash(e.impact * v);
          break;
        }
        case 'scrape':
          this.spark(e.x, e.y, 3, 20);
          if (e.player) S.scrape();
          break;
        case 'detach': {
          const c = w.cars[e.car]!;
          const A = this.carArt(c);
          this.debris.push({
            strip: e.part === 'top' ? A.top : A.bumper,
            x: e.x,
            y: e.y,
            z: e.z,
            vx: e.vx,
            vy: e.vy,
            vz: rand(70, 140),
            rot: c.h,
            spin: rand(-9, 9),
            life: 9,
          });
          for (let i = 0; i < 6; i++) this.spark(e.x, e.y, 3, 60);
          break;
        }
        case 'wreck': {
          const c = w.cars[e.car]!;
          char(this.bodies[e.car]!);
          const A = this.carArt(c);
          for (let i = 0; i < 4; i++)
            this.fling(
              A.chunk,
              c.x,
              c.y,
              4,
              rand(-90, 90),
              rand(-90, 90),
              rand(90, 180),
              rand(0, TAU),
              7,
            );
          if (c.isPlayer)
            this.setMsg(w.kind === 'race' ? 'TOTALLED! TOWING YOU BACK' : 'YOU ARE SCRAP', 2.4);
          else if (w.kind === 'derby' && this.near(c.x, c.y, 300) && e.by !== w.player.index)
            this.text(c.x, c.y, `${c.name} IS OUT`, '#ffb08a');
          break;
        }
        case 'respawn': {
          const c = w.cars[e.car]!;
          this.bodies[e.car] = clone(this.carArt(c).body);
          for (let k = 0; k < 6; k++) this.puff(c.x, c.y, 2, 'smoke');
          break;
        }
        case 'land':
          if (e.impact > 90 && this.near(w.cars[e.car]!.x, w.cars[e.car]!.y, 300)) S.crash(10);
          break;
        case 'explode': {
          const { x, y, power } = e;
          for (let i = 0; i < 18 * power; i++)
            this.puff(x, y, rand(1, 8), 'fire', rand(-40, 40), rand(-40, 40));
          for (let i = 0; i < 12 * power; i++)
            this.puff(x, y, rand(2, 10), 'smoke', rand(-25, 25), rand(-25, 25));
          for (let i = 0; i < 16; i++) this.spark(x, y, 4, 120);
          this.scorch(x, y, 16 * power);
          const v = this.vol(x, y);
          if (v > 0) S.boom(v);
          if (this.near(x, y, 160)) this.shake = Math.max(this.shake, 9 * power * v);
          break;
        }
        case 'smash': {
          const b = w.bots[e.bot]!;
          const A = this.art.bot(b.def.id, b.paint);
          const sp = Math.hypot(e.vx, e.vy);
          const ux = e.vx / (sp || 1);
          const uy = e.vy / (sp || 1);
          this.fling(
            A.body,
            e.x,
            e.y,
            4,
            ux * sp * 0.9 + rand(-20, 20),
            uy * sp * 0.9 + rand(-20, 20),
            rand(110, 170),
            b.h,
            7,
          );
          for (let i = 0; i < 5; i++)
            this.fling(
              i < 2 ? A.foot : A.chunk,
              e.x,
              e.y,
              3,
              ux * sp * 0.6 + rand(-60, 60),
              uy * sp * 0.6 + rand(-60, 60),
              rand(70, 160),
              rand(0, TAU),
              6,
            );
          for (let i = 0; i < 14; i++) this.spark(e.x, e.y, 5, sp * 0.3);
          for (let i = 0; i < 4; i++) this.puff(e.x, e.y, 4, 'smoke');
          this.splat(e.x, e.y);
          if (e.by === w.player.index) {
            this.text(
              e.x,
              e.y,
              `${pick(['SCRAPPED!', 'CLANK!', 'BOT BOWLED!', 'BOLTS!'])} +${b.def.points}`,
              '#7ff0ff',
            );
            // the score event that follows says the same thing
            smashAt = `${e.x},${e.y}`;
            S.smash();
          } else if (this.near(e.x, e.y, 220)) S.smash();
          break;
        }
        case 'bot-spawn': {
          const b = w.bots[e.bot]!;
          place(this.walkers[e.bot]!, b.x, b.y, b.h);
          break;
        }
        case 'break':
          for (let i = 0; i < 6; i++)
            this.fling(
              this.art.plank,
              e.x,
              e.y,
              rand(1, 6),
              e.vx * 0.5 + rand(-60, 60),
              e.vy * 0.5 + rand(-60, 60),
              rand(60, 140),
              rand(0, TAU),
              5,
            );
          for (let i = 0; i < 4; i++) this.puff(e.x, e.y, 4, 'smoke');
          if (this.near(e.x, e.y, 250)) S.crash(20);
          break;
        case 'pickup':
          for (let i = 0; i < 8; i++) this.spark(e.x, e.y, 6, 30);
          if (e.car === w.player.index) {
            this.text(e.x, e.y, e.label, '#a6fbff');
            if (e.kind === 'repair') S.repair();
            else if (e.kind === 'nitro') S.nitro();
            else S.pickup();
          }
          break;
        case 'fire': {
          const c = w.cars[e.car]!;
          const wpn = w.content.weapon.get(e.weapon);
          if (wpn?.kind === 'rocket') {
            if (this.vol(c.x, c.y) > 0) S.fire();
          } else if (c.isPlayer) S.drop();
          break;
        }
        case 'score':
          if (e.car === w.player.index && `${e.x},${e.y}` !== smashAt) {
            const big = e.label.startsWith('WRECKED');
            this.text(e.x, e.y, e.label, big ? '#ff6a3d' : '#ffd24a', big);
          }
          break;
        case 'countdown':
          S.beep(false);
          break;
        case 'go':
          S.beep(true);
          this.setMsg('GO!', 0.9);
          break;
        case 'final-lap':
          this.setMsg('FINAL LAP', 1.6);
          break;
        case 'finish':
          if (e.car === w.player.index) this.setMsg(e.place === 1 ? 'YOU WIN!' : 'FINISHED', 2.4);
          break;
        case 'over':
          break;
      }
    }
    if (w.kind === 'derby' && w.endT > 0 && !this.endShown) {
      this.endShown = true;
      if (!w.player.wrecked)
        this.setMsg(
          w.cars.filter((c) => !c.wrecked).length <= 1 ? 'LAST DOG STANDING!' : 'TIME!',
          3,
        );
    }
  }
  private endShown = false;

  /** Per tick: walk the bots, lay skid marks, puff smoke from damaged cars, age everything. */
  afterStep(): void {
    const w = this.w;
    for (const b of w.bots) if (b.alive) step(this.walkers[b.index]!, b.x, b.y, b.h, DT);
    w.cars.forEach((c, i) => {
      const cs = Math.cos(c.h);
      const sn = Math.sin(c.h);
      if (c.sliding)
        for (const sgn of [-1, 1]) {
          const wx = -7;
          const wy = 5.4 * sgn;
          this.ground.g.fillStyle = c.offroad ? 'rgba(60,40,20,0.3)' : 'rgba(18,16,14,0.3)';
          this.ground.g.fillRect(
            Math.round(c.x + cs * wx - sn * wy) - 1,
            Math.round(c.y + sn * wx + cs * wy) - 1,
            2,
            2,
          );
        }
      if (c.sliding && Math.random() < 0.3) this.puff(c.x - cs * 9, c.y - sn * 9, 1, 'smoke');
      if (c.offroad && Math.abs(c.vf) > 50 && Math.random() < 0.25)
        this.puff(c.x - cs * 9, c.y - sn * 9, 1, 'dust');
      if (c.wrecked || c.hp < 45) {
        const t = (this.smokeT[i] ?? 0) - DT;
        this.smokeT[i] = t;
        if (t <= 0) {
          this.smokeT[i] = c.wrecked ? 0.05 : c.hp < 25 ? 0.07 : 0.16;
          this.puff(c.x + cs * 6, c.y + sn * 6, 6, 'smoke');
          if (c.wrecked || c.hp < 20) this.puff(c.x + cs * 6, c.y + sn * 6, 5, 'fire');
        }
      }
    });
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]!;
      f.life -= DT;
      if (f.life <= 0) {
        this.fx.splice(i, 1);
        continue;
      }
      f.x += f.vx * DT;
      f.y += f.vy * DT;
      f.z += f.vz * DT;
      if (f.kind === 'spark') {
        f.vz -= 300 * DT;
        if (f.z < 0) {
          f.z = 0;
          f.vz *= -0.4;
        }
      } else {
        f.vx *= 0.96;
        f.vy *= 0.96;
      }
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]!;
      d.life -= DT;
      if (d.life <= 0) {
        this.debris.splice(i, 1);
        continue;
      }
      d.x += d.vx * DT;
      d.y += d.vy * DT;
      d.rot += d.spin * DT;
      d.vz -= 420 * DT;
      d.z += d.vz * DT;
      if (d.z <= 0) {
        d.z = 0;
        d.vz = d.vz < -60 ? -d.vz * 0.3 : 0;
        const f = Math.exp(-5 * DT);
        d.vx *= f;
        d.vy *= f;
        d.spin *= f;
      }
      [d.x, d.y] = w.keepInside(d.x, d.y, 2);
    }
    if (this.debris.length > 160) this.debris.splice(0, this.debris.length - 160);
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]!;
      t.life -= DT;
      t.z += 14 * DT;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    this.msgT -= DT;
    this.shake *= Math.exp(-8 * DT);
  }
}
