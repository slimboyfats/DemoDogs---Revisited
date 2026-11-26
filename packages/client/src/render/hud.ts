import { ADDON_KINDS, BASE_SPEED, GUARD_KINDS, HELD } from '@demodogs/shared';
import { rescueIn, type Car, type World } from '@demodogs/sim';
import type { Effects } from './effects';
import { DIAL_DEFAULT, dialSpot, type DialSetup } from '../game/speedo';

const TAU = Math.PI * 2;

/** The guards a car carries, as the HUD names them: seconds left, or uses left. */
export function guardLabels(c: Car): string[] {
  const out: string[] = [];
  for (const k of GUARD_KINDS) {
    const g = c.guards[k];
    if (!g) continue;
    const name = g.def.meta.name.toUpperCase();
    out.push(g.def.seconds !== undefined ? `${name} ${Math.ceil(g.t)}s` : `${name} x${g.n}`);
  }
  return out;
}

export function placeName(n: number): string {
  return n + (n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH');
}

export function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

/** What the speedometer says is holding the car back, most telling first. */
const HELD_SAYS: [number, string][] = [
  [HELD.sticky, 'STUCK IN THE MUCK'],
  [HELD.rough, 'OFF ROAD'],
  [HELD.hill, 'UPHILL'],
  [HELD.weighed, 'WEIGHED DOWN'],
  [HELD.hurt, 'DAMAGED'],
];

/** The words for what is holding a car back (`Car.held`), most telling first. */
export function heldLabels(held: number): string[] {
  return HELD_SAYS.filter(([bit]) => held & bit).map(([, say]) => say);
}

/** The speed the dial shows for a car, in its own made-up units (px/s, near enough km/h). */
export function dialSpeed(c: Car): number {
  return Math.round(Math.hypot(c.vx, c.vy));
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

  /** `focus` is the car the readouts are about: this screen's own, or the one being watched. */
  draw(w: World, fx: Effects, W: number, H: number, u: number, focus: Car = w.player): void {
    const ctx = this.ctx;
    const P = focus;
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
    // what is bolted on: the blade's seconds left, the leaps left in the springs
    const fitted = [
      P.blade ? `BLADE ${Math.ceil(P.blade.t)}s` : '',
      P.springs && P.springs.n > 0 ? `SPRINGS x${P.springs.n}` : '',
      ...guardLabels(P),
      // catch-up items at work on the car, its own or a rival's doing
      P.morph ? `${P.morph.def.kind === 'grow' ? 'BIG' : 'RUNT'} ${Math.ceil(P.morph.t)}s` : '',
      P.wind ? `WIND ${Math.ceil(P.wind.t)}s` : '',
      P.collar ? `COLLARED ${Math.ceil(P.collar.t)}s` : '',
      // tricks at work on the car, its own or a rival's doing
      ...trickLabels(P),
      // add-ons that run down or get used up; the rest can be seen on the car
      ...ADDON_KINDS.map((k) => {
        const f = P.fit[k];
        if (!f || (f.t <= 0 && f.n <= 0)) return '';
        const name = f.def.meta.name.toUpperCase();
        return f.t > 0 ? `${name} ${Math.ceil(f.t)}s` : f.n > 1 ? `${name} x${f.n}` : name;
      }),
    ]
      .filter(Boolean)
      .join('  ');
    if (fitted) text(fitted, left, pad + (P.gun ? 106 : 90) * u, small, '#ffd84a');

    const m = this.mini;
    if (m) {
      const mx = W - m.cv.width - pad;
      const my = pad;
      ctx.drawImage(m.cv, mx, my);
      for (const c of w.cars) {
        if (c.wrecked && w.kind === 'derby') continue;
        ctx.fillStyle = c === w.player ? '#fff' : c.paint;
        const s = (c === w.player ? 6 : 4.5) * u;
        ctx.fillRect(mx + 4 + c.x * m.k - s / 2, my + 4 + c.y * m.k - s / 2, s, s);
        if (c === focus && c !== w.player) {
          // the car being watched wears a ring
          ctx.strokeStyle = '#ffd24a';
          ctx.lineWidth = 1.5 * u;
          const r = s / 2 + 2.5 * u;
          ctx.strokeRect(mx + 4 + c.x * m.k - r, my + 4 + c.y * m.k - r, r * 2, r * 2);
        }
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
          c === w.player ? '#ffd24a' : c === focus ? '#7fe0ff' : c.wrecked ? '#999' : '#fff',
          'right',
        );
        y += 13 * u;
      }
    }

    // what the world is doing: a chip for each modifier that is on
    if (w.mods.length) {
      ctx.font = `900 ${Math.round(10 * u)}px system-ui, sans-serif`;
      const gap = 6 * u;
      const widths = w.mods.map((m) => ctx.measureText(m.def.label).width + 12 * u);
      let x = W / 2 - (widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1)) / 2;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      w.mods.forEach((m, i) => {
        const bw = widths[i]!;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(x, pad, bw, 16 * u);
        ctx.fillStyle = m.def.colour;
        ctx.fillRect(x, pad + 14 * u, bw, 2 * u);
        ctx.fillText(m.def.label, x + bw / 2, pad + 7.5 * u);
        x += bw + gap;
      });
      ctx.textBaseline = 'top';
    }

    // big centre messages
    ctx.textBaseline = 'middle';
    if (w.phase === 'countdown') {
      const n = Math.ceil(w.countdown);
      if (n <= 3) text(String(n), W / 2, H * 0.36, font(64), '#ffd24a', 'center');
      else text(w.venue.meta.name.toUpperCase(), W / 2, H * 0.36, font(30), '#fff', 'center');
    }
    if (fx.msgT > 0 && fx.msg) text(fx.msg, W / 2, H * 0.3, font(34), '#ffd24a', 'center');
    // off the course in a race: how long there is to get back before the car is put back
    const back = rescueIn(w, w.player);
    if (back > 0 && !w.player.wrecked) {
      text('GET BACK ON THE ROAD', W / 2, H * 0.22, font(26), '#ff9a4a', 'center');
      text(String(Math.ceil(back)), W / 2, H * 0.38, font(64), '#ffd24a', 'center');
    }
    // a trick that takes the wheel out of your hands says so for as long as it lasts
    const T = w.player.tricks;
    if (!w.player.wrecked) {
      if (T.dizzy) text('DIZZY: STEERING SWAPPED', W / 2, H * 0.2, font(24), '#ffe870', 'center');
      else if (T.balloons) text('UP IN THE AIR', W / 2, H * 0.2, font(24), '#ff8a96', 'center');
      else if (T.dash) text('GREYHOUND', W / 2, H * 0.2, font(24), '#ffc040', 'center');
    }
    if (this.dial.on) this.speedo(P, W, H, u, text);
    if (w.wrongWay()) text('WRONG WAY!', W / 2, H * 0.42, font(28), '#ff6a5a', 'center');
  }

  /** The speedometer's settings: shown or not, where, how big (game/speedo.ts). */
  dial: DialSetup = { ...DIAL_DEFAULT };

  /** How long each reason has been showing, so a passing bump does not flash a word. */
  private heldT = new Map<number, number>();
  private lastT = 0;

  /**
   * The speedometer (bottom middle unless moved): a fat arc that fills with speed (blue on boost), the number
   * big in it, and under it, in red, whatever is holding the car back.
   */
  private speedo(
    P: Car,
    W: number,
    H: number,
    ui: number,
    text: (
      t: string,
      x: number,
      y: number,
      f: string,
      col?: string,
      align?: CanvasTextAlign,
    ) => void,
  ): void {
    const ctx = this.ctx;
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0, now - this.lastT));
    this.lastT = now;
    // everything on the dial is drawn at its own size
    const u = ui * this.dial.size;
    const r = 40 * u;
    const spot = dialSpot(this.dial.place, W, H, r, ui);
    const cx = spot.x;
    const cy = spot.y;
    const top = BASE_SPEED * P.stats.speed;
    // the dial runs to a boost and a bit over the car's own top speed
    const full = top * 1.45;
    const v = P.wrecked ? 0 : dialSpeed(P);
    const k = Math.min(1, v / full);
    const a0 = Math.PI * 0.8;
    const a1 = Math.PI * 2.2;
    const held = P.wrecked ? 0 : P.held;
    for (const [bit] of HELD_SAYS) {
      const t = this.heldT.get(bit) ?? 0;
      this.heldT.set(bit, held & bit ? t + dt : Math.max(0, Math.min(t, 0.25) - dt));
    }
    const shown = HELD_SAYS.filter(([bit]) => (this.heldT.get(bit) ?? 0) > 0.25);
    const slowed = shown.length > 0;
    ctx.lineCap = 'butt';
    // the plate behind it, so it reads on snow and on tarmac alike
    ctx.beginPath();
    ctx.arc(cx, cy, r + 9 * u, Math.PI * 0.75, Math.PI * 2.25);
    ctx.fillStyle = 'rgba(8,10,14,0.62)';
    ctx.fill();
    // the empty track of the arc, then the speed in it
    ctx.lineWidth = 10 * u;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.stroke();
    // the car's own top speed, a tick on the arc
    const at = a0 + (a1 - a0) * (top / full);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(at) * (r - 8 * u), cy + Math.sin(at) * (r - 8 * u));
    ctx.lineTo(cx + Math.cos(at) * (r + 8 * u), cy + Math.sin(at) * (r + 8 * u));
    ctx.lineWidth = 2.5 * u;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.stroke();
    if (k > 0.005) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0, a0 + (a1 - a0) * k);
      ctx.lineWidth = 10 * u;
      ctx.strokeStyle = P.boosting
        ? '#4fb8ff'
        : slowed
          ? '#ff5a3c'
          : k > 0.6
            ? '#ffd24a'
            : '#5fd35a';
      ctx.stroke();
    }
    ctx.textBaseline = 'middle';
    text(
      String(v),
      cx,
      cy - 2 * u,
      `900 ${Math.round(26 * u)}px system-ui, sans-serif`,
      slowed ? '#ff9a7a' : '#fff',
      'center',
    );
    text(
      'KM/H',
      cx,
      cy + 17 * u,
      `800 ${Math.round(9 * u)}px system-ui, sans-serif`,
      '#cfd6e0',
      'center',
    );
    if (slowed) {
      // why it is slow, in a red chip above the dial that pulses so it is seen out of the eye's corner
      const say = shown.map(([, s]) => s).join(' · ');
      ctx.font = `900 ${Math.round(12 * u)}px system-ui, sans-serif`;
      const bw = ctx.measureText(say).width + 16 * u;
      const by = spot.below ? cy + r * 0.75 + 4 * u : cy - r - 32 * u;
      const pulse = 0.75 + 0.25 * Math.sin(now * 8);
      ctx.fillStyle = `rgba(200,34,20,${(0.85 * pulse).toFixed(3)})`;
      // (kept on the screen when the dial is in a corner)
      const bx = Math.min(W - bw / 2 - 4 * ui, Math.max(bw / 2 + 4 * ui, cx));
      ctx.fillRect(bx - bw / 2, by, bw, 19 * u);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(say, bx, by + 10 * u);
    }
    ctx.textBaseline = 'top';
  }
}

/** What the tricks at work on a car are called on the status line. */
function trickLabels(c: Car): string[] {
  const T = c.tricks;
  const s = (t: number) => `${Math.ceil(t)}s`;
  return [
    T.balloons ? `BALLOONS ${s(T.balloons.t)}` : '',
    T.dash ? `GREYHOUND ${s(T.dash.t)}` : '',
    T.splat ? `MUDDY ${s(T.splat.t)}` : '',
    T.dizzy ? `DIZZY ${s(T.dizzy.t)}` : '',
    T.pair ? `MAGNET ${s(T.pair.t)}` : '',
    T.bumper ? `BOUNCY ${s(T.bumper.t)}` : '',
    T.ghost ? `GHOST ${s(T.ghost.t)}` : '',
  ];
}
