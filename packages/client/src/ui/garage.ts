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
    // the car's shade on whatever stage the page puts under it
    const px = R.sx(0);
    const py = R.sy(0, 0);
    ctx.fillStyle = 'rgba(10,20,64,0.22)';
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
