import type { Car, World } from '@demodogs/sim';
import type { Effects } from './effects';
import type { Ground } from './ground';
import type { Camera } from './scene';
import { drawMud } from './tricks-fx';
import { BODY, DISPLAY } from './type';
import { fitWords, type Word } from './words';

/** World to device pixels, for drawing flat things over the world. */
export interface Projector {
  sx(x: number): number;
  sy(y: number, z?: number): number;
  /** How high the ground it draws stands at (x, y); 0 where it draws the ground flat. */
  rise(x: number, y: number): number;
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
  /** Point at rivals who are off the screen (a derby's way of finding them). */
  arrows = true,
): void {
  // a mud pie in the face goes on first, so that the words and the dials are read over it
  const K = fx.tricks;
  if (K.mud > 0) drawMud(ctx, K.splats, K.mud, K.mudFor, W, H);
  // floating words
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // (they are for fun: small, none over another, none cut off by the edge of the screen)
  const spots = fx.texts.map((tx): Word => {
    const px = Math.round((tx.big ? 17 : 13) * dpr);
    ctx.font = `400 ${px}px ${DISPLAY}`;
    return {
      x: P.sx(tx.x),
      y: P.sy(tx.y, tx.z + P.rise(tx.x, tx.y)),
      w: ctx.measureText(tx.text).width + 6 * dpr,
      h: px * 1.15,
    };
  });
  // what they keep off: the gauges, the map and the standings, and every car with its name
  const taken: Word[] = [
    { x: 125 * dpr, y: 62 * dpr, w: 250 * dpr, h: 124 * dpr },
    { x: W - 70 * dpr, y: 95 * dpr, w: 140 * dpr, h: 190 * dpr },
  ];
  for (const c of w.cars) {
    if (c.wrecked) continue;
    const sx = P.sx(c.x);
    const sy = P.sy(c.y, c.z + 8 + P.rise(c.x, c.y));
    if (sx < 0 || sx > W || sy < 0 || sy > H) continue;
    taken.push({ x: sx, y: sy - 8 * dpr, w: 52 * dpr, h: 50 * dpr });
  }
  fitWords(spots, W, H, 6 * dpr, taken);
  ctx.lineJoin = 'round';
  for (let i = 0; i < spots.length; i++) {
    const tx = fx.texts[i]!;
    const at = spots[i]!;
    ctx.globalAlpha = Math.min(0.92, (tx.life / tx.max) * 2.5);
    ctx.font = `400 ${Math.round((tx.big ? 17 : 13) * dpr)}px ${DISPLAY}`;
    ctx.lineWidth = 3.5 * dpr;
    ctx.strokeStyle = 'rgba(27,34,51,0.92)';
    ctx.strokeText(tx.text, at.x, at.y);
    ctx.fillStyle = tx.col;
    ctx.fillText(tx.text, at.x, at.y);
  }
  ctx.globalAlpha = 1;

  // off-screen rival arrows in the derby
  if (arrows && w.kind === 'derby')
    for (const c of w.cars) {
      if (c === w.player || c.wrecked) continue;
      const sx = P.sx(c.x);
      const sy = P.sy(c.y, 4 + P.rise(c.x, c.y));
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
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = 'rgba(27,34,51,0.92)';
      ctx.stroke();
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
    const sy = P.sy(c.y, c.z + 16 + P.rise(c.x, c.y)) - 4 * dpr;
    if (sx < 0 || sx > W || sy < 0 || sy > H) continue;
    ctx.font = `400 ${Math.round((on ? 13 : 10) * dpr)}px ${DISPLAY}`;
    ctx.lineWidth = 3.5 * dpr;
    ctx.strokeStyle = 'rgba(27,34,51,0.92)';
    const label = on ? `▼ ${c.name}` : c.name;
    ctx.strokeText(label, sx, sy);
    ctx.fillStyle = on ? '#ffd24a' : c.paint;
    ctx.fillText(label, sx, sy);
    // what kind of driver it is, small, over the name
    const kind = c.isPlayer ? '' : (c.ai?.style ?? '');
    if (kind) {
      const up = Math.round((on ? 13 : 10) * dpr);
      ctx.font = `700 ${Math.round(7.5 * dpr)}px ${BODY}`;
      ctx.lineWidth = 2.5 * dpr;
      ctx.strokeText(kind, sx, sy - up);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(kind, sx, sy - up);
    }
  }
}
