import type { Bot, Car, StaticProp, World } from '@demodogs/sim';
import type { Art } from './art';
import type { Effects } from './effects';
import type { Ground } from './ground';
import { pose } from './rig';
import { StackRenderer, type Strip } from './stack';

const TAU = Math.PI * 2;
export const PITCH = (56 * Math.PI) / 180;
const MINE_OFF = { minelit: 'black' };

interface Baked {
  img: HTMLCanvasElement;
  ax: number;
  ay: number;
}

export interface Camera {
  x: number;
  y: number;
  shake: number;
}

/**
 * Draws the world: the ground, shadows, every stack sorted by its ground point, particles and
 * floating words. Static props are baked once per angle into a canvas (the camera never turns, so
 * they always look the same) and drawn as one image each.
 */
export class Scene {
  readonly R: StackRenderer;
  scale = 4;
  private bakes = new Map<string, Baked>();
  private readonly ids = new WeakMap<Strip, number>();
  private nextId = 1;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly art: Art,
  ) {
    this.R = new StackRenderer(ctx);
  }

  setScale(s: number): void {
    if (s !== this.scale) this.bakes.clear();
    this.scale = s;
    this.R.setView(s, PITCH);
  }

  private baked(strip: Strip, rot: number): Baked {
    const q = Math.round(rot / (TAU / 32)) & 31;
    let id = this.ids.get(strip);
    if (!id) this.ids.set(strip, (id = this.nextId++));
    const key = `${id}:${q}`;
    let b = this.bakes.get(key);
    if (b) return b;
    const S = this.scale;
    const diag = Math.hypot(strip.cw, strip.ch);
    const w = Math.ceil(diag * S) + 4;
    const gy = Math.ceil(strip.n * this.R.zk + (diag * S * this.R.ys) / 2) + 3;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = gy * 2;
    const r2 = new StackRenderer(cv.getContext('2d')!);
    r2.setView(S, PITCH);
    r2.begin(0, 0, w, gy * 2);
    r2.stack(strip, 0, 0, 0, (q * TAU) / 32);
    r2.flush();
    b = { img: cv, ax: Math.round(w / 2), ay: gy };
    this.bakes.set(key, b);
    return b;
  }

  private propStrip(id: string): Strip {
    return this.art.prop(id);
  }

  private drawStatic(w: World, s: StaticProp): void {
    const strip = this.propStrip(s.def.id);
    const R = this.R;
    if (!R.visible(s.x, s.y, s.def.radius + 12, strip.n)) return;
    R.group(s.y);
    if (!s.def.sway) {
      const b = this.baked(strip, s.rot);
      R.image(b.img, s.x, s.y, b.ax, b.ay);
      return;
    }
    // trees sway: the higher the slice, the further it moves
    const t = w.time;
    const wind = Math.sin(t * 1.3 + s.seed) * 0.9 + Math.sin(t * 2.9 + s.seed * 2) * 0.3;
    for (let i = 0; i < strip.n; i++) {
      const k = i / strip.n;
      const o = wind * k * k * 1.8;
      R.slice(strip, i, s.x + o, s.y + o * 0.4, i, s.rot, 1);
    }
  }

  private drawCar(w: World, fx: Effects, c: Car): void {
    const R = this.R;
    if (!R.visible(c.x, c.y, 20, 14)) return;
    R.group(c.y);
    const A = fx.carArt(c);
    const body = fx.bodies[c.index]!;
    const D = c.def;
    const cs = Math.cos(c.h);
    const sn = Math.sin(c.h);
    const alpha = c.invuln > 0 && Math.floor(w.time * 12) % 2 ? 0.4 : 1;
    const wheel = this.art.wheels[((Math.floor(c.wheelDist / 2.2) % 3) + 3) % 3]!;
    const z = c.z;
    for (const wh of D.wheels)
      for (const sg of [-1, 1]) {
        const wx = wh[0];
        const wy = wh[1] * sg;
        const steer = wx > 0 && !c.wrecked ? c.steer * 0.45 : 0;
        R.stack(wheel, c.x + cs * wx - sn * wy, c.y + sn * wx + cs * wy, z, c.h + steer, alpha);
      }
    // the body: each slice shifted a little more than the one below, so it leans and squats
    const n = body.n;
    const rx = -sn;
    const ry = cs;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const o = c.roll * t;
      const l = c.lurch * t;
      R.slice(
        body,
        i,
        c.x + rx * o + cs * l,
        c.y + ry * o + sn * l,
        z + 0.6 + i + c.bounce,
        c.h,
        1,
        alpha,
      );
    }
    const a = D.body.halfLength + 0.6;
    const o = c.roll;
    const l = c.lurch;
    if (c.has.front)
      R.stack(
        A.bumper,
        c.x + cs * a + rx * o * 0.15,
        c.y + sn * a + ry * o * 0.15,
        z + 1.4 + c.bounce,
        c.h,
        alpha,
      );
    if (c.has.rear)
      R.stack(
        A.bumper,
        c.x - cs * a + rx * o * 0.15,
        c.y - sn * a + ry * o * 0.15,
        z + 1.4 + c.bounce,
        c.h,
        alpha,
      );
    if (c.has.top)
      R.stack(
        A.top,
        c.x + cs * (D.top.x + l) + rx * o,
        c.y + sn * (D.top.x + l) + ry * o,
        z + 0.6 + D.top.z + c.bounce,
        c.h,
        alpha,
      );
  }

  private drawBot(fx: Effects, b: Bot): void {
    const R = this.R;
    if (!b.alive || !R.visible(b.x, b.y, 10, 14)) return;
    R.group(b.y);
    const P = pose(fx.walkers[b.index]!);
    const A = this.art.bot(b.def.id, b.paint);
    for (const L of P.legs) {
      R.stack(A.foot, L.sole[0], L.sole[1], L.sole[2], L.rot);
      R.limb(A.limb, L.ankle, L.knee, 3);
      R.limb(A.limb, L.knee, L.hip, 3);
    }
    const z0 = P.pelvis[2] - 1;
    const a = P.heading + (P.hipsAngle - P.heading) * 0.6;
    R.stack(A.body, P.x, P.y, z0, a);
    R.stack(A.aerial, P.x - Math.cos(a) * 1.4, P.y - Math.sin(a) * 1.4, z0 + A.body.n, a);
  }

  private shadow(x: number, y: number, rx: number, ry: number, rot: number, a: number): void {
    const ctx = this.ctx;
    const R = this.R;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.ellipse(
      R.sx(x),
      R.sy(y, 0),
      rx * this.scale,
      ry * this.scale * R.ys,
      Math.atan2(Math.sin(rot) * R.ys, Math.cos(rot)),
      0,
      TAU,
    );
    ctx.fill();
  }

  draw(
    w: World,
    fx: Effects,
    ground: Ground,
    cam: Camera,
    W: number,
    H: number,
    dpr: number,
  ): void {
    const ctx = this.ctx;
    const R = this.R;
    const S = this.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = w.venue.colors.outside;
    ctx.fillRect(0, 0, W, H);
    const shx = (Math.random() - 0.5) * cam.shake;
    const shy = (Math.random() - 0.5) * cam.shake;
    R.begin(cam.x + shx / S, cam.y + shy / S, W, H);

    // the ground: only the part on screen, scaled up with hard pixels
    const vw = W / S;
    const vh = H / (S * R.ys);
    const x0 = cam.x - vw / 2 - 2;
    const y0 = cam.y - vh / 2 - 2;
    const sx0 = Math.max(0, Math.floor(x0));
    const sy0 = Math.max(0, Math.floor(y0));
    const sx1 = Math.min(w.w, Math.ceil(x0 + vw + 4));
    const sy1 = Math.min(w.h, Math.ceil(y0 + vh + 30));
    ctx.imageSmoothingEnabled = false;
    if (sx1 > sx0 && sy1 > sy0)
      ctx.drawImage(
        ground.cv,
        sx0,
        sy0,
        sx1 - sx0,
        sy1 - sy0,
        R.sx(sx0),
        R.sy(sy0),
        (sx1 - sx0) * S,
        (sy1 - sy0) * S * R.ys,
      );

    // shadows
    ctx.fillStyle = '#000';
    for (const s of w.statics)
      if (s.def.sway && R.visible(s.x, s.y, 14)) {
        const st = this.propStrip(s.def.id);
        this.shadow(s.x + 3, s.y + 2, st.cw * 0.45, st.ch * 0.4, 0, 0.22);
      }
    for (const c of w.cars)
      if (R.visible(c.x, c.y, 20))
        this.shadow(
          c.x + 1.5,
          c.y + 1.5,
          (c.def.body.halfLength + 2) * (1 - Math.min(0.4, c.z / 80)),
          c.def.body.halfWidth + 1.9,
          c.h,
          0.3,
        );
    for (const b of w.bots)
      if (b.alive && R.visible(b.x, b.y, 8)) this.shadow(b.x, b.y, 4, 3, 0, 0.25);
    ctx.globalAlpha = 1;

    // stacks
    for (const s of w.statics) this.drawStatic(w, s);
    for (const p of w.props)
      if (p.alive && R.visible(p.x, p.y, 8, 10)) {
        R.group(p.y);
        R.stack(this.propStrip(p.def.id), p.x, p.y, p.z, p.rot);
      }
    const t = w.time;
    for (const p of w.pickups)
      if (p.on && R.visible(p.x, p.y, 8, 12)) {
        R.group(p.y);
        R.stack(this.art.pickup, p.x, p.y, 2.5 + Math.sin(t * 3 + p.x) * 1.5, t * 1.8 + p.y);
      }
    for (const m of w.mines)
      if (R.visible(m.x, m.y, 6)) {
        R.group(m.y - 5);
        R.stack(
          Math.floor(m.t * 4) % 2 ? this.art.prop(m.def.id) : this.art.prop(m.def.id, MINE_OFF),
          m.x,
          m.y,
          0,
          0,
        );
      }
    for (const r of w.rockets) {
      R.group(r.y);
      R.stack(this.art.prop(r.def.id), r.x, r.y, 4, r.h);
    }
    for (const b of w.bots) this.drawBot(fx, b);
    for (const d of fx.debris)
      if (R.visible(d.x, d.y, 8, 10)) {
        R.group(d.y);
        R.stack(d.strip, d.x, d.y, d.z, d.rot, d.life < 1.5 ? d.life / 1.5 : 1);
      }
    for (const c of w.cars) this.drawCar(w, fx, c);
    R.flush();

    // particles
    for (const f of fx.fx) {
      const sx = R.sx(f.x);
      const sy = R.sy(f.y, f.z);
      if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue;
      const k = f.life / f.max;
      let s = f.size * S;
      if (f.kind === 'smoke') {
        s *= 1 + (1 - k) * 1.8;
        ctx.globalAlpha = 0.45 * k;
        ctx.fillStyle = '#3a3836';
      } else if (f.kind === 'dust') {
        s *= 1 + (1 - k) * 1.5;
        ctx.globalAlpha = 0.4 * k;
        ctx.fillStyle = '#9a8460';
      } else if (f.kind === 'fire') {
        ctx.globalAlpha = Math.min(1, k * 1.5);
        ctx.fillStyle = k > 0.6 ? '#ffe27a' : k > 0.3 ? '#ff8a2a' : '#c0321c';
      } else {
        ctx.globalAlpha = 1;
        ctx.fillStyle = k > 0.5 ? '#fff6c0' : '#ffb03a';
        s = Math.max(2, S * 0.8);
      }
      ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
    }
    ctx.globalAlpha = 1;

    // floating words
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const tx of fx.texts) {
      ctx.globalAlpha = Math.min(1, (tx.life / tx.max) * 2.5);
      ctx.font = `900 ${Math.round((tx.big ? 22 : 15) * dpr)}px system-ui, sans-serif`;
      const sx = R.sx(tx.x);
      const sy = R.sy(tx.y, tx.z);
      ctx.lineWidth = 4 * dpr;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(tx.text, sx, sy);
      ctx.fillStyle = tx.col;
      ctx.fillText(tx.text, sx, sy);
    }
    ctx.globalAlpha = 1;

    // off-screen rival arrows in the derby
    if (w.kind === 'derby')
      for (const c of w.cars) {
        if (c.isPlayer || c.wrecked) continue;
        const sx = R.sx(c.x);
        const sy = R.sy(c.y, 4);
        if (sx > 0 && sx < W && sy > 0 && sy < H) continue;
        const a = Math.atan2(sy - H / 2, sx - W / 2);
        const ex = W / 2 + Math.cos(a) * (W / 2 - 24 * dpr);
        const ey = H / 2 + Math.sin(a) * (H / 2 - 24 * dpr);
        ctx.save();
        ctx.translate(
          Math.min(W - 20 * dpr, Math.max(20 * dpr, ex)),
          Math.min(H - 20 * dpr, Math.max(20 * dpr, ey)),
        );
        ctx.rotate(a);
        ctx.fillStyle = c.paint;
        ctx.beginPath();
        ctx.moveTo(10 * dpr, 0);
        ctx.lineTo(-6 * dpr, -7 * dpr);
        ctx.lineTo(-6 * dpr, 7 * dpr);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
  }
}
