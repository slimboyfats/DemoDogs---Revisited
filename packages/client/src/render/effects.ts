import { DT, type SimEvent } from '@demodogs/shared';
import type { Car, World } from '@demodogs/sim';
import { createWalker, place, step, type Walker } from './rig';
import type { Art } from './art';
import { markGround, type Ground } from './ground';
import type { Strip } from './stack';
import { char, clone, dent, shatter, voxelsOf, type Chip } from './strips';
import { launch, sample, stepVoxel, type Burst, type Voxel } from './voxels';
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
export interface Flash {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  rgb: number;
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

/** The most loose voxels in the air at once. */
const MAX_VOXELS = 2400;

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
  /** Short bursts of light (explosions, muzzle flashes) for renderers that light the world. */
  readonly flashes: Flash[] = [];
  /** Loose voxels knocked off cars and props, flying until they settle into the ground. */
  readonly voxels: Voxel[] = [];
  private readonly propAlive: boolean[] = [];
  /** Strips redrawn since a renderer last looked (dents, charring, a fresh body). */
  readonly changed = new Set<Strip>();
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

  private paintGround(
    x: number,
    y: number,
    r: number,
    fn: (g: CanvasRenderingContext2D) => void,
  ): void {
    fn(this.ground.g);
    markGround(this.ground, x, y, r);
  }

  private splat(x: number, y: number): void {
    this.paintGround(x, y, 10, (g) => {
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
    this.paintGround(x, y, r + 1, (g) => {
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
          const chips = dent(
            this.bodies[e.car]!,
            e.lx * 0.9,
            e.ly * 0.85,
            clamp(3 + e.amount * 0.14, 3, 7),
            clamp(e.amount / 45, 0.05, 0.6),
            Math.random,
            1,
          );
          this.changed.add(this.bodies[e.car]!);
          // the pixels knocked off fly away from the hit
          this.burst(chips, 70, {
            ...this.carBurst(c),
            ox: e.x,
            oy: e.y,
            speed: 30 + e.amount * 3,
          });
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
          // the car bursts: about half of what is left of the body flies off, the rest is a burnt hull
          const chips = shatter(this.bodies[e.car]!, 0.5, Math.random);
          this.burst(chips, 320, { ...this.carBurst(c), ox: c.x, oy: c.y, speed: 110 });
          char(this.bodies[e.car]!);
          this.changed.add(this.bodies[e.car]!);
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
          // paint the fresh body back into the same strip, so renderers keep their copy of it
          const body = this.bodies[e.car]!;
          const g = body.img.getContext('2d')!;
          g.clearRect(0, 0, body.img.width, body.img.height);
          g.drawImage(this.carArt(c).body.img, 0, 0);
          this.changed.add(body);
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
          this.flashes.push({ x, y, r: 70 * power + 20, life: 0.45, max: 0.45, rgb: 0xffa040 });
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
          // the bot's body bursts into its pixels, thrown the way the car was going
          this.burst(voxelsOf(A.body), 70, {
            x: e.x,
            y: e.y,
            h: b.h,
            z: 3,
            ox: e.x - ux * 6,
            oy: e.y - uy * 6,
            speed: 50 + sp * 0.5,
            vx: e.vx,
            vy: e.vy,
          });
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
          // the crate itself bursts into voxels in afterStep, like any prop that dies
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

  private carBurst(c: Car): Omit<Burst, 'ox' | 'oy' | 'speed'> {
    return { x: c.x, y: c.y, h: c.h, z: c.z + 0.6, vx: c.vx, vy: c.vy };
  }

  /** Send up to `max` of these chips flying (the rest just vanish), within the overall budget. */
  private burst(chips: Chip[], max: number, b: Burst): void {
    const room = Math.max(0, MAX_VOXELS - this.voxels.length);
    for (const c of sample(chips, Math.min(max, room), Math.random))
      this.voxels.push(launch(c, b, Math.random));
  }

  /** Per tick: walk the bots, lay skid marks, puff smoke from damaged cars, age everything. */
  afterStep(): void {
    const w = this.w;
    for (const b of w.bots) if (b.alive) step(this.walkers[b.index]!, b.x, b.y, b.h, DT);
    // a prop that died this tick (a smashed crate, a barrel going up) bursts into its voxels
    for (const p of w.props) {
      if (!p.alive && this.propAlive[p.index] !== false) {
        const boom = p.def.explodesAt !== undefined;
        this.burst(voxelsOf(this.art.prop(p.def.id)), boom ? 260 : 200, {
          x: p.x,
          y: p.y,
          h: p.rot,
          z: p.z,
          ox: p.x,
          oy: p.y,
          speed: boom ? 150 : 80,
          vx: p.vx,
          vy: p.vy,
        });
      }
      this.propAlive[p.index] = p.alive;
    }
    // loose voxels fly, bounce and settle: one that stops is painted into the ground for good
    const g = this.ground.g;
    for (let i = this.voxels.length - 1; i >= 0; i--) {
      const v = this.voxels[i]!;
      if (!stepVoxel(v, DT)) continue;
      const [x, y] = w.keepInside(v.x, v.y, 1);
      g.fillStyle = `rgb(${((v.rgb >> 16) & 255) * 0.8},${((v.rgb >> 8) & 255) * 0.8},${(v.rgb & 255) * 0.8})`;
      g.fillRect(Math.floor(x), Math.floor(y), 1, 1);
      markGround(this.ground, x, y, 1);
      this.voxels[i] = this.voxels[this.voxels.length - 1]!;
      this.voxels.pop();
    }
    w.cars.forEach((c, i) => {
      const cs = Math.cos(c.h);
      const sn = Math.sin(c.h);
      if (c.sliding)
        for (const sgn of [-1, 1]) {
          const wx = -7;
          const wy = 5.4 * sgn;
          this.ground.g.fillStyle = c.offroad ? 'rgba(60,40,20,0.3)' : 'rgba(18,16,14,0.3)';
          const mx = Math.round(c.x + cs * wx - sn * wy);
          const my = Math.round(c.y + sn * wx + cs * wy);
          this.ground.g.fillRect(mx - 1, my - 1, 2, 2);
          markGround(this.ground, mx, my, 1);
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
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]!;
      f.life -= DT;
      if (f.life <= 0) this.flashes.splice(i, 1);
    }
    this.msgT -= DT;
    this.shake *= Math.exp(-8 * DT);
  }
}
