import type { World } from '@demodogs/sim';
import type { Art } from './art';
import type { Effects } from './effects';
import type { Ground } from './ground';
import type { WorldRenderer } from './overlay';
import { drawParticle, overSmoke, type Put } from './pixel/particles';
import { queueShadows, queueStacks } from './stacks';
import { StackRenderer, tall, type Strip } from './stack';

const TAU = Math.PI * 2;
export const PITCH = (56 * Math.PI) / 180;

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
 * The canvas renderer: the ground, shadows, every stack sorted by its ground point, and particles. Static props are baked once per angle into a canvas (the camera never turns, so
 * they always look the same) and drawn as one image each.
 */
export class Scene implements WorldRenderer {
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

  sx(x: number): number {
    return this.R.sx(x);
  }

  sy(y: number, z = 0): number {
    return this.R.sy(y, z);
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
    const diag = Math.hypot(strip.cw, strip.ch) / strip.res;
    const w = Math.ceil(diag * S) + 4;
    const gy = Math.ceil(tall(strip) * this.R.zk + (diag * S * this.R.ys) / 2) + 3;
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

  draw(w: World, fx: Effects, ground: Ground, cam: Camera, W: number, H: number): void {
    const ctx = this.ctx;
    const R = this.R;
    const S = this.scale;
    // a strip that was redrawn (scenery with a bite out of it) is baked again
    for (const s of fx.changed) {
      const id = this.ids.get(s);
      if (id) for (let q = 0; q < 32; q++) this.bakes.delete(`${id}:${q}`);
    }
    fx.changed.clear();
    fx.dropped.length = 0;
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
    queueShadows(R, this.art, w, null, (x, y, rx, ry, rot, a) => this.shadow(x, y, rx, ry, rot, a));
    ctx.globalAlpha = 1;

    // stacks; still props are drawn as one baked image each
    queueStacks(R, this.art, w, fx, (s, strip) => {
      const b = this.baked(strip, s.rot);
      R.image(b.img, s.x, s.y, b.ax, b.ay);
      return true;
    });
    R.flush();

    // loose voxels (drawn over the stacks here; the pixel engine depth-tests them)
    for (const v of [...fx.voxels, ...fx.homing.filter((h) => h.t > h.wait)]) {
      const sx = R.sx(v.x);
      const sy = R.sy(v.y, v.z);
      if (sx < 0 || sx > W || sy < 0 || sy > H) continue;
      ctx.fillStyle = `#${v.rgb.toString(16).padStart(6, '0')}`;
      const d = Math.max(1, Math.round(v.s * S));
      ctx.fillRect(Math.round(sx - d / 2), Math.round(sy - d / 2), d, d);
    }

    // particles: the same blobs as the pixel engine, drawn here as plain squares
    const put =
      (lighter: boolean): Put =>
      (x, y, z, d, rgb, a) => {
        const sx = R.sx(x);
        const sy = R.sy(y, z);
        if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) return;
        const s = Math.max(lighter ? 2 : 1, d * S);
        ctx.globalCompositeOperation = lighter ? 'lighter' : 'source-over';
        ctx.globalAlpha = a;
        ctx.fillStyle = `#${rgb.toString(16).padStart(6, '0')}`;
        ctx.fillRect(Math.round(sx - s / 2), Math.round(sy - s / 2), Math.round(s), Math.round(s));
      };
    const normal = put(false);
    const glow = put(true);
    for (const f of fx.fx) if (!overSmoke(f)) drawParticle(f, normal, glow);
    for (const f of fx.fx) if (overSmoke(f)) drawParticle(f, normal, glow);
    fx.cells.draw(normal, glow, () => true);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
