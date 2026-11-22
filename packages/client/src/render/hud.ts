import type { World } from '@demodogs/sim';
import type { Effects } from './effects';

const TAU = Math.PI * 2;

export function placeName(n: number): string {
  return n + (n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH');
}

export function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

interface Mini {
  cv: HTMLCanvasElement;
  k: number;
}

/** The race HUD drawn on the game canvas: place, laps or cars left, score, bars, the minimap. */
export class Hud {
  private mini: Mini | null = null;

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  /** Rebuild the minimap for a world and screen size. */
  layout(w: World, dpr: number): void {
    const size = Math.round(
      Math.min(150, Math.max(90, Math.min(innerWidth, innerHeight) * 0.3)) * dpr,
    );
    const k = size / Math.max(w.w, w.h);
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w.w * k) + 8;
    cv.height = Math.ceil(w.h * k) + 8;
    const g = cv.getContext('2d')!;
    g.fillStyle = 'rgba(10,12,16,0.55)';
    g.fillRect(0, 0, cv.width, cv.height);
    g.translate(4, 4);
    const T = w.track;
    if (T) {
      g.beginPath();
      for (let i = 0; i < T.n; i++) {
        if (i) g.lineTo(T.x[i]! * k, T.y[i]! * k);
        else g.moveTo(T.x[i]! * k, T.y[i]! * k);
      }
      g.closePath();
      g.strokeStyle = 'rgba(230,230,230,0.85)';
      g.lineWidth = Math.max(2, w.road * k * 0.6);
      g.lineJoin = 'round';
      g.stroke();
    }
    const O = w.oval;
    if (O) {
      g.beginPath();
      g.ellipse(O.cx * k, O.cy * k, O.rx * k, O.ry * k, 0, 0, TAU);
      g.fillStyle = 'rgba(150,120,80,0.6)';
      g.fill();
      g.strokeStyle = 'rgba(230,230,230,0.8)';
      g.lineWidth = 2;
      g.stroke();
    }
    this.mini = { cv, k };
  }

  draw(w: World, fx: Effects, W: number, H: number, u: number): void {
    const ctx = this.ctx;
    const P = w.player;
    const pad = 12 * u;
    const left = pad + 46 * u;
    const font = (px: number) => `900 ${Math.round(px * u)}px system-ui, sans-serif`;
    const small = `800 ${Math.round(12 * u)}px system-ui, sans-serif`;
    const text = (
      t: string,
      x: number,
      y: number,
      f: string,
      col = '#fff',
      align: CanvasTextAlign = 'left',
    ) => {
      ctx.font = f;
      ctx.textAlign = align;
      ctx.lineWidth = 4 * u;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(t, x, y);
      ctx.fillStyle = col;
      ctx.fillText(t, x, y);
    };
    const bar = (y: number, v: number, col: string, label: string) => {
      const bw = 110 * u;
      const bh = 13 * u;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(left, y, bw, bh);
      ctx.fillStyle = col;
      ctx.fillRect(left + 2 * u, y + 2 * u, Math.max(0, (bw - 4 * u) * v), bh - 4 * u);
      ctx.font = `800 ${Math.round(9 * u)}px system-ui, sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, left + 5 * u, y + bh / 2 + 0.5);
      ctx.textBaseline = 'top';
    };

    ctx.textBaseline = 'top';
    const st = w.standings();
    if (w.kind === 'race') {
      text(placeName(st.indexOf(P) + 1), left, pad, font(20), '#ffd24a');
      text(
        `LAP ${Math.min(Math.max(P.lap, 1), w.laps)}/${w.laps}`,
        left + 62 * u,
        pad + 4 * u,
        small,
      );
      text(fmtTime(w.raceTime), left + 62 * u, pad + 19 * u, small, '#cfd6e0');
    } else {
      text(`${w.cars.filter((c) => !c.wrecked).length} LEFT`, left, pad, font(20), '#ffd24a');
      text(
        fmtTime(Math.max(0, w.timeLeft)),
        left + 92 * u,
        pad + 4 * u,
        small,
        w.timeLeft < 20 ? '#ff7a6a' : '#fff',
      );
    }
    text(`SCORE ${P.score}`, left, pad + 38 * u, small);
    bar(
      pad + 56 * u,
      P.hp / 100,
      P.hp > 50 ? '#5fd35a' : P.hp > 25 ? '#f0b52c' : '#e8442e',
      'ARMOR',
    );
    bar(pad + 72 * u, P.nitro, '#4fb8ff', 'BOOST');
    if (P.gun)
      text(`AMMO ${P.rounds}`, left, pad + 90 * u, small, P.rounds > 0 ? '#fff' : '#ff7a6a');

    const m = this.mini;
    if (m) {
      const mx = W - m.cv.width - pad;
      const my = pad;
      ctx.drawImage(m.cv, mx, my);
      for (const c of w.cars) {
        if (c.wrecked && w.kind === 'derby') continue;
        ctx.fillStyle = c.isPlayer ? '#fff' : c.paint;
        const s = (c.isPlayer ? 6 : 4.5) * u;
        ctx.fillRect(mx + 4 + c.x * m.k - s / 2, my + 4 + c.y * m.k - s / 2, s, s);
      }
      // standings under the minimap
      let y = pad + m.cv.height + 6 * u;
      for (let i = 0; i < Math.min(6, st.length); i++) {
        const c = st[i]!;
        ctx.fillStyle = c.paint;
        ctx.fillRect(W - pad - 8 * u, y + 2 * u, 7 * u, 9 * u);
        const out = c.wrecked && w.kind === 'derby';
        text(
          `${i + 1} ${c.name}${out ? ' ✕' : ''}`,
          W - pad - 12 * u,
          y,
          `800 ${Math.round(10 * u)}px system-ui, sans-serif`,
          c.isPlayer ? '#ffd24a' : c.wrecked ? '#999' : '#fff',
          'right',
        );
        y += 13 * u;
      }
    }

    // big centre messages
    ctx.textBaseline = 'middle';
    if (w.phase === 'countdown') {
      const n = Math.ceil(w.countdown);
      if (n <= 3) text(String(n), W / 2, H * 0.36, font(64), '#ffd24a', 'center');
      else text(w.venue.meta.name.toUpperCase(), W / 2, H * 0.36, font(30), '#fff', 'center');
    }
    if (fx.msgT > 0 && fx.msg) text(fx.msg, W / 2, H * 0.3, font(34), '#ffd24a', 'center');
    if (w.wrongWay()) text('WRONG WAY!', W / 2, H * 0.42, font(28), '#ff6a5a', 'center');
  }
}
