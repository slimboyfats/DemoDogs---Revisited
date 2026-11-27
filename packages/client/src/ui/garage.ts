import type { CarManifest } from '@demodogs/shared';
import type { Art } from '../render/art';
import { StackRenderer } from '../render/stack';

const TAU = Math.PI * 2;
/** How far round the turntable is at a time. */
const h0 = (t: number): number => t * 0.8;

/** The turntable on the menu: the chosen car spinning slowly, wheels rolling. */
export class Garage {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly R: StackRenderer;
  private t = 0;

  constructor(
    private readonly cv: HTMLCanvasElement,
    private readonly art: Art,
  ) {
    this.ctx = cv.getContext('2d')!;
    this.R = new StackRenderer(this.ctx);
  }

  draw(car: CarManifest, dt: number): void {
    this.t += Math.max(0, dt);
    const cv = this.cv;
    const ctx = this.ctx;
    const R = this.R;
    const r = cv.getBoundingClientRect();
    const d = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * d) || cv.height !== Math.round(r.height * d)) {
      cv.width = Math.round(r.width * d);
      cv.height = Math.round(r.height * d);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const s = Math.max(3, Math.min(cv.width / 34, cv.height / 22));
    R.setView(s, (50 * Math.PI) / 180);
    R.begin(0, 0, cv.width, cv.height + s * 6);
    const A = this.art.car(car.id, car.paint);
    const h = h0(this.t);
    const cs = Math.cos(h);
    const sn = Math.sin(h);
    const wheel = this.art.wheels[((Math.floor(this.t * 10) % 3) + 3) % 3]!;
    // the turntable: a pale round stand with an ink line and a thick edge, the car's shade on it
    const px = R.sx(0);
    const py = R.sy(0, 0);
    const rx = 16.5 * s;
    const ry = 10 * s * R.ys;
    const lip = 1.6 * s;
    ctx.lineWidth = Math.max(2, 0.55 * s);
    ctx.strokeStyle = '#1b2233';
    ctx.fillStyle = '#7f8aa6';
    ctx.beginPath();
    ctx.ellipse(px, py + lip, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    const top = ctx.createLinearGradient(0, py - ry, 0, py + ry);
    top.addColorStop(0, '#ffffff');
    top.addColorStop(1, '#cfdcf0');
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.ellipse(px, py, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // (a ring of marks that turns with the car, so the stand is seen to turn)
    ctx.fillStyle = 'rgba(27,34,51,0.16)';
    for (let i = 0; i < 12; i++) {
      const a = h0(this.t) + (i / 12) * TAU;
      ctx.beginPath();
      ctx.ellipse(
        px + Math.cos(a) * rx * 0.86,
        py + Math.sin(a) * ry * 0.86,
        0.5 * s,
        0.5 * s * R.ys,
        0,
        0,
        TAU,
      );
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(27,34,51,0.22)';
    ctx.beginPath();
    ctx.ellipse(px, py, 11.5 * s, 7 * s * R.ys, 0, 0, TAU);
    ctx.fill();
    R.group(0);
    for (const w of car.wheels)
      for (const sg of [-1, 1])
        R.stack(wheel, cs * w[0] - sn * w[1] * sg, sn * w[0] + cs * w[1] * sg, 0, h);
    for (let i = 0; i < A.body.n; i++) R.slice(A.body, i, 0, 0, 0.6 + i / A.body.res, h);
    const a = car.body.halfLength - 0.1;
    R.stack(A.bumper, cs * a, sn * a, 1.4, h);
    R.stack(A.bumper, -cs * a, -sn * a, 1.4, h);
    R.stack(A.top, cs * car.top.x, sn * car.top.x, 0.6 + car.top.z, h);
    R.flush();
  }
}
