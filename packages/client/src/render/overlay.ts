import type { Car, World } from '@demodogs/sim';
import type { Effects } from './effects';
import type { Ground } from './ground';
import type { Camera } from './scene';

/** World to device pixels, for drawing flat things over the world. */
export interface Projector {
  sx(x: number): number;
  sy(y: number, z?: number): number;
}

/** Anything that draws a world: the canvas sprite-stack scene or the WebGL pixel engine. */
export interface WorldRenderer extends Projector {
  setScale(s: number): void;
  draw(w: World, fx: Effects, ground: Ground, cam: Camera, W: number, H: number, dpr: number): void;
}

/** Floating words and the derby's off-screen rival arrows, drawn on the flat overlay canvas. */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  P: Projector,
  w: World,
  fx: Effects,
  W: number,
  H: number,
  dpr: number,
): void {
  // floating words
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const tx of fx.texts) {
    ctx.globalAlpha = Math.min(1, (tx.life / tx.max) * 2.5);
    ctx.font = `900 ${Math.round((tx.big ? 22 : 15) * dpr)}px system-ui, sans-serif`;
    const sx = P.sx(tx.x);
    const sy = P.sy(tx.y, tx.z);
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
      if (c === w.player || c.wrecked) continue;
      const sx = P.sx(c.x);
      const sy = P.sy(c.y, 4);
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

/**
 * Every running car's name over its roof. Spectating, the one being watched is picked out;
 * driving, `skip` is this screen's own car, which needs no label.
 */
export function drawNames(
  ctx: CanvasRenderingContext2D,
  P: Projector,
  w: World,
  watched: Car | null,
  W: number,
  H: number,
  dpr: number,
  skip: Car | null = null,
): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  // the watched car's name last, so it is on top where cars bunch up
  const order = w.cars.filter((c) => c !== watched);
  if (watched) order.push(watched);
  for (const c of order) {
    if (c.wrecked || c === skip) continue;
    const on = c === watched;
    const sx = P.sx(c.x);
    const sy = P.sy(c.y, c.z + 16) - 4 * dpr;
    if (sx < 0 || sx > W || sy < 0 || sy > H) continue;
    ctx.font = `900 ${Math.round((on ? 13 : 10) * dpr)}px system-ui, sans-serif`;
    ctx.lineWidth = 3.5 * dpr;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    const label = on ? `▼ ${c.name}` : c.name;
    ctx.strokeText(label, sx, sy);
    ctx.fillStyle = on ? '#ffd24a' : c.paint;
    ctx.fillText(label, sx, sy);
  }
}
