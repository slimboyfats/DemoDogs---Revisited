import { ADDON_KINDS, BASE_SPEED, GUARD_KINDS, HELD } from '@demodogs/shared';
import { haunting, rescueIn, type Car, type World } from '@demodogs/sim';
import type { Effects } from './effects';
import { DIAL_DEFAULT, dialSpot, type DialSetup } from '../game/speedo';

const TAU = Math.PI * 2;
/** The HUD's colours, the menus' own (theme.css): an ink line round everything, paper and sun. */
const INK = '#1b2233';
const PAPER = '#fff8e6';
const SUN = '#ffd23f';

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
  [HELD.wet, 'WADING'],
  [HELD.hot, 'IN THE LAVA!'],
  [HELD.sticky, 'STUCK IN THE MUCK'],
  [HELD.rough, 'OFF ROAD'],
  [HELD.hill, 'UPHILL'],
  [HELD.fresh, 'FINDING ITS FEET'],
  [HELD.weighed, 'WEIGHED DOWN'],
  [HELD.hurt, 'DAMAGED'],
];

/** How far a dial at the bottom is lifted to clear the spectator's bar (CSS px). */
const WATCH_BAR = 66;

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
  /**
   * What this race is being run for, in a few words beside the clock (a tournament's target time,
   * the car with the bounty on it), or null for none.
   */
  aim: ((w: World) => { text: string; colour: string } | null) | null = null;

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
    // a plate with round corners and an ink line round it
    const e = 1.5 * dpr;
    g.beginPath();
    g.roundRect(e, e, cv.width - e * 2, cv.height - e * 2, 9 * dpr);
    g.fillStyle = 'rgba(27,34,51,0.5)';
    g.fill();
    g.lineWidth = e * 2;
    g.strokeStyle = INK;
    g.stroke();
    g.translate(4, 4);
    const T = w.track;
    if (T) {
      g.beginPath();
      for (let i = 0; i < T.n; i++) {
        if (i) g.lineTo(T.x[i]! * k, T.y[i]! * k);
        else g.moveTo(T.x[i]! * k, T.y[i]! * k);
      }
      g.closePath();
      g.lineJoin = 'round';
      const lw = Math.max(2 * dpr, w.road * k * 0.6);
      g.strokeStyle = INK;
      g.lineWidth = lw + 2 * dpr;
      g.stroke();
      g.strokeStyle = PAPER;
      g.lineWidth = lw;
      g.stroke();
    }
    const O = w.oval;
    if (O) {
      g.beginPath();
      g.ellipse(O.cx * k, O.cy * k, O.rx * k, O.ry * k, 0, 0, TAU);
      g.fillStyle = 'rgba(255,248,230,0.55)';
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 1.5 * dpr;
      g.stroke();
    }
    this.mini = { cv, k };
  }

  /** `focus` is the car the readouts are about: this screen's own, or the one being watched. */
  draw(w: World, fx: Effects, W: number, H: number, u: number, focus: Car = w.player): void {
    const ctx = this.ctx;
    const P = focus;
    const pad = 12 * u;
    const left = pad + 56 * u;
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
      // an ink line round every letter, with round corners, and a hard shadow under the big ones
      let px = parseFloat(f.slice(f.indexOf(' ') + 1));
      if (align === 'center') {
        // words across the middle are made to fit a narrow (upright) screen
        const over = ctx.measureText(t).width / (W - 28 * u);
        if (over > 1) {
          px = Math.floor(px / over);
          ctx.font = `900 ${px}px system-ui, sans-serif`;
        }
      }
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(3.5 * u, px * 0.24);
      ctx.strokeStyle = INK;
      if (px >= 18 * u) ctx.strokeText(t, x, y + px * 0.09);
      ctx.strokeText(t, x, y);
      ctx.fillStyle = col;
      ctx.fillText(t, x, y);
    };
    /** A pill: round ends, an ink line, filled. */
    const pill = (x: number, y: number, bw: number, bh: number, fill: string, line = 2 * u) => {
      ctx.beginPath();
      ctx.roundRect(x, y, bw, bh, bh / 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = line;
      ctx.strokeStyle = INK;
      ctx.stroke();
    };
    const bar = (y: number, v: number, col: string, label: string) => {
      const bw = 124 * u;
      const bh = 15 * u;
      pill(left, y, bw, bh, 'rgba(27,34,51,0.55)');
      const k = Math.min(1, Math.max(0, v));
      if (k > 0) {
        // the fill keeps the pill's round end
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(left + u, y + u, bw - 2 * u, bh - 2 * u, bh / 2);
        ctx.clip();
        ctx.fillStyle = col;
        ctx.fillRect(left, y, bw * k, bh);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(left, y + u, bw * k, 4 * u);
        ctx.restore();
      }
      ctx.textBaseline = 'middle';
      text(
        label,
        left + 8 * u,
        y + bh / 2 + 0.5,
        `900 ${Math.round(9 * u)}px system-ui, sans-serif`,
      );
      ctx.textBaseline = 'top';
    };

    ctx.textBaseline = 'top';
    const st = w.standings();
    // the place (or how many are left) on a badge of its own, the lap and the clock beside it
    const badge = (t: string): number => {
      ctx.font = font(22);
      const bw = ctx.measureText(t).width + 20 * u;
      const bh = 32 * u;
      ctx.beginPath();
      ctx.roundRect(left, pad + 3 * u, bw, bh, 10 * u);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(left, pad, bw, bh, 10 * u);
      ctx.fillStyle = SUN;
      ctx.fill();
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, left + bw / 2, pad + bh / 2 + u);
      ctx.textBaseline = 'top';
      return left + bw + 9 * u;
    };
    if (w.kind === 'race') {
      const x = badge(placeName(st.indexOf(P) + 1));
      text(`LAP ${Math.min(Math.max(P.lap, 1), w.laps)}/${w.laps}`, x, pad + 2 * u, small);
      text(fmtTime(w.raceTime), x, pad + 18 * u, small, '#e3ecf7');
      // a tournament's aim for this round, beside the lap
      const aim = this.aim?.(w);
      if (aim) text(aim.text, x + 64 * u, pad + 2 * u, small, aim.colour);
    } else {
      const x = badge(`${w.cars.filter((c) => !c.wrecked).length} LEFT`);
      text(
        fmtTime(Math.max(0, w.timeLeft)),
        x,
        pad + 2 * u,
        small,
        w.timeLeft < 20 ? '#ff8f80' : '#fff',
      );
    }
    // (watching, the gauges are the watched car's, so they wear its name)
    const watching = P !== w.player;
    if (watching) text(`${P.name} · SCORE ${P.score}`, left, pad + 42 * u, small, '#7fe0ff');
    else text(`SCORE ${P.score}`, left, pad + 42 * u, small);
    bar(
      pad + 60 * u,
      P.hp / 100,
      P.hp > 50 ? '#5fd35a' : P.hp > 25 ? '#f0b52c' : '#ff5b4a',
      'ARMOR',
    );
    bar(pad + 79 * u, P.nitro, '#4fb8ff', 'BOOST');
    if (P.gun)
      text(`AMMO ${P.rounds}`, left, pad + 99 * u, small, P.rounds > 0 ? '#fff' : '#ff8f80');
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
    if (fitted) text(fitted, left, pad + (P.gun ? 115 : 99) * u, small, SUN);

    const m = this.mini;
    if (m) {
      const mx = W - m.cv.width - pad;
      const my = pad;
      ctx.drawImage(m.cv, mx, my);
      for (const c of w.cars) {
        if (c.wrecked && w.kind === 'derby') continue;
        // round dots with an ink line; this screen's own car bigger and white
        const s = (c === w.player ? 7 : 5) * u;
        ctx.beginPath();
        ctx.arc(mx + 4 + c.x * m.k, my + 4 + c.y * m.k, s / 2, 0, TAU);
        ctx.fillStyle = c === w.player ? '#fff' : c.paint;
        ctx.fill();
        ctx.lineWidth = 1.2 * u;
        ctx.strokeStyle = INK;
        ctx.stroke();
        if (c === focus && c !== w.player) {
          // the car being watched wears a ring
          ctx.strokeStyle = SUN;
          ctx.lineWidth = 1.5 * u;
          ctx.beginPath();
          ctx.arc(mx + 4 + c.x * m.k, my + 4 + c.y * m.k, s / 2 + 2.5 * u, 0, TAU);
          ctx.stroke();
        }
      }
      // standings under the minimap
      let y = pad + m.cv.height + 6 * u;
      // (six rows: of a bigger field, the six round this screen's car)
      const from = Math.max(0, Math.min(st.length - 6, st.indexOf(focus ?? w.player) - 3));
      for (let i = from; i < Math.min(from + 6, st.length); i++) {
        const c = st[i]!;
        ctx.beginPath();
        ctx.roundRect(W - pad - 9 * u, y + 1.5 * u, 8 * u, 9 * u, 2.5 * u);
        ctx.fillStyle = c.paint;
        ctx.fill();
        ctx.lineWidth = 1.2 * u;
        ctx.strokeStyle = INK;
        ctx.stroke();
        const out = c.wrecked && w.kind === 'derby';
        text(
          `${i + 1} ${c.name}${out ? ' ✕' : ''}`,
          W - pad - 13 * u,
          y,
          `900 ${Math.round(10.5 * u)}px system-ui, sans-serif`,
          c === w.player ? SUN : c === focus ? '#7fe0ff' : c.wrecked ? '#b9bfcc' : '#fff',
          'right',
        );
        y += 14 * u;
      }
    }

    // what the world is doing: a chip for each modifier that is on
    if (w.mods.length) {
      ctx.font = `900 ${Math.round(10 * u)}px system-ui, sans-serif`;
      const gap = 6 * u;
      const widths = w.mods.map((m) => ctx.measureText(m.def.label).width + 16 * u);
      let x = W / 2 - (widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1)) / 2;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      w.mods.forEach((m, i) => {
        const bw = widths[i]!;
        pill(x, pad, bw, 17 * u, m.def.colour);
        ctx.fillStyle = INK;
        ctx.fillText(m.def.label, x + bw / 2, pad + 9 * u);
        x += bw + gap;
      });
      ctx.textBaseline = 'top';
    }

    // big centre messages
    ctx.textBaseline = 'middle';
    if (w.phase === 'countdown') {
      const n = Math.ceil(w.countdown);
      if (n <= 3) text(String(n), W / 2, H * 0.36, font(72), SUN, 'center');
      else text(w.venue.meta.name.toUpperCase(), W / 2, H * 0.36, font(30), '#fff', 'center');
    }
    if (fx.msgT > 0 && fx.msg) text(fx.msg, W / 2, H * 0.3, font(34), SUN, 'center');
    // off the course in a race: how long there is to get back before the car is put back
    const back = rescueIn(w, w.player);
    if (back > 0 && !w.player.wrecked) {
      text('GET BACK ON THE ROAD', W / 2, H * 0.22, font(26), '#ff9a4a', 'center');
      text(String(Math.ceil(back)), W / 2, H * 0.38, font(64), SUN, 'center');
    }
    // a trick that takes the wheel out of your hands says so for as long as it lasts
    const T = w.player.tricks;
    if (!w.player.wrecked) {
      if (T.dizzy) text('DIZZY: STEERING SWAPPED', W / 2, H * 0.2, font(24), '#ffe870', 'center');
      else if (T.balloons) text('UP IN THE AIR', W / 2, H * 0.2, font(24), '#ff8a96', 'center');
      else if (T.dash) text('COMET', W / 2, H * 0.2, font(24), '#ffc040', 'center');
    }
    if (this.dial.on) this.speedo(P, W, H, u, text, watching);
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
    /** Looking on at another car: the bar along the bottom is there, so the dial stands over it. */
    watching = false,
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
    const cy = spot.y - (watching && !spot.below ? WATCH_BAR * ui : 0);
    const top = BASE_SPEED * P.stats.speed;
    // the dial runs to a boost and a bit over the car's own top speed
    const full = top * 1.45;
    const v = P.wrecked && !haunting(P) ? 0 : dialSpeed(P);
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
    // the plate behind it, so it reads on snow and on tarmac alike, with an ink line round it
    ctx.beginPath();
    ctx.arc(cx, cy, r + 10 * u, Math.PI * 0.75, Math.PI * 2.25);
    ctx.closePath();
    ctx.fillStyle = 'rgba(27,34,51,0.62)';
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = INK;
    ctx.stroke();
    // the empty track of the arc with round ends, then the speed in it
    ctx.lineCap = 'round';
    ctx.lineWidth = 10 * u;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.stroke();
    ctx.lineCap = 'butt';
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
      ctx.lineCap = 'round';
      ctx.lineWidth = 10 * u;
      ctx.strokeStyle = P.boosting ? '#4fb8ff' : slowed ? '#ff5a3c' : k > 0.6 ? SUN : '#5fd35a';
      ctx.stroke();
      ctx.lineCap = 'butt';
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
      // (kept on the screen when the dial is in a corner)
      const bx = Math.min(W - bw / 2 - 4 * ui, Math.max(bw / 2 + 4 * ui, cx));
      ctx.beginPath();
      ctx.roundRect(bx - bw / 2, by, bw, 19 * u, 9.5 * u);
      ctx.fillStyle = `rgba(232,52,34,${(0.95 * pulse).toFixed(3)})`;
      ctx.fill();
      ctx.lineWidth = 2 * u;
      ctx.strokeStyle = INK;
      ctx.stroke();
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
    T.dash ? `COMET ${s(T.dash.t)}` : '',
    T.splat ? `MUDDY ${s(T.splat.t)}` : '',
    T.dizzy ? `DIZZY ${s(T.dizzy.t)}` : '',
    T.pair ? `MAGNET ${s(T.pair.t)}` : '',
    T.bumper ? `BOUNCY ${s(T.bumper.t)}` : '',
    T.ghost ? `GHOST ${s(T.ghost.t)}` : '',
  ];
}
